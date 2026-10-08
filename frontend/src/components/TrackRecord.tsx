"use client";

import { Label, Panel } from "./ui";
import { absoluteTime, formatGen, relativeTime } from "@/lib/format";
import type { TrackView } from "@/types";

/**
 * Every figure is computed by the contract from final rulings only; the
 * "matches storage" line is the contract recomputing the same figures from the
 * agent's challenge records and comparing them to its counters.
 */
export function TrackRecord({ t }: { t: TrackView }) {
  const r = t.track_record;
  const cell = (label: string, value: React.ReactNode, tone = "text-ink") => (
    <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`mono mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>Track record</Label>
        <span className={`ml-auto text-[11px] ${t.views_match_storage ? "text-compliant-ink" : "text-violation-ink"}`}>
          {t.views_match_storage ? "✓ recomputed from challenge records — matches the counters" : "✗ recomputation disagrees with the counters"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cell("Breaches · minor", r.breaches.MINOR, r.breaches.MINOR ? "text-violation-ink" : "text-ink")}
        {cell("Breaches · major", r.breaches.MAJOR, r.breaches.MAJOR ? "text-violation-ink" : "text-ink")}
        {cell("Breaches · critical", r.breaches.CRITICAL, r.breaches.CRITICAL ? "text-violation-ink" : "text-ink")}
        {cell("Total slashed", `${formatGen(r.total_slashed, 4)} GEN`)}
        {cell("Cleared (compliant)", r.compliant, r.compliant ? "text-compliant-ink" : "text-ink")}
        {cell("Inconclusive / void", `${r.inconclusive} / ${r.void}`)}
        {cell("Overrulings", r.overrulings)}
        {cell("Operator appeals won / lost", `${r.appeals_won} / ${r.appeals_lost}`)}
      </div>
      <p className="mt-3 text-xs text-ink-2">
        Last breach: {r.last_breach_at ? <span title={absoluteTime(r.last_breach_at)}>{relativeTime(r.last_breach_at)}</span> : "none on record"}.
        Only FINAL rulings count; provisional ones are shown on each challenge.
      </p>
    </Panel>
  );
}
