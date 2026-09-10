"use client";

/**
 * What the register has actually done, over time.
 *
 * Every number on this page is read from the contract — there is no analytics
 * store, no event pipeline and nothing cached server-side, because a compliance
 * record that disagrees with the chain would be worse than no record at all.
 *
 * The page is therefore honest about its own thinness. Sentinel is young: some
 * of these series are a handful of points, and a chart drawn from two readings
 * would invent a trend nobody measured. Each card decides for itself whether it
 * has enough points to draw, and shows the aggregate figures when it does not.
 */

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChainTag, Empty, Label, Panel, Spinner, Stat, VerdictBadge } from "@/components/ui";
import { ChartCard, CountBars, DataTable, FigureFallback, ShareDonut, TrendChart } from "@/components/charts";
import {
  activityTimeline, byChain, countSeries, MIN_CHART_POINTS,
  SERIES, sumWei, topViolatedMandates, weiSeries,
} from "@/lib/analytics";
import type { WeiPoint } from "@/lib/analytics";
import { getActiveAgents, getAgentHistory, getChallenges, getLeaderboard, getStats } from "@/lib/contract";
import { CHAIN_LABEL, formatGen, percentFromBps, relativeTime, shortAddress } from "@/lib/format";
import type { Challenge } from "@/types";

const REFRESH = 30_000;
const SWR_OPTS = { refreshInterval: REFRESH, keepPreviousData: true } as const;

