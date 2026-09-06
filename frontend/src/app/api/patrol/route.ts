/**
 * THE SENTINEL — the patrol bot, and the thing that makes this project agentic.
 *
 *   GET /api/patrol            walk the queue, file challenges
 *   GET /api/patrol?dry=1      walk the queue, file nothing, report what it would
 *   GET /api/patrol?limit=5    cap how many agents are examined this run
 *
 * Runs on Vercel Cron (see vercel.json) and from the "Run patrol" button on
 * /patrol. There is no separate backend; this route IS the bot.
 *
 * ## What it does, and what it deliberately does not
 *
 * It reads the contract's patrol queue (least-recently-checked first), fetches
 * each agent's recent transactions from Blockscout, applies the mechanical
 * checks in lib/heuristics.ts, and files a challenge on any transaction that
 * visibly contradicts a rule it can actually evaluate.
 *
 * It does NOT decide whether the mandate was broken. Filing a challenge stakes
 * real GEN that the bot LOSES if the challenge is refuted, and five GenLayer
 * validators — not this file — read the mandate as prose and return the verdict.
 * The bot is an accuser that pays to accuse.
 *
 * ## Safety properties
 *
 *   - The signing key is server-side only and never reaches the browser.
 *   - `dry=1` is the default for an unauthenticated caller, so a public URL can
 *     never spend the bot's stake.
 *   - A transient explorer failure (5xx / 429) SKIPS that agent rather than
 *     clearing it. Base answered 500 to everything for a whole day during the
 *     probe; treating that as "no violations" would be the worst possible bug
 *     in a watchdog, because it is silent and looks like success.
 *   - Every candidate is checked against `is_tx_challenged` first, so the bot
 *     does not burn a transaction re-filing something already judged.
 */
import { NextResponse } from "next/server";
import { createClient, createAccount } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { recentTransactions, oneTransaction, TransientBlockscout } from "@/lib/blockscout";
import { flagsFor, reasonText } from "@/lib/heuristics";
import type { PatrolReport, PatrolRow } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAINS = { studionet, bradbury: testnetBradbury } as const;

/** Per-run ceilings. A cron slot is not infinite and neither is the gas budget. */
const MAX_AGENTS = 12;
const MAX_TX_PER_AGENT = 20;
const MAX_CHALLENGES_PER_RUN = 3;
/**
 * How far back a patrol looks, regardless of `last_checked`.
 *
 * `last_checked` is an ORDERING hint, not a watermark. The contract stamps it
 * whenever a challenge is filed against the agent too, so using it as a hard
 * cutoff would let one challenge blind the bot to every earlier transaction it
 * had never actually examined. Duplicate work is prevented by
 * `is_tx_challenged`, which is the real and reliable guard.
 */
const LOOKBACK_SECONDS = 14 * 24 * 3600;
/** Candidates enriched with a second per-transaction fetch, per agent. */
const MAX_ENRICH_PER_AGENT = 8;

