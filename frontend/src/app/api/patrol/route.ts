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
import { studioDevnet } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { recentTransactions, oneTransaction, TransientBlockscout } from "@/lib/blockscout";
import { flagsFor, reasonText, learnedFrom, withholdLearned } from "@/lib/heuristics";
import type { SettledChallenge } from "@/lib/heuristics";
import type { PatrolReport, PatrolRow } from "@/types";

export const dynamic = "force-dynamic";
/**
 * MEASURED, not assumed: raising this to 800 changed nothing — two runs were cut
 * off at exactly 300.02s — so this deployment is held at 300s whatever the
 * export says. Everything below budgets against that number rather than wishing
 * for a bigger one.
 */
export const maxDuration = 300;

const CHAINS = { studiodev: studioDevnet } as const;

/**
 * The stake the contract ships with, in wei, used ONLY to warn about an
 * underfunded patrol wallet before `get_config` has been read. The authoritative
 * figure is `get_config().challenge_stake` and that is what is actually sent —
 * this is a floor for a diagnostic, never a value spent.
 */
const CHALLENGE_STAKE_FLOOR = 50_000_000_000_000_000n;

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
/**
 * Judgement is the valuable half of the job: a challenge that is filed and
 * never judged moves no money and proves nothing. resolve_challenge runs the
 * five-validator round on chain, so it is slow and its cost is wall clock, not
 * gas. These ceilings keep a run inside maxDuration; whatever does not fit is
 * left PENDING and picked up by the next run, which is safe because
 * resolve_challenge is permissionless and idempotent on an already-settled
 * challenge.
 */
const MAX_RESOLVES_PER_RUN = 2;
const RESOLVE_POLL_MS = 85_000;
/**
 * The three gates that keep a run inside 300s, in the order they bite.
 *
 * A patrol has three jobs and they are not equally valuable. Judging what is
 * already filed moves money and settles a dispute; scanning finds work; filing
 * creates work. So the budget is spent in that order, and each gate stops NEW
 * work early enough that whatever is already in flight can still finish.
 *
 * Nothing is lost by stopping: resolve_challenge is permissionless and
 * idempotent, is_tx_challenged prevents a duplicate filing, and the next run is
 * ten minutes away.
 */
const RESOLVE_UNTIL_MS = 150_000;   // start no new judgement after this
const SCAN_UNTIL_MS = 200_000;      // examine no new agent after this
const FILE_UNTIL_MS = 230_000;      // file nothing new after this
/** Kept for the cooldown-deferral check, which reasons about the same ceiling. */
const BUDGET_MS = FILE_UNTIL_MS;

/**
 * Every await in this file talks to a chain or an explorer over the network,
 * and an await with no ceiling is how a serverless function dies at the
 * platform limit with nothing in the log to say where. Wrap the slow ones.
 */
/**
 * The node throttles writes, and it says so precisely: "transaction gas rate
 * limit exceeded: node is at capacity, retry in ~1295ms". Submitting straight
 * through that is how a patrol filed nothing, judged nothing and — because
 * mark_patrolled was refused along with everything else — left `patrols_run`
 * unmoved while every other signal said the run had succeeded.
 *
 * So a write that is REFUSED FOR CAPACITY is retried, honouring the delay the
 * node asks for. A write refused for any other reason is a real failure and is
 * returned as one.
 */
const RATE_LIMITED = /at capacity|rate limit|exceeds defined limit|too many requests/i;

/**
 * Whether this network charges for a write, read once per run.
 *
 * This route was written against Bradbury, which does not. Studio Dev does:
 * `getCurrentFeePolicy()` reports `enabled: true`, and the chain exposes no
 * `feeManagerContract`, so the SDK derives the deposit from the local
 * round-fee calculation. A `writeContract` with no `fees` sends a zero-fee
 * transaction and the consensus contract refuses it — which is why the patrol
 * could file nothing here while every off-chain part of the run looked healthy.
 *
 * Cached per run rather than per write: it is one more RPC round trip on a
 * route that budgets against a hard 300s ceiling, and the policy does not move
 * inside a single patrol.
 */
