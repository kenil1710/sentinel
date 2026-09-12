"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Panel, Label, ChainTag, TypeTag, VerdictBadge, Empty, Spinner, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";
import { getChallenges, getPatrolQueue, getPendingChallenges, getStats } from "@/lib/contract";
import { relativeTime, shortAddress } from "@/lib/format";
import { LEARN_AFTER } from "@/lib/heuristics";
import type { PatrolReport } from "@/types";

export default function PatrolPage() {
  const { data: queue } = useSWR("queue", () => getPatrolQueue(25), { refreshInterval: 20_000 });
  const { data: pending, mutate: mutatePending } = useSWR("pending", () => getPendingChallenges(25), { refreshInterval: 20_000 });
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 20_000 });

  /*
   * An empty "awaiting judgement" column is the NORMAL resting state — the
   * patrol resolves what it files in the same run — but "No challenge is
   * waiting" reads like nothing has ever happened here. So when the queue is
   * empty the last settled verdict is shown instead: the same space then says
   * the system is idle BECAUSE it finished, which is the opposite impression.
   *
   * Fetched only when it is needed. A null SWR key skips the request, so the
   * common case where challenges ARE pending costs no extra read.
   */
  const needLastSettled = pending?.challenges.length === 0;
  const { data: recent } = useSWR(
    needLastSettled ? "recent-challenges" : null,
    () => getChallenges(25),
    { refreshInterval: 60_000 },
  );
  // get_challenges returns newest first, so the first settled row is the most
  // recent one. PENDING rows are skipped rather than assumed absent.
  const lastSettled = recent?.challenges.find(
    (c) => c.status !== "PENDING" && c.settled_at > 0);

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

      {/*
        The two numbers the page exists to prove come first and come large: a
        watchdog that has run, and the breaches it caught. The queue depth and
        the pending count are instrumentation — useful, but they are not the
        argument, and sizing them the same made the argument easy to miss.
      */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Stat icon="patrols" label="Patrols run" value={stats?.patrols_run ?? "—"} size="lg" tone="signal"
          sub="unattended runs stamped on chain" />
        <Stat icon="breaches" label="Breaches proven" value={stats?.violations ?? "—"} size="lg"
          tone={stats && stats.violations > 0 ? "violation" : "ink"}
          sub="upheld by five validators, bonds slashed" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat icon="agents" label="In the queue" value={queue?.count ?? "—"} sub="agents eligible now" tone="signal" />
        <Stat icon="waiting" label="Awaiting judgement" value={pending?.count ?? "—"} sub="challenges filed, not settled" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={runPatrol} disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-signal px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          <Icon name={running ? "patrols" : "run"} size={16} className={running ? "animate-spin" : ""} />
          {running ? `Patrolling… ${elapsed}s` : "Run patrol"}
        </button>
        <span className="text-[12px] text-ink-3">
          Patrols every 10 minutes automatically. This button runs a preview.
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
        <div className="mt-5 rounded-lg border border-violation/30 bg-violation/10 p-4 text-sm text-violation-ink">
          {err}
        </div>
      )}

      {report && (
        <Panel className="mt-6 p-6 rise">
          <div className="flex flex-wrap items-center gap-3">
            <Label>Last run</Label>
            {report.dry_run && (
              <span className="rounded-md bg-neutral/10 px-2 py-0.5 text-[11px] text-neutral-ink ring-1 ring-neutral/25">
                dry run — nothing filed
              </span>
            )}
            <span className="mono ml-auto text-[11px] text-ink-3">{report.seconds}s</span>
          </div>

          <div className="mono mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-2">
            <span>{report.patrolled} agents examined</span>
            <span>{report.transactions_scanned} transactions read</span>
            <span className={report.challenges_filed > 0 ? "text-violation-ink" : ""}>
              {report.challenges_filed} challenges filed
            </span>
            {(report.challenges_withheld ?? 0) > 0 && (
              <span className="text-compliant-ink">
                {report.challenges_withheld} withheld — already ruled compliant
              </span>
            )}
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
                  {(row.learned_rules ?? 0) > 0 && (
                    <span className="text-[11px] text-ink-3">
                      {row.learned_rules} pattern{row.learned_rules === 1 ? "" : "s"} cleared by validators
                    </span>
                  )}
                  {row.error ? (
                    <span className="ml-auto rounded-md bg-neutral/10 px-2 py-0.5 text-[11px] text-neutral-ink ring-1 ring-neutral/25">
                      {row.error}
                    </span>
                  ) : row.flagged.length === 0 ? (
                    <span className="ml-auto text-[11px] text-compliant-ink">
                      {(row.withheld ?? []).length > 0 ? "nothing left to challenge" : "nothing flagged"}
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] text-violation-ink">
                      {row.flagged.length} flagged
                    </span>
                  )}
                </div>

                {row.flagged.map((f) => (
                  <div key={f.tx_hash} className="mt-2.5 rounded-md border border-violation/20 bg-violation/5 p-3">
                    <div className="mono text-[11px] text-violation-ink">{shortAddress(f.tx_hash, 8)}</div>
                    <div className="mt-1 text-[12px] leading-relaxed text-ink-2">{f.reason}</div>
                    <div className="mt-1.5 text-[10px] text-ink-3">
                      {f.filed ? "challenge filed on chain" : f.error ?? "would be challenged on a live run"}
                    </div>
                  </div>
                ))}

                {/*
                  A watchdog that stops accusing has to say why, or its silence
                  is indistinguishable from a broken rule. Each of these is a
                  case the bot would once have re-filed and lost.
                */}
                {(row.withheld ?? []).map((w) => (
                  <div key={`w-${w.tx_hash}-${w.cleared_by}`}
                    className="mt-2.5 rounded-md border border-compliant/20 bg-compliant/5 p-3">
                    <div className="mono text-[11px] text-compliant-ink">{shortAddress(w.tx_hash, 8)}</div>
                    <div className="mt-1 text-[12px] leading-relaxed text-ink-2">{w.reason}</div>
                    <div className="mt-1.5 text-[10px] text-ink-3">
                      Skipped — validators previously ruled this pattern COMPLIANT{" "}
                      {w.rulings}× , first in{" "}
                      <Link href={`/challenge/${w.cleared_by}`} className="text-compliant-ink hover:underline">
                        challenge #{w.cleared_by}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {(report.learned_compliant ?? []).length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <Label>Learned compliant — patterns the bot has stood down on</Label>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                A pattern joins this list after {LEARN_AFTER} separate rounds rule the same
                accusation COMPLIANT against the same agent. It is rebuilt from the chain on
                every run, never cached, and a single VIOLATION on the same pattern removes it.
              </p>
              <div className="mt-2.5 space-y-1.5">
                {report.learned_compliant.map((l) => (
                  <div key={`${l.agent_id}-${l.pattern}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-panel-2/60 px-3 py-2">
                    <Link href={`/agent/${l.agent_id}`} className="mono text-[11px] text-ink-2 hover:text-signal">
                      agent #{l.agent_id}
                    </Link>
                    <span className="mono text-[11px] text-compliant-ink">{l.pattern}</span>
                    <span className="ml-auto text-[10px] text-ink-3">
                      {l.rulings} COMPLIANT verdicts (#{l.first}–#{l.last})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.notes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line pt-3.5 text-[11px] text-ink-3">
              {report.notes.map((n, i) => <li key={i}>· {n}</li>)}
            </ul>
          )}
        </Panel>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          <Label>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="agents" size={13} />
              The queue — least recently checked first
            </span>
          </Label>
          <div className="mt-3 space-y-1.5">
            {!queue && <Spinner />}
            {queue?.queue.length === 0 && <Empty title="Nothing to patrol yet" />}
            {queue?.queue.map((a) => (
              <Link key={a.agent_id} href={`/agent/${a.agent_id}`}
                className="flex items-center gap-2.5 rounded-lg border border-line bg-panel shadow-[var(--shadow-card)] px-3.5 py-2.5 hover:border-signal/40">
                {/* A register of bare hex is hard to read. The address stays the
                    fallback, because an unnamed agent must still be legible. */}
                {a.name ? (
                  <span className="truncate text-[13px] font-medium text-ink">{a.name}</span>
                ) : (
                  <span className="mono truncate text-[12px] text-ink-2">{shortAddress(a.wallet, 5)}</span>
                )}
                <TypeTag type={a.agent_type} className="shrink-0" />
                <ChainTag chain={a.chain} className="shrink-0" />
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] text-ink-3">
                  <Icon name="checked" size={12} className="opacity-70" />
                  {a.last_checked ? relativeTime(a.last_checked) : "never checked"}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <Label>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="waiting" size={13} />
              Awaiting judgement
            </span>
          </Label>
          <div className="mt-3 space-y-1.5">
            {!pending && <Spinner />}
            {needLastSettled && (
              lastSettled ? (
                <Link href={`/challenge/${lastSettled.challenge_id}`}
                  className="block rounded-xl border border-dashed border-line-2 px-5 py-6 text-center hover:border-signal/40">
                  <div className="text-sm text-ink-2">Everything filed has been judged.</div>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-[12px] text-ink-3">Last settled:</span>
                    <span className="text-[12px] text-ink">Challenge #{lastSettled.challenge_id}</span>
                    <VerdictBadge verdict={lastSettled.verdict} size="sm" />
                    <span className="text-[12px] text-ink-3">{relativeTime(lastSettled.settled_at)}</span>
                  </div>
                </Link>
              ) : recent ? (
                // Read the feed and there genuinely is nothing settled yet.
                <Empty title="No challenge is waiting" hint="Nothing has been filed on this register yet." />
              ) : (
                <Empty title="No challenge is waiting" hint="Everything filed has been judged." />
              )
            )}
            {pending?.challenges.map((c) => (
              <Link key={c.challenge_id} href={`/challenge/${c.challenge_id}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel shadow-[var(--shadow-card)] px-3.5 py-2.5 hover:border-signal/40">
                <VerdictBadge verdict="PENDING" size="sm" />
                <span className="mono text-[11px] text-ink-3">{shortAddress(c.tx_hash, 5)}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-ink-3">
                  <Icon name="waiting" size={12} className="opacity-70" />
                  {relativeTime(c.filed_at)}
                </span>
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
                <span className={h.rows.some((r) => r.flagged.length) ? "text-violation-ink" : "text-compliant-ink"}>
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
