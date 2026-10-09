/**
 * THE PATROL BOT (v2).
 *
 *   GET /api/patrol            a real run for a trusted caller (cron-job.org with PATROL_SECRET)
 *   GET /api/patrol?dry=1      walk everything, write nothing, report what it would do
 *
 * Every run, inside a 300 s budget:
 *   A. moves open challenges along - resolve PENDING ones, finalize CONTESTABLE
 *      ones past their appeal window, put APPEALED ones to a fresh panel (or
 *      expire them past their deadline). All of these are permissionless.
 *   B. walks the patrol queue (least recently examined first). For each agent it
 *      reads recent transactions mined after registration, picks the mandate
 *      version that was in force at each one's block time (frozen versions), and
 *      applies lib/heuristics.ts to that version's clauses.
 *   C. never stakes on a clause the linter flagged in that version (a breach
 *      there can never be slashed; measured: before this rule the bot filed ~70
 *      challenges overnight on one flagged clause, every one INCONCLUSIVE), and
 *      before staking asks the contract for a precedent for this agent, clause
 *      and transaction kind (lib/kind.ts mirrors the contract), skipping the
 *      transaction if one is active. If that read FAILS the flag is deferred,
 *      never filed: an unreadable precedent is not the absence of one. Amount
 *      rules never defer to a precedent: a kind does not carry the amount.
 *   D. files at most a few challenges, confirming each against contract state,
 *      then stamps what it examined.
 *
 * Every write carries a fee deposit estimated for that call (simulation first,
 * the generic policy estimate if simulation fails). An unauthenticated caller
 * always gets a dry run: the public button on /patrol must never spend the bot's
 * stake.
 */
import { NextResponse } from "next/server";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { oneTransaction, recentTransactions, TransientBlockscout } from "@/lib/blockscout";
import { flagsFor } from "@/lib/heuristics";
import { kindOfDoc } from "@/lib/kind";
import { judgeableClauses, screenFlags, versionAt, type PrecedentAnswer } from "@/lib/patrolPlan";
import { DEPLOYMENTS } from "@/lib/deployments";
import type { Challenge, Clause, PatrolReport, PatrolRow } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_AGENTS = 10;
const MAX_TX_PER_AGENT = 20;
const MAX_ENRICH_PER_AGENT = 6;
const MAX_FILE_PER_RUN = 2;
const MAX_ACTIONS_PER_RUN = 3;
const ACTIONS_UNTIL_MS = 130_000;
const SCAN_UNTIL_MS = 200_000;
const FILE_UNTIL_MS = 235_000;
const STATUS = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"];

type QueueAgent = {
  agent_id: number; wallet: string; chain: string; registered_at: number; last_checked: number;
  versions_list: { version: number; effective_from: number; clauses: Clause[] }[];
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);
}

function authorised(req: Request): { ok: boolean; why: string } {
  const secret = process.env.PATROL_SECRET;
  if (req.headers.get("x-vercel-cron")) return { ok: true, why: "x-vercel-cron header" };
  if (!secret) return { ok: false, why: "PATROL_SECRET is not set on this deployment" };
  const raw = (req.headers.get("authorization") ?? req.headers.get("x-patrol-secret") ?? "").trim();
  if (!raw) return { ok: false, why: "no authorization or x-patrol-secret header was sent" };
  const m = raw.match(/^bearer\s+(.*)$/i);
  const token = (m ? m[1] : raw).trim();
  return token === secret ? { ok: true, why: m ? "bearer token" : "bare token" }
    : { ok: false, why: `token did not match (received ${token.length} chars, expected ${secret.length})` };
}

export async function GET(req: Request) {
  const started = Date.now();
  const url = new URL(req.url);
  const auth = authorised(req);
  const dry = auth.ok ? url.searchParams.get("dry") === "1" : true;
  const notes: string[] = [];
  if (!auth.ok) notes.push(`Dry run: ${auth.why}.`);
  console.log(`[patrol] START trusted=${auth.ok} (${auth.why}) dry_run=${dry}`);
  const report = await runPatrol({ started, dry, notes, key: process.env.PATROL_PRIVATE_KEY });
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}