function authorised(req: Request): boolean {
  const secret = process.env.PATROL_SECRET;
  // Vercel Cron identifies itself with this header and cannot be spoofed from
  // outside, because the platform strips it from inbound public requests.
  if (req.headers.get("x-vercel-cron")) return true;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  const started = Date.now();
  const url = new URL(req.url);
  const networkName = (process.env.NEXT_PUBLIC_NETWORK ?? "studionet") as keyof typeof CHAINS;
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;
  const key = process.env.PATROL_PRIVATE_KEY;
  const notes: string[] = [];

  /*
   * Who may spend the bot's stake.
   *
   * A TRUSTED caller (Vercel Cron, or a bearer token matching PATROL_SECRET)
   * files for real unless it asks for `?dry=1`. Everyone else gets a dry run
   * whatever they ask for — the "Run patrol" button on /patrol is public, and a
   * public URL must never be able to spend real GEN.
   */
  const trusted = authorised(req);
  const askedDry = url.searchParams.get("dry");
  let dryRun = trusted ? askedDry === "1" : true;
  if (!trusted && askedDry === "0") {
    notes.push("Unauthenticated caller — forced to a dry run. Send PATROL_SECRET as a bearer token to file for real.");
  }

  const chain = CHAINS[networkName];
  if (!chain || !address) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_NETWORK / NEXT_PUBLIC_CONTRACT_ADDRESS are not configured" },
      { status: 500 },
    );
  }

  const read = createClient({ chain });
  const view = async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
    const raw = await read.readContract({ address, functionName: fn, args: args as never });
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  };

  let wallet: ReturnType<typeof createClient> | null = null;
  let botAddress: string | null = null;
  if (!dryRun) {
    if (!key) {
      dryRun = true;
      notes.push("PATROL_PRIVATE_KEY is not set — falling back to a dry run.");
    } else {
      const account = createAccount(key as `0x${string}`);
      botAddress = account.address;
      wallet = createClient({ chain, account });
    }
  }

  const limit = Math.min(
    MAX_AGENTS,
    Math.max(1, Number(url.searchParams.get("limit") ?? MAX_AGENTS) || MAX_AGENTS),
  );

  let queue: { queue: { agent_id: number; wallet: string; chain: string; mandate?: string; last_checked: number }[] };
  try {
    queue = await view("get_patrol_queue", [limit]);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `could not read the patrol queue: ${String((e as Error)?.message ?? e)}` },
      { status: 502 },
    );
  }

  const cfg = await view<{ challenge_stake: string; challenge_cooldown: number }>("get_config")
    .catch(() => null);
  const stake = cfg ? BigInt(cfg.challenge_stake) : 0n;
  /**
   * The contract rate limits challenges PER WALLET, and the bot is one wallet.
   * Filing back to back means every challenge after the first is refused and
   * refunded — a successful transaction that did nothing. So the bot waits out
   * its own cooldown between filings, and stops for this run when the time
   * budget cannot cover another wait.
   */
  const cooldownMs = ((cfg?.challenge_cooldown ?? 60) + 4) * 1000;
  let lastFiledAt = 0;

  const rows: PatrolRow[] = [];
  const patrolled: number[] = [];
  let scannedTotal = 0;
  let filedTotal = 0;

  for (const agent of queue.queue ?? []) {
    const row: PatrolRow = {
      agent_id: agent.agent_id,
      wallet: agent.wallet,
      chain: agent.chain as PatrolRow["chain"],
      scanned: 0,
      skipped_already_challenged: 0,
      flagged: [],
    };

    let txs;
    try {
      txs = await recentTransactions(agent.chain, agent.wallet);
    } catch (e) {
      // A transient explorer failure SKIPS this agent. It does not clear it,
      // and it does not stamp last_checked — so the next run tries again rather
      // than treating an outage as a clean bill of health.
      row.error = e instanceof TransientBlockscout
        ? `explorer unavailable (${e.message}) — skipped, not cleared`
        : String((e as Error)?.message ?? e);
      rows.push(row);
      continue;
    }

    const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
    const fresh = txs
      .filter((t) => t.epoch === 0 || t.epoch >= cutoff)
      .slice(0, MAX_TX_PER_AGENT);
    row.scanned = fresh.length;
    scannedTotal += fresh.length;
    patrolled.push(agent.agent_id);

    const mandate = agent.mandate ?? "";

    /*
     * The list endpoint returns `token_transfers: null` on EVERY row — a
     * measured asymmetry, not an oversight of this code. So a transaction that
     * touched a contract is re-fetched by hash to see which tokens actually
     * moved; without it the unlisted-token rule can never fire, and that rule
     * is the whole motivating example.
     *
     * These are independent reads, so they go out TOGETHER. Sequentially they
     * were the run: twelve agents at eight enrichments each is ninety-six
     * round trips one after another, which measured 236s against this route's
     * 300s ceiling — a patrol that would start failing as the register grew,
     * and time out in front of anyone who pressed the button. Concurrency is
     * bounded by MAX_ENRICH_PER_AGENT and one agent is in flight at a time, so
     * this never opens more than eight sockets to one explorer.
     */
    const toEnrich = fresh.filter((t) => t.toIsContract).slice(0, MAX_ENRICH_PER_AGENT);
    const enriched = new Map<string, (typeof fresh)[number]>();
    await Promise.all(
      toEnrich.map(async (listRow) => {
        try {
          const full = await oneTransaction(agent.chain, listRow.hash);
          if (full) enriched.set(listRow.hash, full);
        } catch {
          // A transient failure on ONE transaction is not a reason to abandon
          // the agent; judge what the list already showed.
        }
      }),
    );

    for (const listRow of fresh) {
      const tx = enriched.get(listRow.hash) ?? listRow;
      const flags = flagsFor(tx, mandate, agent.chain);
      if (flags.length === 0) continue;

      const known = await view<{ challenged: boolean }>("is_tx_challenged", [agent.chain, tx.hash])
        .catch(() => ({ challenged: false }));
      if (known.challenged) {
        row.skipped_already_challenged++;
        continue;
      }

      const reason = reasonText(flags);
      if (dryRun || !wallet || filedTotal >= MAX_CHALLENGES_PER_RUN) {
        row.flagged.push({ tx_hash: tx.hash, reason, filed: false });
        continue;
      }

      // Wait out the bot's own rate limit, or stop if the budget cannot cover it.
      const waitFor = lastFiledAt ? Math.max(0, cooldownMs - (Date.now() - lastFiledAt)) : 0;
      if (waitFor > 0) {
        if (Date.now() - started + waitFor > 230_000) {
          row.flagged.push({ tx_hash: tx.hash, reason, filed: false,
            error: "deferred to the next patrol — the per-wallet cooldown does not fit in this run" });
          continue;
        }
        await new Promise((r) => setTimeout(r, waitFor));
      }

      try {
        const hash = await wallet.writeContract({
          address, functionName: "challenge_agent",
          args: [agent.agent_id, tx.hash, reason], value: stake,
        });
        const deadline = Date.now() + 150_000;
        let terminal = false;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 4000));
          const tx2 = await read.getTransaction({ hash: hash as TransactionHash }).catch(() => null);
          const st = (tx2 as { status?: number })?.status;
          const name = typeof st === "number"
            ? ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"][st]
            : "";
          if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"].includes(name ?? "")) {
            terminal = name === "ACCEPTED" || name === "FINALIZED";
            break;
          }
        }
        lastFiledAt = Date.now();

        /*
         * A SETTLED TRANSACTION IS NOT A FILED CHALLENGE.
         *
         * challenge_agent refunds rather than reverting when it turns something
         * down, so a rejection arrives as a perfectly successful transaction.
         * Reading tx status alone reported four challenges filed when the
         * contract had accepted one and refunded three under the cooldown.
         *
         * Bradbury does not return a readable value either, so the only
         * authority is the contract's own state — read it back.
         */
        const confirmed = terminal
          ? await view<{ challenged: boolean }>("is_tx_challenged", [agent.chain, tx.hash])
              .catch(() => ({ challenged: false }))
          : { challenged: false };

        row.flagged.push({
          tx_hash: tx.hash, reason, filed: confirmed.challenged,
          ...(confirmed.challenged
            ? {}
            : { error: terminal
                ? "the contract turned it down and refunded the stake"
                : "submitted but did not settle in 150s" }),
        });
        if (confirmed.challenged) filedTotal++;
      } catch (e) {
        row.flagged.push({ tx_hash: tx.hash, reason, filed: false,
          error: String((e as Error)?.message ?? e) });
      }
    }
    rows.push(row);
  }

  // Stamp what was actually examined, so the next run starts where this one
  // stopped. Only agents whose explorer ANSWERED are stamped.
  if (!dryRun && wallet && patrolled.length > 0) {
    try {
      await wallet.writeContract({
        address, functionName: "mark_patrolled", args: [patrolled], value: 0n,
      });
    } catch (e) {
      notes.push(`mark_patrolled failed: ${String((e as Error)?.message ?? e)}`);
    }
  }

  if (dryRun) notes.push("Dry run — nothing was filed on chain.");
  if (botAddress) notes.push(`Filing as ${botAddress}.`);

  const report: PatrolReport = {
    ok: true,
    started_at: new Date(started).toISOString(),
    finished_at: new Date().toISOString(),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    network: networkName,
    contract: address,
    patrolled: rows.length,
    transactions_scanned: scannedTotal,
    challenges_filed: filedTotal,
    dry_run: dryRun,
    rows,
    notes,
  };
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
