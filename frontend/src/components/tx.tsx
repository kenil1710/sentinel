"use client";

/**
 * The lifecycle of one write, shown as it happens: signing, submitted (with
 * the hash), accepted, then finalized. "Accepted" is only shown as success
 * after the contract has been re-read and shows the change - see lib/contract.
 */
import { useCallback, useState } from "react";
import type { TxProgress } from "@/types";
import { explorerUrl } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";

const ORDER = ["signing", "submitted", "accepted", "finalized"] as const;
const LABEL: Record<string, string> = { signing: "Sign", submitted: "Submitted", accepted: "Accepted", finalized: "Finalized" };

export function useTx() {
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <R,>(work: (onProgress: (p: TxProgress) => void) => Promise<R>): Promise<R> => {
    setBusy(true);
    setProgress(null);
    try {
      return await work((p) => setProgress(p));
    } finally {
      setBusy(false);
    }
  }, []);
  return { progress, busy, run, reset: () => setProgress(null) };
}

export function TxStatus({ progress, success }: { progress: TxProgress | null; success?: string }) {
  if (!progress) return null;
  const failed = progress.phase === "failed" || progress.phase === "rejected";
  const reached = failed ? -1 : ORDER.indexOf(progress.phase as (typeof ORDER)[number]);
  return (
    <div role="status" aria-live="polite"
      className={`mt-3 rounded-lg border px-3.5 py-3 text-[13px] ${
        failed ? "border-violation/30 bg-violation/5" : "border-line bg-panel-2"}`}>
      {!failed && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {ORDER.map((step, i) => {
            const done = i < reached || (i === reached && progress.phase !== "signing" && progress.phase !== "submitted") || progress.phase === "finalized";
            const current = i === reached && !done;
            return (
              <li key={step} className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 ${done ? "text-compliant-ink font-medium" : current ? "text-signal font-medium" : "text-ink-3"}`}>
                  <span className={`size-2 rounded-full ${done ? "bg-compliant" : current ? "bg-signal-bright live-dot" : "bg-line-2"}`} />
                  {LABEL[step]}
                </span>
                {i < ORDER.length - 1 && <span className="text-ink-3" aria-hidden="true">→</span>}
              </li>
            );
          })}
        </ol>
      )}
      <p className={`mt-1.5 ${failed ? "text-violation-ink" : "text-ink-2"}`}>
        {progress.phase === "rejected" ? "Turned down by the contract: " : failed ? "Not done: " : ""}
        {progress.phase === "accepted" && success && !progress.message.startsWith("Accepted. Re-reading") ? success : progress.message}
        {progress.phase === "rejected" && " Any value sent was credited to your claimable balance."}
      </p>
      {progress.hash && (
        <a href={explorerUrl("tx", progress.hash)} target="_blank" rel="noreferrer"
          className="mono mt-1 inline-block text-xs text-signal hover:underline">
          tx {shortAddress(progress.hash, 6)} on the Studio Dev explorer ↗
        </a>
      )}
    </div>
  );
}