let feePolicyEnabled: boolean | null = null;

async function feesRequired(w: ReturnType<typeof createClient>): Promise<boolean> {
  if (feePolicyEnabled !== null) return feePolicyEnabled;
  try {
    const policy = await withTimeout(w.getCurrentFeePolicy(), 20_000, "fee policy");
    feePolicyEnabled = Boolean(policy?.enabled);
  } catch (e) {
    // Unknown is not "free". Assuming no fees on a chain that charges them is
    // the failure this whole block exists to stop, so assume they are needed
    // and let the estimate below say so precisely if it cannot be produced.
    console.log(`[patrol] fee policy unreadable (${String((e as Error)?.message ?? e).slice(0, 90)}), assuming fees ARE required`);
    feePolicyEnabled = true;
  }
  return feePolicyEnabled;
}

/**
 * The fee deposit for one write, estimated against the real calldata.
 *
 * Estimated per call rather than once per run because the deposit depends on
 * the method and its arguments — `mark_patrolled` with twelve agent ids is not
 * the same shape as `challenge_agent` with a reason string, and a flat guess
 * would either underfund the large ones or overcharge every small one.
 */
async function estimateFees(
  w: ReturnType<typeof createClient>,
  args: Parameters<ReturnType<typeof createClient>["writeContract"]>[0],
  label: string,
) {
  return withTimeout(
    w.estimateTransactionFeesForWrite({
      address: args.address,
      functionName: args.functionName,
      args: args.args,
      value: args.value ?? 0n,
    }),
    30_000,
    `${label} fee estimate`,
  );
}

