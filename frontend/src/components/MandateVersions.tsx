"use client";

import { Label, Panel, SeverityTag } from "./ui";
import { Countdown, useNow } from "./time";
import { absoluteTime } from "@/lib/format";
import { pct } from "@/lib/mandate";
import type { MandateVersion } from "@/types";

/**
 * Every version of a mandate, newest first. A version binds transactions mined
 * from its effective time until the next one takes effect; a queued edit shows
 * its countdown. Clauses the linter marked as not judgeable from on-chain data
 * carry the linter's quote - a breach of those can never be slashed.
 */
export function MandateVersions({ versions, lintAction }: {
  versions: MandateVersion[]; lintAction?: (v: MandateVersion) => React.ReactNode;
}) {
  const now = useNow(5000);
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  const inForce = ordered.find((v) => v.effective_from <= now)?.version;
  return (
    <div className="space-y-4">
      {ordered.map((v, idx) => {
        const next = ordered[idx - 1];
        const queued = v.effective_from > now;
        const flagged = new Map(v.lint_flags.map((f) => [f.clause, f.quote]));
        return (
          <Panel key={v.version} className={`p-5 ${v.version === inForce ? "ring-1 ring-signal/30" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold">Version {v.version}</span>
              {v.version === inForce && <span className="rounded bg-signal/10 px-1.5 py-0.5 text-[11px] font-medium text-signal">In force</span>}
              {queued && <span className="rounded bg-neutral/10 px-1.5 py-0.5 text-[11px] font-medium text-neutral-ink">Queued — <Countdown at={v.effective_from} open="takes effect in" closed="took effect" /></span>}
              {!queued && v.version !== inForce && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2">Superseded</span>}
              <span className="mono ml-auto text-[11px] text-ink-3" title="sha256 of the canonical clause text">sha256 {v.mandate_hash.slice(0, 16)}…</span>
            </div>
            <p className="mt-1 text-xs text-ink-2">
              Binds transactions mined from {absoluteTime(v.effective_from)}{next ? ` until ${absoluteTime(next.effective_from)}` : " onward"}.
              Published {absoluteTime(v.created_at)}.
            </p>
            <ul className="mt-3 space-y-2">
              {v.clauses.map((c) => (
                <li key={c.id} className="flex gap-2.5 text-[13.5px] leading-snug">
                  <span className="mono w-7 shrink-0 font-semibold">{c.id}</span>
                  <SeverityTag severity={c.severity} />
                  <span className="min-w-0 flex-1">
                    {c.text}
                    {flagged.has(c.id) && (
                      <span className="mt-1 block rounded-md border border-neutral/30 bg-neutral/5 px-2 py-1 text-xs text-neutral-ink">
                        Linter: not judgeable from on-chain data — “{flagged.get(c.id)}”. A breach can never be slashed under this clause.
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-ink-2">
              <span>Slash: MINOR <b className="mono">{pct(v.severity_bps.MINOR)}</b>, MAJOR <b className="mono">{pct(v.severity_bps.MAJOR)}</b>, CRITICAL <b className="mono">{pct(v.severity_bps.CRITICAL)}</b> of the bond at filing</span>
              <span>Repeat: +{pct(v.repeat_step_bps)} per prior breach, capped at ×{(v.repeat_cap_bps / 10000).toFixed(2)}</span>
              <span className="ml-auto">
                Linter: <b className={v.lint_status === "DONE" ? "text-compliant-ink" : v.lint_status === "PENDING" ? "text-signal" : "text-neutral-ink"}>{v.lint_status}</b>
                {v.lint_status === "DONE" && ` — ${v.lint_flags.length} clause${v.lint_flags.length === 1 ? "" : "s"} flagged`}
                {v.lint_status === "PENDING" && <> — window <Countdown at={v.lint_deadline} /></>}
              </span>
              {lintAction?.(v)}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

export function LintSummary({ v }: { v: MandateVersion }) {
  return (
    <div>
      <Label>Linter result</Label>
      <p className="mt-1 text-sm">{v.lint_status === "DONE"
        ? (v.lint_flags.length ? `${v.lint_flags.length} clause(s) cannot be judged from on-chain data.` : "Every clause can be judged from on-chain data.")
        : v.lint_status === "PENDING" ? "Not linted yet." : "The validators did not agree on the linter result before its deadline; recorded as INCONCLUSIVE."}</p>
    </div>
  );
}
