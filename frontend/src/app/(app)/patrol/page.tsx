"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Panel, Label, ChainTag, VerdictBadge, Empty, Spinner, Stat } from "@/components/ui";
import { getPatrolQueue, getPendingChallenges, getStats } from "@/lib/contract";
import { relativeTime, shortAddress } from "@/lib/format";
import type { PatrolReport } from "@/types";

export default function PatrolPage() {
  const { data: queue } = useSWR("queue", () => getPatrolQueue(25), { refreshInterval: 20_000 });
  const { data: pending, mutate: mutatePending } = useSWR("pending", () => getPendingChallenges(25), { refreshInterval: 20_000 });
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 20_000 });

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<PatrolReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<PatrolReport[]>([]);

  /*
   * A patrol reads ~120 transactions from Blockscout one at a time and takes
   * close to two minutes. Without a clock ticking, a button that sits on
   * "Patrolling…" for that long reads as hung rather than as working, and the
   * first thing anyone does with a hung button is reload the page.
   */
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function runPatrol() {
    startedAt.current = Date.now();
    setElapsed(0);
    setRunning(true); setErr(null); setReport(null);
    try {
      const res = await fetch("/api/patrol", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `patrol returned ${res.status}`);
      setReport(body as PatrolReport);
      setHistory((h) => [body as PatrolReport, ...h].slice(0, 5));
      mutatePending();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>The Sentinel</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Patrol</h1>
      <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        The bot walks the register least-recently-checked first, pulls each agent&apos;s recent
        transactions from Blockscout, and flags the ones that visibly contradict a rule it can
        check with arithmetic. A flag is an <span className="text-ink">accusation, not a verdict</span> —
        it costs the bot its stake, and five validators decide.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="In the queue" value={queue?.count ?? "—"} sub="agents eligible now" tone="signal" />
        <Stat label="Awaiting judgement" value={pending?.count ?? "—"} sub="challenges filed, not settled" />
        <Stat label="Patrols run" value={stats?.patrols_run ?? "—"} sub="on-chain patrol stamps" />
        <Stat label="Breaches proven" value={stats?.violations ?? "—"}
          tone={stats && stats.violations > 0 ? "violation" : "ink"} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={runPatrol} disabled={running}
          className="rounded-lg bg-signal px-5 py-2.5 text-sm font-medium text-ground transition-opacity hover:opacity-90 disabled:opacity-50">
          {running ? `Patrolling… ${elapsed}s` : "Run patrol"}
        </button>
        <span className="max-w-md text-[12px] text-ink-3">
          A Vercel cron is configured for <span className="text-ink-2">every 10 minutes</span>,
          though delivery has not yet been observed on this deployment — the runs recorded on
          chain were triggered with the bot&apos;s bearer token. From this button it is a{" "}
          <span className="text-ink-2">dry run</span>: a public URL must not be able to spend the
          bot&apos;s stake. Takes about two minutes.
        </span>
        <Link href="/analytics"
          className="ml-auto rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-ink-2 hover:border-signal/40 hover:text-ink">
          Analytics →
        </Link>
      </div>

      {running && (
        <div className="mt-5">
          <Spinner label={
            elapsed < 15 ? "Reading the queue from the contract…"
            : elapsed < 100 ? `Fetching each agent's transactions from Blockscout — ${elapsed}s elapsed, usually about 110s`
            : `Still working — ${elapsed}s elapsed`
          } />
        </div>
      )}

      {err && (
        <div className="mt-5 rounded-lg border border-violation/30 bg-violation/10 p-4 text-sm text-violation">
          {err}
        </div>
      )}

      {report && (
        <Panel className="mt-6 p-6 rise">
          <div className="flex flex-wrap items-center gap-3">
            <Label>Last run</Label>
            {report.dry_run && (
              <span className="rounded-md bg-neutral/10 px-2 py-0.5 text-[11px] text-neutral ring-1 ring-neutral/25">
                dry run — nothing filed
              </span>
            )}
            <span className="mono ml-auto text-[11px] text-ink-3">{report.seconds}s</span>
          </div>

          <div className="mono mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-2">
            <span>{report.patrolled} agents examined</span>
            <span>{report.transactions_scanned} transactions read</span>
            <span className={report.challenges_filed > 0 ? "text-violation" : ""}>
              {report.challenges_filed} challenges filed
            </span>
          </div>

          <div className="mt-5 space-y-2.5">
            {report.rows.length === 0 && <Empty title="The queue was empty" hint="Register an agent and it appears here." />}
            {report.rows.map((row) => (
              <div key={row.agent_id} className="rounded-lg border border-line bg-panel-2/60 p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link href={`/agent/${row.agent_id}`} className="mono text-[12px] text-ink hover:text-signal">
                    {shortAddress(row.wallet, 6)}
                  </Link>
                  <ChainTag chain={row.chain} />
                  <span className="mono text-[11px] text-ink-3">{row.scanned} tx read</span>
                  {row.skipped_already_challenged > 0 && (
                    <span className="text-[11px] text-ink-3">
                      {row.skipped_already_challenged} already judged
                    </span>
                  )}
                  {row.error ? (
                    <span className="ml-auto rounded-md bg-neutral/10 px-2 py-0.5 text-[11px] text-neutral ring-1 ring-neutral/25">
                      {row.error}
                    </span>
                  ) : row.flagged.length === 0 ? (
                    <span className="ml-auto text-[11px] text-compliant">nothing flagged</span>
                  ) : (
                    <span className="ml-auto text-[11px] text-violation">
                      {row.flagged.length} flagged
                    </span>
                  )}
                </div>

                {row.flagged.map((f) => (
                  <div key={f.tx_hash} className="mt-2.5 rounded-md border border-violation/20 bg-violation/5 p-3">
                    <div className="mono text-[11px] text-violation">{shortAddress(f.tx_hash, 8)}</div>
                    <div className="mt-1 text-[12px] leading-relaxed text-ink-2">{f.reason}</div>
                    <div className="mt-1.5 text-[10px] text-ink-3">
                      {f.filed ? "challenge filed on chain" : f.error ?? "would be challenged on a live run"}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {report.notes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line pt-3.5 text-[11px] text-ink-3">
              {report.notes.map((n, i) => <li key={i}>· {n}</li>)}
            </ul>
          )}
        </Panel>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          <Label>The queue — least recently checked first</Label>
          <div className="mt-3 space-y-1.5">
            {!queue && <Spinner />}
            {queue?.queue.length === 0 && <Empty title="Nothing to patrol yet" />}
            {queue?.queue.map((a) => (
              <Link key={a.agent_id} href={`/agent/${a.agent_id}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel/60 px-3.5 py-2.5 hover:border-signal/40">
                <span className="mono text-[12px] text-ink-2">{shortAddress(a.wallet, 5)}</span>
                <ChainTag chain={a.chain} />
                <span className="ml-auto text-[11px] text-ink-3">
                  {a.last_checked ? relativeTime(a.last_checked) : "never checked"}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <Label>Awaiting judgement</Label>
          <div className="mt-3 space-y-1.5">
            {!pending && <Spinner />}
            {pending?.challenges.length === 0 && (
              <Empty title="No challenge is waiting" hint="Everything filed has been judged." />
            )}
            {pending?.challenges.map((c) => (
              <Link key={c.challenge_id} href={`/challenge/${c.challenge_id}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel/60 px-3.5 py-2.5 hover:border-signal/40">
                <VerdictBadge verdict="PENDING" size="sm" />
                <span className="mono text-[11px] text-ink-3">{shortAddress(c.tx_hash, 5)}</span>
                <span className="ml-auto text-[11px] text-ink-3">{relativeTime(c.filed_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {history.length > 1 && (
        <div className="mt-10">
          <Label>This session&apos;s runs</Label>
          <div className="mono mt-3 space-y-1 text-[11px] text-ink-3">
            {history.map((h, i) => (
              <div key={i} className="flex gap-4">
                <span>{new Date(h.finished_at).toLocaleTimeString()}</span>
                <span>{h.patrolled} agents</span>
                <span>{h.transactions_scanned} tx</span>
                <span className={h.rows.some((r) => r.flagged.length) ? "text-violation" : "text-compliant"}>
                  {h.rows.reduce((n, r) => n + r.flagged.length, 0)} flagged
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
