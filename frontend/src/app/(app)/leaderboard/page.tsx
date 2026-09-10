"use client";

import useSWR from "swr";
import { Panel, Label, Empty, Spinner, Stat } from "@/components/ui";
import { getLeaderboard, getStats } from "@/lib/contract";
import { formatGen, percentFromBps, shortAddress } from "@/lib/format";

export default function LeaderboardPage() {
  const { data, isLoading } = useSWR("leaderboard", () => getLeaderboard(50), { refreshInterval: 25_000 });
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 25_000 });

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Label>Who is doing the watching</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Watchers</h1>
      <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Ranked by bounties earned. Accuracy counts only DECIDED challenges — an
        inconclusive result says nothing about the watcher, so it is in neither half.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Watchers" value={stats?.watchers ?? "—"} />
        <Stat label="Bounties paid" value={stats ? formatGen(stats.bounties_paid, 4) : "—"} sub="GEN" tone="compliant" />
        <Stat label="Total slashed" value={stats ? formatGen(stats.total_slashed, 4) : "—"} sub="GEN" tone="violation" />
      </div>

      <div className="mt-8">
        {isLoading && <Spinner />}
        {data && data.watchers.length === 0 && (
          <Empty title="Nobody has filed a challenge yet"
            hint="The first watcher to prove a breach appears here." />
        )}

        {data && data.watchers.length > 0 && (
          <Panel className="overflow-hidden">
            <div className="grid grid-cols-[2.2rem_1fr_auto_auto_auto] gap-3 border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-ink-3 sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem]">
              <span>#</span><span>Watcher</span>
              <span className="text-right">Upheld</span>
              <span className="text-right">Accuracy</span>
              <span className="text-right">Earned</span>
            </div>
            {data.watchers.map((w, i) => (
              <div key={w.watcher}
                className="grid grid-cols-[2.2rem_1fr_auto_auto_auto] items-center gap-3 border-b border-line px-5 py-3.5 last:border-0 sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem]">
                <span className={`mono text-sm ${i === 0 ? "text-signal" : "text-ink-3"}`}>{i + 1}</span>
                <span className="mono truncate text-[13px] text-ink">{shortAddress(w.watcher, 6)}</span>
                <span className="mono text-right text-[13px] text-ink-2">
                  {w.upheld}<span className="text-ink-3">/{w.decided}</span>
                </span>
                <span className={`mono text-right text-[13px] ${
                  w.decided === 0 ? "text-ink-3" : w.accuracy_bps >= 5000 ? "text-compliant-ink" : "text-violation-ink"}`}>
                  {w.decided === 0 ? "—" : `${percentFromBps(w.accuracy_bps)}%`}
                </span>
                <span className="mono text-right text-[13px] text-compliant-ink">
                  {formatGen(w.earned, 4)}
                </span>
              </div>
            ))}
          </Panel>
        )}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
        A watcher who files carelessly loses stake to the operators they accuse, so this
        board is a record of judgement rather than of activity. Filing more is not the
        way up it.
      </p>
    </div>
  );
}
