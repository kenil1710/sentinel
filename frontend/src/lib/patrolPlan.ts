/**
 * The patrol's decisions for one transaction, kept pure so they are tested
 * (test/test_patrol.mjs) rather than trusted:
 *   - which mandate version binds it (the one in force at its block time);
 *   - which clauses the bot may stake on (never a linter-flagged one: a
 *     breach there can only come back INCONCLUSIVE);
 *   - which flags a final COMPLIANT precedent withholds, and when to defer
 *     because the precedent check could not be read.
 */
import type { Clause } from "@/types";
import type { Flag } from "./heuristics";

export interface VersionInForce { version: number; effective_from: number; clauses: Clause[] }

export function versionAt<V extends VersionInForce>(versions: V[], epoch: number): V | undefined {
  return [...versions].sort((a, b) => b.version - a.version).find((v) => v.effective_from <= epoch);
}

export function judgeableClauses(version: VersionInForce, flagged: Set<string> | undefined): Clause[] {
  return version.clauses.filter((c) => !flagged?.has(c.id));
}

export interface PrecedentAnswer { match: boolean; key: string; precedent?: { challenge_id: number } | null }
export interface Screened {
  live: Flag[];
  withheld: { clause: string; key: string; challenge_id: number }[];
  /** A precedent check failed: file nothing for this transaction this run. */
  unreadable: boolean;
}

export async function screenFlags(flags: Flag[], kind: string,
  lookup: (clause: string) => Promise<PrecedentAnswer | null>): Promise<Screened> {
  const out: Screened = { live: [], withheld: [], unreadable: false };
  for (const f of flags) {
    if (f.precedentEligible && kind) {
      let p: PrecedentAnswer | null = null;
      try { p = await lookup(f.clause); } catch { p = null; }
      if (p === null) { out.unreadable = true; continue; }
      if (p.match) { out.withheld.push({ clause: f.clause, key: p.key, challenge_id: p.precedent?.challenge_id ?? -1 }); continue; }
    }
    out.live.push(f);
  }
  return out;
}
