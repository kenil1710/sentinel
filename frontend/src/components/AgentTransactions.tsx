"use client";

import useSWR from "swr";
import { Label, Empty, Spinner } from "./ui";
import { blockscoutUrl, formatGen, relativeTime, shortAddress } from "@/lib/format";
import type { Agent } from "@/types";
import type { TxRow } from "@/lib/blockscout";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? "failed"), { transient: body.transient });
  return body as { ok: boolean; count: number; transactions: TxRow[] };
};

export function AgentTransactions({ agent, onPick }: { agent: Agent; onPick: (tx: string) => void }) {
  const { data, error, isLoading } = useSWR(
    `/api/txs?chain=${agent.chain}&wallet=${agent.wallet}`,
    fetcher,
    { refreshInterval: 45_000, shouldRetryOnError: false },
  );

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>Recent activity</Label>
        <a href={blockscoutUrl(agent.chain, "address", agent.wallet)} target="_blank" rel="noreferrer"
          className="text-[11px] text-ink-3 hover:text-signal">{agent.explorer} ↗</a>
      </div>

      <div className="mt-3">
        {isLoading && <Spinner label="Reading the chain…" />}

        {error && (
          <div className={`rounded-lg border p-4 text-[13px] ${
            (error as { transient?: boolean }).transient
              ? "border-neutral/30 bg-neutral/10 text-neutral-ink"
              : "border-violation/30 bg-violation/10 text-violation-ink"}`}>
            {(error as { transient?: boolean }).transient ? (
              <>
                <div className="font-medium">The explorer is not answering right now.</div>
                <div className="mt-1 opacity-90">
                  This is not the same as &ldquo;no activity&rdquo; — it means nothing can be
                  judged on this chain until it recovers. {String(error.message)}
                </div>
              </>
            ) : String(error.message)}
          </div>
        )}

        {data && data.transactions.length === 0 && (
          <Empty title="No recent transactions from this wallet" />
        )}

        <div className="space-y-1.5">
          {data?.transactions.map((tx) => {
            const symbols = [...new Set(tx.transfers.map((t) => t.sym))].filter(Boolean);
            const suspicious = tx.toIsScam || (tx.toIsContract && !tx.toIsVerified);
            return (
              <div key={tx.hash}
                className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel shadow-[var(--shadow-card)] px-3.5 py-2.5">
                <a href={blockscoutUrl(agent.chain, "tx", tx.hash)} target="_blank" rel="noreferrer"
                  className="mono text-[12px] text-ink-2 hover:text-signal">
                  {shortAddress(tx.hash, 6)}
                </a>
                {tx.toName && (
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-ink-2">{tx.toName}</span>
                )}
                {symbols.slice(0, 3).map((s) => (
                  <span key={s} className="mono rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-ink-2">{s}</span>
                ))}
                {BigInt(tx.value || "0") > 0n && (
                  <span className="mono text-[11px] text-ink-3">{formatGen(tx.value, 4)}</span>
                )}
                {suspicious && (
                  <span className="rounded bg-violation/10 px-1.5 py-0.5 text-[10px] text-violation-ink ring-1 ring-violation/25">
                    {tx.toIsScam ? "flagged scam" : "unverified"}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-ink-3">{relativeTime(tx.epoch)}</span>
                <button onClick={() => onPick(tx.hash)}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-3 opacity-0 transition-opacity hover:border-violation/40 hover:text-violation-ink group-hover:opacity-100">
                  Challenge
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
