/** Building the two strings register_agent / update_mandate take, mirroring the contract's parser. */
import type { Clause, Severity } from "@/types";

export interface DraftClause { severity: Severity; text: string }
export interface Table { MINOR: number; MAJOR: number; CRITICAL: number; STEP: number; CAP: number }

export const DEFAULT_TABLE: Table = { MINOR: 500, MAJOR: 2000, CRITICAL: 5000, STEP: 5000, CAP: 20000 };
export const BOUNDS = { MINOR: [100, 2000], MAJOR: [500, 5000], CRITICAL: [1000, 10000], STEP: [0, 10000], CAP: [10000, 30000] } as const;

export function mandateText(clauses: DraftClause[]): string {
  return clauses.map((c, i) => `C${i + 1} [${c.severity}] ${c.text.split(/\s+/).join(" ").trim()}`).join("\n");
}

export function tableText(t: Table): string {
  return `MINOR=${t.MINOR},MAJOR=${t.MAJOR},CRITICAL=${t.CRITICAL},STEP=${t.STEP},CAP=${t.CAP}`;
}

/** The same refusals the contract makes, so a bad draft never costs a transaction. */
export function draftProblems(clauses: DraftClause[], t: Table): string[] {
  const out: string[] = [];
  if (clauses.length === 0) out.push("Add at least one clause.");
  if (clauses.length > 12) out.push("At most 12 clauses.");
  clauses.forEach((c, i) => {
    const body = c.text.split(/\s+/).join(" ").trim();
    if (body.length < 8) out.push(`C${i + 1} is too short to judge anything by (8 characters minimum).`);
    if (body.length > 300) out.push(`C${i + 1} is over 300 characters.`);
    if (/UNTRUSTED_CONTENT/i.test(body)) out.push(`C${i + 1} contains a reserved word.`);
  });
  if (mandateText(clauses).length > 2400) out.push("The whole mandate is capped at 2,400 characters.");
  for (const k of ["MINOR", "MAJOR", "CRITICAL", "STEP", "CAP"] as const) {
    const [lo, hi] = BOUNDS[k];
    if (!Number.isInteger(t[k]) || t[k] < lo || t[k] > hi) out.push(`${k} must be ${lo}–${hi} basis points.`);
  }
  if (!(t.MINOR <= t.MAJOR && t.MAJOR <= t.CRITICAL)) out.push("Severities must not decrease: MINOR ≤ MAJOR ≤ CRITICAL.");
  return out;
}

export const pct = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export function fromClauses(cl: Clause[]): DraftClause[] {
  return cl.map((c) => ({ severity: c.severity, text: c.text }));
}
