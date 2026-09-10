"use client";

/**
 * The chart vocabulary for Sentinel's analytics page.
 *
 * Everything here obeys two rules the rest of the app already follows:
 *
 * 1. THE THREE VERDICT COLOURS MEAN EXACTLY ONE THING. Red is a proven breach,
 *    green is money that reached a watcher, cyan is something being watched.
 *    No series borrows them for decoration.
 *
 * 2. COLOUR IS NEVER THE ONLY CHANNEL. Every chart carries its numbers in a
 *    table view underneath, so a reader who cannot separate two arcs — or who
 *    is on a printer, or reading through a screen reader — still gets the data.
 */

import type { ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Panel } from "./ui";
import type { ChainSlice, CountPoint, WeiPoint } from "@/lib/analytics";
import { CHAIN_LABEL } from "@/lib/format";

const GRID = "var(--color-line)";
const TICK = { fill: "var(--color-ink-3)", fontSize: 11 };
const AXIS_LINE = { stroke: "var(--color-line-2)" };
const PLOT_HEIGHT = 232;

/** A card with a title, a plot, and the plot's numbers one disclosure away. */
export function ChartCard({
  title, hint, note, children, table, className = "",
}: {
  title: string;
  hint?: string;
  note?: ReactNode;
  children: ReactNode;
  table?: ReactNode;
  className?: string;
}) {
  return (
    /* `min-w-0`: a grid item defaults to `min-width: auto`, and recharts sizes its
       SVG from the box it is given — without this the plot refuses to shrink and
       drags the whole page into a horizontal scroll on a phone. */
    <Panel className={`min-w-0 p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
      </div>
      {note && <div className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{note}</div>}
      <div className="mt-5">{children}</div>
      {table && (
        <details className="mt-5 border-t border-line pt-3">
          <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink-2">
            Table view
          </summary>
          <div className="mt-3 max-h-64 overflow-auto">{table}</div>
        </details>
      )}
    </Panel>
  );
}

/**
 * What a card shows when the chain has not lived long enough to draw a line.
 * Two points are a pair of readings, not a trend, and drawing them as one
 * invites a reader to see a slope that was never measured.
 */
export function FigureFallback({
  reason, figures,
}: {
  reason: string;
  figures: { label: string; value: ReactNode; sub?: string; tone?: "ink" | "signal" | "violation" | "compliant" }[];
}) {
  const colour = {
    ink: "text-ink", signal: "text-signal",
    violation: "text-violation-ink", compliant: "text-compliant-ink",
  };
  // Four figures read as a square; anything else fills three across.
  const cols = figures.length === 4 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <div>
      <div className={`grid grid-cols-2 gap-2.5 ${cols}`}>
        {figures.map((f) => (
          <div key={f.label} className="rounded-lg border border-line bg-panel-2/50 px-3.5 py-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{f.label}</div>
            <div className={`mono mt-1.5 text-xl font-semibold ${colour[f.tone ?? "ink"]}`}>{f.value}</div>
            {f.sub && <div className="mt-0.5 text-[11px] text-ink-3">{f.sub}</div>}
          </div>
        ))}
      </div>
      <p className="mt-3.5 text-[12px] leading-relaxed text-ink-3">{reason}</p>
    </div>
  );
}

function TipShell({ heading, rows }: { heading: string; rows: { label: string; value: string; colour?: string }[] }) {
  return (
    <div className="rounded-lg border border-line-2 bg-panel px-3 py-2.5 shadow-[var(--shadow-card-lifted)]">
      <div className="mono text-[11px] text-ink-3">{heading}</div>
      {rows.map((r) => (
        <div key={r.label} className="mt-1.5 flex items-center gap-2 text-[12px]">
          {r.colour && <span className="size-2 shrink-0 rounded-sm" style={{ background: r.colour }} />}
          <span className="text-ink-2">{r.label}</span>
          <span className="mono ml-auto font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A cumulative trend. Area rather than bare line because a single series over
 * time reads better with the ground filled in, and cumulative because the
 * question these two charts answer is "how much, by now" rather than "how many
 * in this particular ten minutes".
 */
export function TrendChart({
  points, colour, valueLabel, format, gradientId,
}: {
  points: (CountPoint | WeiPoint)[];
  colour: string;
  valueLabel: string;
  format: (p: CountPoint | WeiPoint) => { total: string; delta: string };
  gradientId: string;
}) {
  return (
    <div className="w-full" style={{ height: PLOT_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={AXIS_LINE}
            minTickGap={24} interval="preserveStartEnd" />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={52} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "var(--color-line-2)", strokeWidth: 1 }}
            content={(props) => {
              const row = props.payload?.[0]?.payload as (CountPoint | WeiPoint) | undefined;
              if (!row) return null;
              const f = format(row);
              return (
                <TipShell heading={row.label}
                  rows={[
                    { label: valueLabel, value: f.total, colour },
                    { label: "in this window", value: f.delta },
                  ]} />
              );
            }} />
          <Area type="monotone" dataKey="total" stroke={colour} strokeWidth={2}
            fill={`url(#${gradientId})`} dot={false}
            activeDot={{ r: 4, fill: colour, stroke: "var(--color-panel)", strokeWidth: 2 }}
            isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** New arrivals per window. Counts, so bars — a count is a magnitude, not a level. */
export function CountBars({
  points, colour, valueLabel,
}: {
  points: CountPoint[];
  colour: string;
  valueLabel: string;
}) {
  return (
    <div className="w-full" style={{ height: PLOT_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -14 }} barCategoryGap="20%">
          <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={AXIS_LINE}
            minTickGap={20} interval="preserveStartEnd" />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={52} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--color-panel-2)", fillOpacity: 0.6 }}
            content={(props) => {
              const row = props.payload?.[0]?.payload as CountPoint | undefined;
              if (!row) return null;
              return (
                <TipShell heading={row.label}
                  rows={[
                    { label: valueLabel, value: String(row.value), colour },
                    { label: "running total", value: String(row.total) },
                  ]} />
              );
            }} />
          <Bar dataKey="value" fill={colour} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Part-to-whole across at most five chains.
 *
 * The legend is not optional decoration here: one of the five steps sits just
 * under the 3:1 contrast line against the panel, so every slice is also named
 * and numbered beside the ring.
 */
export function ShareDonut({ slices, unit }: { slices: ChainSlice[]; unit: string }) {
  const drawn = slices.filter((s) => s.count > 0);
  const total = drawn.reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <div className="relative shrink-0" style={{ width: 176, height: 176 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={drawn} dataKey="count" nameKey="chain" innerRadius="62%" outerRadius="94%"
              paddingAngle={drawn.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {drawn.map((s) => <Cell key={s.chain} fill={s.colour} />)}
            </Pie>
            <Tooltip
              content={(props) => {
                const row = props.payload?.[0]?.payload as ChainSlice | undefined;
                if (!row) return null;
                return (
                  <TipShell heading={CHAIN_LABEL[row.chain] ?? row.chain}
                    rows={[
                      { label: unit, value: String(row.count), colour: row.colour },
                      { label: "share", value: `${Math.round(row.share)}%` },
                    ]} />
                );
              }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="mono text-2xl font-semibold text-ink">{total}</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{unit}</div>
          </div>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1.5">
        {slices.map((s) => (
          <li key={s.chain} className="flex items-center gap-2.5 text-[12px]">
            <span className="size-2.5 shrink-0 rounded-sm"
              style={{ background: s.count > 0 ? s.colour : "var(--color-line-2)" }} />
            <span className={s.count > 0 ? "text-ink-2" : "text-ink-3"}>
              {CHAIN_LABEL[s.chain] ?? s.chain}
            </span>
            <span className="mono ml-auto tabular-nums text-ink">{s.count}</span>
            <span className="mono w-11 shrink-0 text-right tabular-nums text-ink-3">
              {s.count > 0 ? `${Math.round(s.share)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The table twin every chart on this page carries. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-[11px]">
      <thead>
        <tr className="text-ink-3">
          {head.map((h, i) => (
            <th key={h} className={`pb-1.5 font-medium uppercase tracking-[0.12em] ${i === 0 ? "" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="mono">
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-line">
            {row.map((cell, j) => (
              <td key={j} className={`py-1.5 tabular-nums ${j === 0 ? "text-ink-2" : "text-right text-ink"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
