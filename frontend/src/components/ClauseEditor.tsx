"use client";

import type { DraftClause, Table } from "@/lib/mandate";
import { BOUNDS, pct } from "@/lib/mandate";
import type { Severity } from "@/types";

const SEVERITIES: Severity[] = ["MINOR", "MAJOR", "CRITICAL"];

/**
 * A mandate is numbered clauses, each with the severity the operator assigns.
 * The ids are positional (C1, C2…) because that is how the contract numbers
 * them; the text is what validators read.
 */
export function ClauseEditor({ clauses, onChange, idPrefix = "clause" }: {
  clauses: DraftClause[]; onChange: (c: DraftClause[]) => void; idPrefix?: string;
}) {
  const set = (i: number, patch: Partial<DraftClause>) =>
    onChange(clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2.5">
      {clauses.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3 sm:flex-row sm:items-start">
          <div className="flex items-center gap-2 sm:w-40 sm:shrink-0">
            <span className="mono w-7 text-sm font-semibold text-ink">C{i + 1}</span>
            <label className="sr-only" htmlFor={`${idPrefix}-sev-${i}`}>Severity of clause C{i + 1}</label>
            <select id={`${idPrefix}-sev-${i}`} value={c.severity} onChange={(e) => set(i, { severity: e.target.value as Severity })}
              className="rounded-md border border-line-2 bg-panel px-2 py-1.5 text-xs font-medium">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="sr-only" htmlFor={`${idPrefix}-text-${i}`}>Text of clause C{i + 1}</label>
          <textarea id={`${idPrefix}-text-${i}`} rows={2} value={c.text} maxLength={300}
            onChange={(e) => set(i, { text: e.target.value })}
            placeholder="e.g. Only swap through the Uniswap Universal Router 0x66a9893cc07d91d95644aedd05d03f95e1dba8af."
            className="min-w-0 flex-1 rounded-md border border-line-2 bg-panel px-2.5 py-1.5 text-[13px] leading-snug" />
          <button type="button" onClick={() => onChange(clauses.filter((_, j) => j !== i))}
            disabled={clauses.length <= 1} aria-label={`Remove clause C${i + 1}`}
            className="self-end rounded-md px-2 py-1 text-xs text-ink-2 hover:text-violation-ink disabled:opacity-40 sm:self-start">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...clauses, { severity: "MAJOR", text: "" }])}
        disabled={clauses.length >= 12}
        className="rounded-md border border-dashed border-line-2 px-3 py-1.5 text-sm text-ink-2 hover:border-signal hover:text-signal disabled:opacity-40">
        + Add a clause
      </button>
    </div>
  );
}

/** The severity table: what each label costs, and how repeat breaches compound. */
export function TableEditor({ table, onChange, idPrefix = "table" }: { table: Table; onChange: (t: Table) => void; idPrefix?: string }) {
  const field = (k: keyof Table, label: string, hint: string) => (
    <div>
      <label htmlFor={`${idPrefix}-${k}`} className="text-xs font-medium text-ink-2">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input id={`${idPrefix}-${k}`} type="number" inputMode="numeric" min={BOUNDS[k][0]} max={BOUNDS[k][1]} step={50}
          value={table[k]} onChange={(e) => onChange({ ...table, [k]: Number(e.target.value) })}
          className="mono w-24 rounded-md border border-line-2 bg-panel px-2 py-1.5 text-sm" />
        <span className="text-xs text-ink-3">bps = {pct(table[k])}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-3">{hint}</p>
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {field("MINOR", "MINOR breach", "of the bond at filing")}
      {field("MAJOR", "MAJOR breach", "of the bond at filing")}
      {field("CRITICAL", "CRITICAL breach", "of the bond at filing")}
      {field("STEP", "Repeat step", "added per prior final breach")}
      {field("CAP", "Repeat cap", "the multiplier never exceeds this")}
    </div>
  );
}