async function writeWithRetry(
  w: ReturnType<typeof createClient>,
  args: Parameters<ReturnType<typeof createClient>["writeContract"]>[0],
  label: string,
  attempts = 4,
): Promise<string> {
  // Estimated once, outside the retry loop: a capacity refusal does not change
  // what the transaction costs, and re-estimating on every attempt would add an
  // RPC round trip to exactly the path that is already being throttled.
  let fees: Awaited<ReturnType<typeof estimateFees>> | undefined;
  if (await feesRequired(w)) {
    fees = await estimateFees(w, args, label);
    console.log(`[patrol] ${label} fee deposit ${fees.feeValue} wei`);
  }
  const withFees = fees ? { ...args, fees } : args;

  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return (await withTimeout(w.writeContract(withFees), 45_000, `${label} submit`)) as string;
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      if (!RATE_LIMITED.test(msg)) throw e;
      // The node names its own backoff; trust it, with a floor and some growth.
      const asked = Number(msg.match(/retry in ~(\d+)\s*ms/i)?.[1] ?? 0);
      const wait = Math.min(12_000, Math.max(1_500, asked * 2) * i);
      console.log(`[patrol] ${label} rate-limited (attempt ${i}/${attempts}), waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Who is allowed to spend the bot's stake, and — just as important — WHY not.
 *
 * The previous version compared the header to `Bearer ${secret}` with ===, and
 * a caller that got the scheme's capitalisation wrong, or wrapped the token in
 * whitespace, failed that test and was silently demoted to a dry run. A dry run
 * still answers 200 with a full report, so an external scheduler recorded a
 * SUCCESSFUL execution while `mark_patrolled` was never reached and
 * `patrols_run` stayed where it was. That is the worst kind of failure: it
 * looks exactly like success from the outside.
 *
 * So: the scheme is matched case-insensitively, the token is trimmed, a bare
 * token with no scheme is accepted, and `x-patrol-secret` works too. The reason
 * for a refusal is returned so it can be logged — lengths only, never the
 * token itself.
 */
function authorised(req: Request): { ok: boolean; why: string } {
  const secret = process.env.PATROL_SECRET;
  // Vercel Cron identifies itself with this header and cannot be spoofed from
  // outside, because the platform strips it from inbound public requests.
  if (req.headers.get("x-vercel-cron")) return { ok: true, why: "x-vercel-cron header" };
  if (!secret) return { ok: false, why: "PATROL_SECRET is not set on this deployment" };

  const raw = (req.headers.get("authorization") ?? req.headers.get("x-patrol-secret") ?? "").trim();
  if (!raw) return { ok: false, why: "no authorization or x-patrol-secret header was sent" };

  const m = raw.match(/^bearer\s+(.*)$/i);
  const token = (m ? m[1] : raw).trim();
  if (token === secret) return { ok: true, why: m ? "bearer token" : "bare token" };
  return {
    ok: false,
    why: `token did not match (received ${token.length} chars, expected ${secret.length})`,
  };
}

/**
 * THE DISPATCHER.
 *
 * A full patrol is 200-260s of wall clock. No cron service waits that long —
 * cron-job.org gives up around 30s — so a working patrol still looked like a
 * FAILED execution to the scheduler, and the response never reached the caller
 * that asked for it. Worse, the run was being cut off partway: challenges got
 * filed and then neither judged nor stamped, which is the one state this bot
 * must never leave behind.
 *
 * So a real run is ACKNOWLEDGED immediately and continues in `after()`, which
 * Vercel keeps alive past the response. The scheduler gets its 202 in
 * milliseconds and the work still happens.
 *
 * A dry run stays inline: it files nothing, it is the /patrol button's
 * behaviour, and the page needs the report in its hand.
 */
export async function GET(req: Request) {
  const started = Date.now();
  const url = new URL(req.url);
  const networkName = (process.env.NEXT_PUBLIC_NETWORK ?? "studiodev") as keyof typeof CHAINS;
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
  const auth = authorised(req);
  const trusted = auth.ok;
  const askedDry = url.searchParams.get("dry");
  const dryRun = trusted ? askedDry === "1" : true;
  if (!trusted && askedDry === "0") {
    notes.push("Unauthenticated caller — forced to a dry run. Send PATROL_SECRET as a bearer token to file for real.");
  }
  if (!trusted) notes.push(`Not trusted: ${auth.why}.`);

  // Logged so a scheduler that thinks it is succeeding can be told otherwise:
  // an unauthenticated run answers 200 and never reaches mark_patrolled.
  console.log(`[patrol] START trusted=${trusted} (${auth.why}) dry_run=${dryRun} ` +
    `ua=${(req.headers.get("user-agent") ?? "none").slice(0, 60)}`);

  const chain = CHAINS[networkName];
  if (!chain || !address) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_NETWORK / NEXT_PUBLIC_CONTRACT_ADDRESS are not configured" },
      { status: 500 },
    );
  }

  /*
   * This ran through `after()` for one deployment and it was a mistake worth
   * recording: the 202 came back in a second and the callback NEVER EXECUTED —
   * `[patrol] START` in the logs, then silence, and nothing on chain. Vercel
   * tore the invocation down at the response, because Fluid Compute is off on
   * this project (the same reason `maxDuration = 800` was ignored and runs were
   * still cut at 300s). A scheduler got a clean 202 for a patrol that did
   * nothing at all, which is the exact failure this route already had once.
   *
   * So the work is inline. A caller that gives up early does NOT stop it: a run
   * cut off at the client at 255s had still filed two challenges server-side.
   * cron-job.org will record a timeout; the contract is the source of truth for
   * whether the run happened.
   */
  return NextResponse.json(
    await runPatrol({ started, url, chain, address, key, dryRun, notes }),
    { headers: { "cache-control": "no-store" } },
  );
}

/** The patrol itself. Returns the report; never throws for an expected outcome. */
async function runPatrol({ started, url, chain, address, key, dryRun, notes }: {
  started: number; url: URL; chain: (typeof CHAINS)[keyof typeof CHAINS];
  address: `0x${string}`; key: string | undefined; dryRun: boolean; notes: string[];
}): Promise<PatrolReport> {
  let dry = dryRun;
  const networkName = (process.env.NEXT_PUBLIC_NETWORK ?? "studiodev") as keyof typeof CHAINS;
  const read = createClient({ chain });
  const view = async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
    const raw = await read.readContract({ address, functionName: fn, args: args as never });
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  };

  /**
   * Put one pending challenge to the validators and wait for it to land.
   *
   * resolve_challenge RAISES by design when the round does not converge or the
   * explorer was transiently unreadable — nothing is applied and the challenge
   * stays PENDING for a later run. That is an expected outcome, not an error to
   * abort the patrol over, so it is caught and reported.
   */
  const resolveOne = async (
    cid: number,
    w: NonNullable<typeof wallet>,
  ): Promise<{ challenge_id: number; verdict: string; error?: string }> => {
    try {
      console.log(`[patrol] resolve #${cid} submitting…`);
      const hash = await writeWithRetry(
        w, { address, functionName: "resolve_challenge", args: [cid], value: 0n },
        `resolve_challenge(${cid})`,
      );
      console.log(`[patrol] resolve #${cid} tx ${String(hash).slice(0, 14)}…`);
      const deadline = Date.now() + RESOLVE_POLL_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const tx = await read.getTransaction({ hash: hash as TransactionHash }).catch(() => null);
        const st = (tx as { status?: number })?.status;
        const name = typeof st === "number"
          ? ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"][st]
          : "";
        if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"].includes(name ?? "")) break;
      }
      // The transaction settling is not the challenge settling — read it back.
      const after = await view<{ status: string; verdict: string }>("get_challenge", [cid])
        .catch(() => null);
      if (after && after.status !== "PENDING") {
        return { challenge_id: cid, verdict: after.verdict || after.status };
      }
      return { challenge_id: cid, verdict: "PENDING",
        error: "the round did not converge; still pending and can be judged again" };
    } catch (e) {
      return { challenge_id: cid, verdict: "PENDING",
        error: String((e as Error)?.message ?? e).slice(0, 160) };
    }
  };

  let wallet: ReturnType<typeof createClient> | null = null;
  let botAddress: string | null = null;
  if (!dry) {
    if (!key) {
      dry = true;
      notes.push("PATROL_PRIVATE_KEY is not set — falling back to a dry run.");
    } else {
      const account = createAccount(key as `0x${string}`);
      botAddress = account.address;
      wallet = createClient({ chain, account });

      /*
       * The bot spends its own GEN here: a stake on every challenge it files,
       * plus a fee deposit on every write once the network charges for them.
       * An empty wallet does not fail loudly — the writes are refused one at a
       * time and the run reports a patrol that filed nothing, which reads
       * exactly like a clean register. So check the balance ONCE, up front, and
       * say plainly what is wrong and what it needs.
       */
      try {
        const balance = await withTimeout(
          read.getBalance({ address: account.address as `0x${string}` }), 20_000, "bot balance");
        const stakeText = (Number(CHALLENGE_STAKE_FLOOR) / 1e18).toFixed(2);
        if (balance === 0n) {
          notes.push(
            `The patrol wallet ${account.address} holds 0 GEN. It needs GEN for the ` +
            `challenge stake (${stakeText} each) and, on a network with fees enabled, a fee ` +
            `deposit on every write. Fund it before this run can file anything: on Studio ` +
            `networks call sim_fundAccount, elsewhere send it GEN from a funded wallet.`);
          console.log(`[patrol] WARNING bot wallet ${account.address} holds 0 GEN`);
        } else if (balance < CHALLENGE_STAKE_FLOOR) {
          notes.push(
            `The patrol wallet ${account.address} holds ${balance} wei, less than one ` +
            `${stakeText} GEN challenge stake. It can judge and stamp, but it cannot file.`);
        }
      } catch {
        // A balance the RPC will not answer is not a reason to skip the run.
        notes.push("Could not read the patrol wallet's balance; proceeding anyway.");
      }
    }
  }

  const limit = Math.min(
    MAX_AGENTS,
    Math.max(1, Number(url.searchParams.get("limit") ?? MAX_AGENTS) || MAX_AGENTS),
  );

  /*
   * PHASE A — judge what is already filed, before looking for anything new.
   *
   * This runs first on purpose. A challenge sitting PENDING has a stake locked
   * against a bond and has moved no money and proven nothing; finding an
   * eleventh suspicious transaction is worth less than settling the three
   * already on the books. Anything that does not fit the budget stays PENDING
   * and the next run picks it up.
   */
  const resolved: { challenge_id: number; verdict: string; error?: string }[] = [];
  if (!dry && wallet) {
    console.log(`[patrol] phaseA reading pending at ${Date.now() - started}ms`);
    const pending = await withTimeout(
      view<{ challenges: { challenge_id: number }[] }>("get_pending_challenges", [MAX_RESOLVES_PER_RUN * 3]),
      25_000, "get_pending_challenges",
    ).catch((e) => {
      console.log(`[patrol] phaseA read FAILED: ${String(e?.message ?? e).slice(0, 160)}`);
      return { challenges: [] as { challenge_id: number }[] };
    });
    console.log(`[patrol] phaseA ${(pending.challenges ?? []).length} pending at ${Date.now() - started}ms`);
    for (const c of pending.challenges ?? []) {
      if (resolved.length >= MAX_RESOLVES_PER_RUN) break;
      if (Date.now() - started + RESOLVE_POLL_MS > RESOLVE_UNTIL_MS) {
        notes.push("Out of budget with challenges still pending — the next patrol takes them.");
        break;
      }
      resolved.push(await resolveOne(c.challenge_id, wallet));
    }
    if (resolved.length) {
      console.log(`[patrol] resolved ${resolved.length}: ` +
        resolved.map((r) => `#${r.challenge_id}=${r.verdict}`).join(" "));
    }
  }

  console.log(`[patrol] queue read at ${Date.now() - started}ms`);
  let queue: { queue: { agent_id: number; wallet: string; chain: string; mandate?: string;
    last_checked: number;
    /** Cleared verdicts on this agent, used to decide whether its history is worth reading. */
    compliant_count?: number }[] };
  try {
    queue = await view("get_patrol_queue", [limit]);
  } catch (e) {
    notes.push(`could not read the patrol queue: ${String((e as Error)?.message ?? e)}`);
    console.log(`[patrol] queue read FAILED — nothing done this run`);
    return {
      ok: false, started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      network: networkName, contract: address, patrolled: 0,
      transactions_scanned: 0, challenges_filed: 0, challenges_withheld: 0, dry_run: dry,
      challenges_resolved: [], rows: [], notes,
    };
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
  /** Accusations NOT staked because the validators had already rejected them. */
  let withheldTotal = 0;

  for (const agent of queue.queue ?? []) {
    // Stop examining NEW agents in time to still stamp the ones already done.
    // An unexamined agent keeps its place at the head of the queue, so the next
    // run starts exactly here.
    if (Date.now() - started > SCAN_UNTIL_MS) {
      notes.push(`Stopped after ${rows.length} agent(s) to stay inside the run budget — the rest keep their place in the queue.`);
      break;
    }
    const row: PatrolRow = {
      agent_id: agent.agent_id,
      wallet: agent.wallet,
      chain: agent.chain as PatrolRow["chain"],
      scanned: 0,
      skipped_already_challenged: 0,
      flagged: [],
      withheld: [],
      learned_rules: 0,
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
     * WHAT THE VALIDATORS HAVE ALREADY TOLD THIS BOT.
     *
     * `is_tx_challenged` stops the bot re-filing the same TRANSACTION. It does
     * nothing about the same ARGUMENT: an agent whose WFC trades were ruled
     * within its mandate makes a new WFC trade tomorrow, the rule fires again
     * on a hash nobody has challenged, and the bot stakes GEN on a case five
     * validators have already decided against it. That is a slow, automatic,
     * repeating loss — the bot losing money for being unable to learn.
     *
     * So the agent's settled history is read once here and turned into a set of
     * rule-and-subject keys the validators have cleared. See lib/heuristics.ts
     * for what a key covers and how one stops applying.
     *
     * Gated on `compliant_count`, which the queue row already carries: an agent
     * that has never been cleared of anything has nothing to teach, and that is
     * almost every agent almost always. Costing every patrol an extra read per
     * agent to discover that would be the wrong trade on a route with a hard
     * 300s ceiling.
     *
     * A history read that FAILS leaves the set empty, which means the bot files
     * as it did before. That is the safe direction: an unreadable history can
     * cost a stake, while assuming it said COMPLIANT would silence the watchdog
     * on the strength of a network error.
     */
    let learned = new Map<string, number>();
    if (Number(agent.compliant_count ?? 0) > 0) {
      const history = await withTimeout(
        view<{ challenges: SettledChallenge[] }>("get_agent_history", [agent.agent_id, 50]),
        20_000, `get_agent_history(${agent.agent_id})`,
      ).catch((e) => {
        console.log(`[patrol] history read FAILED for #${agent.agent_id}: ` +
          `${String((e as Error)?.message ?? e).slice(0, 120)}`);
        notes.push(`Agent #${agent.agent_id}'s settled history was unreadable, so this ` +
          `run filed against it without deferring to past verdicts.`);
        return null;
      });
      if (history) learned = learnedFrom(history.challenges ?? []);
    }
    row.learned_rules = learned.size;
    if (learned.size > 0) {
      console.log(`[patrol] agent #${agent.agent_id} carries ${learned.size} cleared pattern(s)`);
    }

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

      /*
       * Drop the parts of this accusation the validators have already rejected
       * for this agent, and file only what is left. Done BEFORE `is_tx_challenged`
       * because it is local arithmetic and that is an RPC round trip: a candidate
       * the bot is not going to file is not worth a read to confirm.
       *
       * Note that `keep` is what the reason is built from, so an accusation that
       * is half-settled is re-argued only on its unsettled half.
       */
      const { keep, withheld } = withholdLearned(flags, learned);
      for (const w of withheld) {
        row.withheld.push({ tx_hash: tx.hash, reason: w.reason, cleared_by: w.cleared_by });
        withheldTotal++;
        console.log(`[patrol] withheld ${w.rule} on #${agent.agent_id} ` +
          `— validators ruled COMPLIANT in challenge #${w.cleared_by}`);
      }
      if (keep.length === 0) continue;

      const known = await view<{ challenged: boolean }>("is_tx_challenged", [agent.chain, tx.hash])
        .catch(() => ({ challenged: false }));
      if (known.challenged) {
        row.skipped_already_challenged++;
        continue;
      }

      const reason = reasonText(keep);
      const outOfFilingTime = Date.now() - started > FILE_UNTIL_MS;
      if (outOfFilingTime && !dry) {
        row.flagged.push({ tx_hash: tx.hash, reason, filed: false,
          error: "deferred to the next patrol — out of run budget" });
        continue;
      }
      if (dry || !wallet || filedTotal >= MAX_CHALLENGES_PER_RUN) {
        row.flagged.push({ tx_hash: tx.hash, reason, filed: false });
        continue;
      }

      // Wait out the bot's own rate limit, or stop if the budget cannot cover it.
      const waitFor = lastFiledAt ? Math.max(0, cooldownMs - (Date.now() - lastFiledAt)) : 0;
      if (waitFor > 0) {
        if (Date.now() - started + waitFor > BUDGET_MS) {
          row.flagged.push({ tx_hash: tx.hash, reason, filed: false,
            error: "deferred to the next patrol — the per-wallet cooldown does not fit in this run" });
          continue;
        }
        await new Promise((r) => setTimeout(r, waitFor));
      }

      try {
        const hash = await writeWithRetry(
          wallet,
          { address, functionName: "challenge_agent",
            args: [agent.agent_id, tx.hash, reason], value: stake },
          "challenge_agent",
        );
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
         * A readable return value is not a safe substitute either, so the
         * only authority is the contract's own state — read it back.
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
        if (confirmed.challenged) {
          filedTotal++;
          /*
           * Judge it now rather than leaving it for the next run. The challenge
           * id is not carried anywhere the caller can trust, so it is found
           * by matching this tx hash against what is still pending.
           */
          if (Date.now() - started + RESOLVE_POLL_MS <= RESOLVE_UNTIL_MS
              && resolved.length < MAX_RESOLVES_PER_RUN) {
            const pend = await view<{ challenges: { challenge_id: number; tx_hash: string }[] }>(
              "get_pending_challenges", [50],
            ).catch(() => ({ challenges: [] as { challenge_id: number; tx_hash: string }[] }));
            const mine = (pend.challenges ?? []).find(
              (c) => String(c.tx_hash).toLowerCase() === tx.hash.toLowerCase());
            if (mine) {
              const r = await resolveOne(mine.challenge_id, wallet);
              resolved.push(r);
              row.flagged[row.flagged.length - 1].challenge_id = mine.challenge_id;
              console.log(`[patrol] filed+judged #${mine.challenge_id} => ${r.verdict}`);
            }
          }
        }
      } catch (e) {
        row.flagged.push({ tx_hash: tx.hash, reason, filed: false,
          error: String((e as Error)?.message ?? e) });
      }
    }
    rows.push(row);
  }

  // Stamp what was actually examined, so the next run starts where this one
  // stopped. Only agents whose explorer ANSWERED are stamped.
  let markedPatrolled = false;
  if (!dry && wallet && patrolled.length > 0) {
    try {
      console.log(`[patrol] mark_patrolled ${patrolled.length} agents at ${Date.now() - started}ms`);
      await writeWithRetry(
        wallet, { address, functionName: "mark_patrolled", args: [patrolled], value: 0n },
        "mark_patrolled", 5,
      );
      markedPatrolled = true;
      console.log(`[patrol] mark_patrolled OK at ${Date.now() - started}ms`);
    } catch (e) {
      notes.push(`mark_patrolled failed: ${String((e as Error)?.message ?? e)}`);
      console.log(`[patrol] mark_patrolled FAILED: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
    }
  } else if (!dry && patrolled.length === 0) {
    notes.push("No agent's explorer answered, so nothing was stamped as patrolled.");
  }

  if (withheldTotal > 0) {
    // Said in GEN, because the saving is the point. This is the stake that
    // would have been forfeited re-filing cases the validators already closed.
    const saved = stake > 0n
      ? ` — about ${(Number(stake * BigInt(withheldTotal)) / 1e18).toFixed(2)} GEN of stake not risked on cases the validators have already closed`
      : "";
    notes.push(`Withheld ${withheldTotal} accusation(s) the validators previously ruled COMPLIANT${saved}.`);
  }
  if (dry) notes.push("Dry run — nothing was filed on chain.");
  if (botAddress) notes.push(`Filing as ${botAddress}.`);
  if (resolved.length) {
    const settled = resolved.filter((r) => r.verdict !== "PENDING");
    notes.push(`Judged ${settled.length} of ${resolved.length} challenge(s) put to the validators.`);
  }

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
    challenges_withheld: withheldTotal,
    dry_run: dry,
    challenges_resolved: resolved,
    rows,
    notes,
  };
  console.log(`[patrol] END dry_run=${dry} patrolled=${rows.length} ` +
    `scanned=${scannedTotal} filed=${filedTotal} withheld=${withheldTotal} ` +
    `resolved=${resolved.length} marked=${markedPatrolled} seconds=${report.seconds}`);
  return report;
}