async function runPatrol({ started, dry: dryIn, notes, key }: { started: number; dry: boolean; notes: string[]; key?: string }): Promise<PatrolReport> {
  let dry = dryIn;
  const address = DEPLOYMENTS.sentinel as `0x${string}`;
  const read = createClient({ chain: studioDevnet });
  const view = async <T,>(fn: string, args: unknown[] = []): Promise<T> => {
    const raw = await withTimeout(read.readContract({ address, functionName: fn, args: args as never }), 30_000, fn);
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
  };

  let wallet: ReturnType<typeof createClient> | null = null;
  if (!dry) {
    if (!key) { dry = true; notes.push("PATROL_PRIVATE_KEY is not set; dry run."); }
    else {
      const account = createAccount(key as `0x${string}`);
      wallet = createClient({ chain: studioDevnet, account });
      notes.push(`Acting as ${account.address}.`);
    }
  }

  /** A write with a per-call fee deposit, followed to a terminal status. */
  const write = async (fn: string, args: unknown[], value = 0n): Promise<{ status: string; hash: string }> => {
    const w = wallet!;
    let fees: Awaited<ReturnType<typeof w.estimateTransactionFees>> | undefined;
    try {
      fees = await withTimeout(w.estimateTransactionFeesForWrite({ address, functionName: fn, args: args as never, value }), 30_000, `${fn} fee`);
    } catch {
      fees = await withTimeout(w.estimateTransactionFees({}), 30_000, `${fn} generic fee`);
    }
    let hash = "";
    for (let i = 1; i <= 4; i++) {
      try {
        hash = await withTimeout(w.writeContract({ address, functionName: fn, args: args as never, value, ...(fees ? { fees } : {}) }), 45_000, `${fn} submit`) as string;
        break;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (!/at capacity|rate limit|too many|busy|timed out|fetch failed/i.test(msg) || i === 4) throw e;
        await new Promise((r) => setTimeout(r, 2500 * i));
      }
    }
    const until = Date.now() + 90_000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 5000));
      const t = await read.getTransaction({ hash: hash as TransactionHash }).catch(() => null);
      const st = (t as { status?: number })?.status;
      const name = typeof st === "number" ? STATUS[st] : "";
      if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"].includes(name)) return { status: name, hash };
    }
    return { status: "NOT_SETTLED_IN_90S", hash };
  };

  // A. move open challenges along.
  const actions: PatrolReport["actions"] = [];
  try {
    const open = await view<{ challenges: Challenge[] }>("get_open_challenges", [20]);
    const now = Math.floor(Date.now() / 1000);
    for (const c of open.challenges) {
      if (actions.length >= MAX_ACTIONS_PER_RUN || Date.now() - started > ACTIONS_UNTIL_MS) break;
      let fn = "";
      if (c.status === "PENDING") fn = now > c.resolve_deadline ? "settle_stalled" : "resolve_challenge";
      else if (c.status === "CONTESTABLE" && now > c.ruling.contest_deadline + 5) fn = "finalize";
      else if (c.status === "APPEALED") fn = now > c.appeal.deadline ? "expire_appeal" : "resolve_appeal";
      if (!fn) continue;
      if (dry || !wallet) { actions.push({ challenge_id: c.challenge_id, action: fn, result: "would call (dry run)" }); continue; }
      try {
        const r = await write(fn, [c.challenge_id]);
        const after = await view<Challenge>("get_challenge", [c.challenge_id]).catch(() => null);
        actions.push({ challenge_id: c.challenge_id, action: fn, result: `${r.status}; now ${after?.status ?? "?"}${after?.final.verdict ? " " + after.final.verdict : after?.ruling.verdict ? " " + after.ruling.verdict : ""}` });
      } catch (e) {
        actions.push({ challenge_id: c.challenge_id, action: fn, result: `failed: ${String((e as Error)?.message ?? e).slice(0, 120)}` });
      }
    }
  } catch (e) {
    notes.push(`Could not read open challenges: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }

  // B-D. walk the queue.
  const rows: PatrolRow[] = [];
  const examined: number[] = [];
  let scanned = 0, filed = 0, skippedByPrecedent = 0;
  let queue: QueueAgent[] = [];
  try {
    queue = (await view<{ queue: QueueAgent[] }>("get_patrol_queue", [MAX_AGENTS])).queue ?? [];
  } catch (e) {
    notes.push(`Could not read the patrol queue: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  const cfg = await view<{ challenge_stake: string }>("get_config").catch(() => null);
  const stake = cfg ? BigInt(cfg.challenge_stake) : 0n;

  for (const agent of queue) {
    if (Date.now() - started > SCAN_UNTIL_MS) { notes.push("Stopped scanning to stay inside the run budget; the rest keep their place in the queue."); break; }
    const row: PatrolRow = { agent_id: agent.agent_id, wallet: agent.wallet, chain: agent.chain as PatrolRow["chain"], scanned: 0,
      skipped_already_challenged: 0, flagged: [], skipped_precedent: [] };
    let txs;
    try {
      txs = await recentTransactions(agent.chain, agent.wallet);
    } catch (e) {
      row.error = e instanceof TransientBlockscout ? `explorer unavailable to this server (${e.message}); skipped, not cleared` : String((e as Error)?.message ?? e);
      rows.push(row);
      continue;
    }
    examined.push(agent.agent_id);
    const lintFlags = new Map<number, Set<string>>();
    try {
      const vs = await view<{ versions: { version: number; lint_status: string; lint_flags: { clause: string }[] }[] }>("get_mandate_versions", [agent.agent_id]);
      for (const v of vs.versions) lintFlags.set(v.version, new Set(v.lint_status === "DONE" ? v.lint_flags.map((f) => f.clause) : []));
    } catch {
      row.error = "mandate versions unreadable; nothing filed for this agent this run";
      rows.push(row);
      continue;
    }
    const fresh = txs.filter((t) => t.epoch >= agent.registered_at).slice(0, MAX_TX_PER_AGENT);
    row.scanned = fresh.length;
    scanned += fresh.length;
    let enriched = 0;
    for (let t of fresh) {
      const version = versionAt(agent.versions_list, t.epoch);
      if (!version) continue;
      const judgeable = judgeableClauses(version, lintFlags.get(version.version));
      const first = flagsFor(t, agent.wallet, judgeable);
      let flags = first.flags;
      const needsTransfers = first.needsTransfers;
      let doc: Record<string, unknown> | null = null;
      if ((needsTransfers || flags.length) && enriched < MAX_ENRICH_PER_AGENT) {
        enriched++;
        const one = await oneTransaction(agent.chain, t.hash).catch(() => null);
        if (one) { t = one.row; doc = one.doc; ({ flags } = flagsFor(t, agent.wallet, judgeable)); }
      }
      if (!flags.length) continue;
      const known = await view<{ challenged: boolean; challenge_id?: number }>("is_tx_challenged", [agent.chain, t.hash, agent.agent_id]).catch(() => ({ challenged: false }));
      if (known.challenged) { row.skipped_already_challenged++; continue; }
      // C. precedents, for every flag that may defer to one.
      const kind = doc ? kindOfDoc(doc, agent.wallet) : "";
      const epoch = t.epoch;
      const { live, withheld, unreadable } = await screenFlags(flags, kind, (clause) =>
        view<PrecedentAnswer>("precedent_for", [agent.agent_id, clause, kind, epoch]).catch(() => null));
      for (const w of withheld) {
        row.skipped_precedent.push({ tx_hash: t.hash, clause: w.clause, tx_kind: kind, precedent_key: w.key, challenge_id: w.challenge_id });
        skippedByPrecedent++;
        console.log(`[patrol] precedent skip agent #${agent.agent_id} ${w.clause} ${t.hash.slice(0, 12)} key ${w.key.slice(0, 10)}`);
      }
      if (unreadable) {
        row.flagged.push({ tx_hash: t.hash, reason: "precedent check unreadable", clause: flags[0].clause, filed: false,
          error: "deferred: the precedent check could not be read, so nothing was staked" });
        continue;
      }
      if (!live.length) continue;
      const f = live[0];
      const entry = { tx_hash: t.hash, reason: f.reason, clause: f.clause, filed: false } as PatrolRow["flagged"][number];
      row.flagged.push(entry);
      if (dry || !wallet || filed >= MAX_FILE_PER_RUN || Date.now() - started > FILE_UNTIL_MS || stake === 0n) continue;
      try {
        const r = await write("challenge_agent", [agent.agent_id, t.hash, t.epoch, f.clause, f.reason], stake);
        const after = await view<{ challenged: boolean; challenge_id?: number }>("is_tx_challenged", [agent.chain, t.hash, agent.agent_id]);
        entry.filed = after.challenged;
        if (after.challenged) { entry.challenge_id = after.challenge_id; filed++; }
        else entry.error = `${r.status}; the contract did not record it (refused or not settled)`;
      } catch (e) {
        entry.error = String((e as Error)?.message ?? e).slice(0, 160);
      }
    }
    rows.push(row);
  }

  if (!dry && wallet && examined.length) {
    try { await write("mark_patrolled", [examined]); } catch (e) { notes.push(`mark_patrolled failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
  }
  if (dry) notes.push("Dry run: nothing was written.");
  if (skippedByPrecedent) notes.push(`${skippedByPrecedent} flag(s) withheld because a final COMPLIANT precedent covers that agent, clause and transaction kind.`);
  const report: PatrolReport = {
    ok: true, started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)), network: "studiodev", contract: address,
    patrolled: rows.length, transactions_scanned: scanned, challenges_filed: filed, skipped_by_precedent: skippedByPrecedent,
    dry_run: dry, actions, rows, notes,
  };
  console.log(`[patrol] END dry=${dry} agents=${rows.length} scanned=${scanned} filed=${filed} precedent_skips=${skippedByPrecedent} actions=${actions.length} ${report.seconds}s`);
  return report;
}