export default function AnalyticsPage() {
  const { data: stats, error: statsError } = useSWR("stats", getStats, SWR_OPTS);
  const { data: challengeFeed } = useSWR("analytics-challenges", () => getChallenges(60), SWR_OPTS);
  const { data: agentFeed } = useSWR("analytics-agents", () => getActiveAgents(60), SWR_OPTS);
  const { data: board } = useSWR("leaderboard", () => getLeaderboard(25), SWR_OPTS);

  const agents = useMemo(() => agentFeed?.agents ?? [], [agentFeed]);
  const challenges: Challenge[] = useMemo(() => challengeFeed?.challenges ?? [], [challengeFeed]);
  const loading = !stats && !statsError;

  /*
   * The list views carry only a 60-character mandate preview, and the whole
   * point of this card is WHICH RULE was broken. `get_agent_history` returns the
   * full published rule, so it is fetched for the few agents that have a
   * violation — never for the whole register.
   */
  const violatorIds = useMemo(
    () =>
      agents
        .filter((a) => a.violation_count > 0)
        .sort((a, b) => b.violation_count - a.violation_count)
        .slice(0, 6)
        .map((a) => a.agent_id),
    [agents],
  );

  const { data: histories } = useSWR(
    violatorIds.length ? ["analytics-histories", violatorIds.join(",")] : null,
    () => Promise.all(violatorIds.map((id) => getAgentHistory(id, 40))),
    { keepPreviousData: true },
  );

  const historyMap = useMemo(() => {
    const out: Record<number, { mandate: string; challenges: Challenge[] }> = {};
    for (const h of histories ?? []) out[h.agent_id] = { mandate: h.mandate, challenges: h.challenges };
    return out;
  }, [histories]);

  // ── Series ───────────────────────────────────────────────────────────────

  /** A breach exists when the validators say so, so this is keyed to settlement. */
  const violations = useMemo(
    () => countSeries(challenges.filter((c) => c.verdict === "VIOLATION" && c.settled_at > 0).map((c) => c.settled_at)),
    [challenges],
  );

  const bounties = useMemo(
    () =>
      weiSeries(
        challenges
          .filter((c) => c.settled_at > 0 && (c.settlement?.bounty ?? "0") !== "0")
          .map((c) => ({ at: c.settled_at, wei: c.settlement.bounty })),
      ),
    [challenges],
  );

  const registrations = useMemo(
    () => countSeries(agents.map((a) => a.registered_at)),
    [agents],
  );

  /*
   * The donut is about challenges. Until at least two have been filed there is
   * no distribution to show, so it falls back to where the REGISTER sits — a
   * real reading of the same dimension rather than an empty ring.
   */
  const showChallengeChains = challenges.length >= 2;
  const chainSlices = useMemo(
    () => byChain(showChallengeChains ? challenges : agents),
    [showChallengeChains, challenges, agents],
  );

  const mandates = useMemo(() => topViolatedMandates(agents, historyMap), [agents, historyMap]);
  const worstMandate = Math.max(1, ...mandates.map((m) => m.violations));

  const timeline = useMemo(() => activityTimeline(agents, challenges), [agents, challenges]);
  const examined = agents.filter((a) => a.last_checked > 0).length;

  const stakedTotal = useMemo(() => sumWei((board?.watchers ?? []).map((w) => w.staked)), [board]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>The record so far</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Read live from the contract on every load — there is no analytics database behind
        this page. Where a series has fewer than {MIN_CHART_POINTS} points in time, the card
        shows the <span className="text-ink">totals instead of a line</span>: two readings are
        a pair of numbers, not a trend.
      </p>

      {statsError && (
        <div className="mt-6 rounded-lg border border-violation/30 bg-violation/10 p-4 text-sm text-violation-ink">
          Could not read the contract: {String((statsError as Error)?.message ?? statsError)}
        </div>
      )}

      {loading && <div className="mt-8"><Spinner label="Reading the register…" /></div>}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agents on duty" value={stats?.agents_active ?? "—"}
          sub={stats ? `${stats.agents_registered} ever registered` : undefined} tone="signal" />
        <Stat label="Bond under watch" value={stats ? formatGen(stats.bond_under_watch, 2) : "—"} sub="GEN staked by operators" />
        <Stat label="Challenges filed" value={stats?.challenges_filed ?? "—"}
          sub={stats ? `${stats.challenges_settled} settled` : undefined} />
        <Stat label="Breaches proven" value={stats?.violations ?? "—"}
          sub={stats && stats.challenges_settled > 0 ? `${percentFromBps(stats.violation_rate_bps)}% of decided` : "none yet"}
          tone={stats && stats.violations > 0 ? "violation" : "ink"} />
      </div>

      {/* Cards size to their own content: a stretched card with a void under its
          last row reads as missing data rather than as a short answer. */}
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
        {/* 1 ── Violations over time */}
        <ChartCard
          title="Violations over time"
          hint={violations.drawable ? "cumulative, by settlement" : undefined}
          table={violations.drawable
            ? <DataTable head={["Window", "New", "Total"]}
                rows={violations.points.map((p) => [p.label, p.value, p.total])} />
            : undefined}>
          {violations.drawable ? (
            <TrendChart points={violations.points} colour={SERIES.violation} gradientId="grad-violations"
              valueLabel="breaches proven"
              format={(p) => ({ total: String(p.total), delta: `+${p.value}` })} />
          ) : (
            <FigureFallback
              reason={
                stats && stats.challenges_settled === 0
                  ? "Nothing has been judged yet, so there is no history to plot. The first settled challenge starts this line."
                  : "Too few settled challenges to plot a line without inventing a trend. These are the running totals."
              }
              figures={[
                { label: "Breaches proven", value: stats?.violations ?? "—", tone: "violation" },
                { label: "Cleared", value: stats?.compliant ?? "—", tone: "compliant" },
                { label: "Inconclusive", value: stats?.inconclusive ?? "—" },
                { label: "Filed", value: stats?.challenges_filed ?? "—" },
                { label: "Settled", value: stats?.challenges_settled ?? "—" },
                { label: "Violation rate", value: stats ? `${percentFromBps(stats.violation_rate_bps)}%` : "—",
                  sub: "of decided challenges" },
              ]} />
          )}
        </ChartCard>

        {/* 2 ── Bounties earned over time */}
        <ChartCard
          title="Bounties earned over time"
          hint={bounties.drawable ? "cumulative GEN to watchers" : undefined}
          table={bounties.drawable
            ? <DataTable head={["Window", "Paid", "Total"]}
                rows={bounties.points.map((p) => [p.label, formatGen(p.wei, 4), formatGen(p.totalWei, 4)])} />
            : undefined}>
          {bounties.drawable ? (
            <TrendChart points={bounties.points} colour={SERIES.bounty} gradientId="grad-bounties"
              valueLabel="paid to watchers"
              format={(p) => ({
                total: `${formatGen((p as WeiPoint).totalWei, 4)} GEN`,
                delta: `+${formatGen((p as WeiPoint).wei, 4)} GEN`,
              })} />
          ) : (
            <FigureFallback
              reason="A bounty is only paid when a challenge is upheld, and too few have settled to draw a curve. These are the totals the contract holds."
              figures={[
                { label: "Bounties paid", value: stats ? formatGen(stats.bounties_paid, 4) : "—", sub: "GEN", tone: "compliant" },
                { label: "Slashed from bonds", value: stats ? formatGen(stats.total_slashed, 4) : "—", sub: "GEN", tone: "violation" },
                { label: "Watchers", value: stats?.watchers ?? "—", sub: "have filed at least once" },
                { label: "Stake at risk", value: formatGen(stakedTotal, 4), sub: "GEN put up by watchers" },
              ]} />
          )}
        </ChartCard>

        {/* 3 ── Agents registered over time */}
        <ChartCard
          title="Agents registered over time"
          hint={registrations.drawable ? "new registrations per window" : undefined}
          table={registrations.drawable
            ? <DataTable head={["Window", "New", "Total"]}
                rows={registrations.points.map((p) => [p.label, p.value, p.total])} />
            : undefined}>
          {registrations.drawable ? (
            <CountBars points={registrations.points} colour={SERIES.registered} valueLabel="registered" />
          ) : (
            <FigureFallback
              reason="The register is too new to have a shape. Every agent that registers adds a bar here."
              figures={[
                { label: "Registered", value: stats?.agents_registered ?? "—", tone: "signal" },
                { label: "On duty", value: stats?.agents_active ?? "—" },
                { label: "Bond under watch", value: stats ? formatGen(stats.bond_under_watch, 2) : "—", sub: "GEN" },
              ]} />
          )}
        </ChartCard>

        {/* 4 ── Chain distribution */}
        <ChartCard
          title={showChallengeChains ? "Challenges by chain" : "Agents by chain"}
          hint={showChallengeChains ? undefined : "the register, until challenges have a shape"}
          note={showChallengeChains
            ? undefined
            : `Only ${challenges.length} ${challenges.length === 1 ? "challenge has" : "challenges have"} been filed, which is not a distribution. This is where the agents under watch actually sit.`}
          table={<DataTable head={["Chain", showChallengeChains ? "Challenges" : "Agents", "Share"]}
            rows={chainSlices.map((s) => [CHAIN_LABEL[s.chain] ?? s.chain, s.count, s.count > 0 ? `${Math.round(s.share)}%` : "—"])} />}>
          {chainSlices.some((s) => s.count > 0) ? (
            <ShareDonut slices={chainSlices} unit={showChallengeChains ? "challenges" : "agents"} />
          ) : (
            <Empty title="Nothing on any chain yet" hint="Register an agent and this fills in." />
          )}
        </ChartCard>

        {/* 5 ── Top violated mandates */}
        <ChartCard
          title="Top violated mandates"
          hint={mandates.length ? "ranked by upheld challenges" : undefined}
          table={mandates.length
            ? <DataTable head={["Agent", "Violations", "Decided"]}
                rows={mandates.map((m) => [`#${m.agent_id} ${m.name}`, m.violations, m.decided])} />
            : undefined}>
          {mandates.length === 0 ? (
            <Empty title="No mandate has been broken yet"
              hint="A rule appears here the moment the validators uphold a challenge against it." />
          ) : (
            <ol className="space-y-3.5">
              {mandates.map((m, i) => (
                <li key={m.agent_id}>
                  <div className="flex items-center gap-2.5">
                    <span className="mono text-[11px] text-ink-3">{i + 1}</span>
                    <Link href={`/agent/${m.agent_id}`} className="truncate text-[13px] text-ink hover:text-signal">
                      {m.name}
                    </Link>
                    <ChainTag chain={m.chain} />
                    <span className="mono ml-auto shrink-0 text-[12px] text-violation-ink">
                      {m.violations}
                      <span className="text-ink-3">/{m.decided} decided</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
                    <div className="h-full rounded-full bg-violation"
                      style={{ width: `${Math.max(6, (m.violations / worstMandate) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-2">
                    {m.mandate || "No mandate text published."}
                  </p>
                  {m.lastViolationAt > 0 && (
                    <p className="mt-1 text-[11px] text-ink-3">
                      last upheld {relativeTime(m.lastViolationAt)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </ChartCard>

        {/* 6 ── Patrol activity timeline */}
        <ChartCard
          title="Patrol activity"
          hint={timeline.length ? "everything the register has done, newest first" : undefined}>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Patrols run", value: stats?.patrols_run ?? "—", sub: "on-chain stamps" },
              { label: "Agents examined", value: agents.length ? examined : "—", sub: `of ${agents.length || "—"} on duty` },
              { label: "Never examined", value: agents.length ? agents.length - examined : "—", sub: "awaiting a first look" },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-line bg-panel-2/50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{f.label}</div>
                <div className="mono mt-1 text-lg font-semibold text-ink">{f.value}</div>
                <div className="mt-0.5 text-[10px] text-ink-3">{f.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            {timeline.length === 0 ? (
              <Empty title="Nothing has happened yet" hint="Registrations, filings and judgements land here." />
            ) : (
              <ol className="relative space-y-3.5 border-l border-line pl-5">
                {timeline.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      className={`absolute -left-[1.53rem] top-1.5 size-2 rounded-full ring-2 ring-panel ${
                        e.kind === "settled"
                          ? e.verdict === "VIOLATION" ? "bg-violation"
                            : e.verdict === "COMPLIANT" ? "bg-compliant" : "bg-neutral"
                          : e.kind === "registered" ? "bg-ink-3" : "bg-signal"
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {e.href ? (
                        <Link href={e.href} className="text-[13px] text-ink hover:text-signal">{e.title}</Link>
                      ) : (
                        <span className="text-[13px] text-ink">{e.title}</span>
                      )}
                      <span className="text-[12px] text-ink-2">{e.detail}</span>
                      {e.kind === "settled" && e.verdict && <VerdictBadge verdict={e.verdict} size="sm" />}
                      <span className="mono ml-auto shrink-0 text-[11px] text-ink-3">{relativeTime(e.at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </ChartCard>
      </div>

      {board && board.watchers.length > 0 && (
        <Panel className="mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">Where the bounties went</h2>
            <span className="text-[11px] text-ink-3">the same ledger the watcher board is ranked on</span>
            <Link href="/leaderboard" className="ml-auto text-[12px] text-signal hover:underline">
              Full board →
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {board.watchers.slice(0, 5).map((w) => (
              <li key={w.watcher} className="flex items-center gap-3 text-[12px]">
                <span className="mono truncate text-ink-2">{shortAddress(w.watcher, 6)}</span>
                <span className="text-ink-3">
                  {w.upheld} upheld of {w.decided} decided
                </span>
                <span className="mono ml-auto text-compliant-ink">{formatGen(w.earned, 4)} GEN</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="mt-8 text-[12px] leading-relaxed text-ink-3">
        Chain colours on this page are chart colours, not the badge colours used elsewhere:
        the four badge tints are all cool blues and are indistinguishable as adjacent arcs to
        a reader with deuteranopia. Every figure drawn here is also written out under
        <span className="text-ink-2"> Table view</span>.
      </p>
    </div>
  );
}
