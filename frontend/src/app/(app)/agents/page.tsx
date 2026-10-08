"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChainTag, Empty, Label, Spinner, StandingBadge, StatusTag, TypeTag } from "@/components/ui";
import { getAgents } from "@/lib/contract";
import { formatGen, relativeTime, shortAddress } from "@/lib/format";
import { getDeployment } from "@/lib/genlayer";

const CHAINS = ["all", "ethereum", "base", "arbitrum", "polygon", "robinhood"];

export default function AgentsPage() {
  const { data, error } = useSWR(["agents", getDeployment()], () => getAgents(0, 100), { refreshInterval: 30_000 });
  const [chain, setChain] = useState("all");
  const [showRetired, setShowRetired] = useState(false);
  const rows = useMemo(() => (data?.agents ?? []).filter((a) => (chain === "all" || a.chain === chain) && (showRetired || a.status !== "RETIRED")), [data, chain, showRetired]);
  const retired = (data?.agents ?? []).filter((a) => a.status === "RETIRED").length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>The register</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agents under a bonded mandate</h1>
      <p className="mt-2 max-w-3xl text-[14px] text-ink-2">
        Every row is read from the contract. A track record counts FINAL rulings only; good standing means active, bonded at or above the minimum, no open provisional breach and no final critical breach.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by chain">
        {CHAINS.map((c) => (
          <button key={c} onClick={() => setChain(c)} aria-pressed={chain === c}
            className={`rounded-md px-3 py-1.5 text-sm ${chain === c ? "bg-ink text-white" : "border border-line bg-panel text-ink-2 hover:text-ink"}`}>
            {c === "all" ? "All chains" : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
        {retired > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show {retired} retired
          </label>
        )}
      </div>
      <div className="mt-5">
        {error ? <Empty title="The chain did not answer" hint={String(error.message ?? error)} /> : !data ? <Spinner /> : rows.length === 0 ? <Empty title="No agents here yet" /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((a) => {
              const t = a.track_record;
              return (
                <Link key={a.agent_id} href={`/agent/${a.agent_id}`}
                  className="block rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-card)] transition-colors hover:border-signal/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-xs text-ink-3">#{a.agent_id}</span>
                    <ChainTag chain={a.chain} /><TypeTag type={a.agent_type} /><StatusTag status={a.status} />
                    <span className="ml-auto"><StandingBadge good={a.standing.good_standing} reasons={a.standing.reasons} /></span>
                  </div>
                  <div className="mt-2 text-[15px] font-medium">{a.name || shortAddress(a.wallet)}</div>
                  <div className="mono text-xs text-ink-3">{shortAddress(a.wallet, 6)} · bond {formatGen(a.bond, 3)} GEN · v{a.versions}</div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                    <span><b className={t.breaches_total ? "text-violation-ink" : ""}>{t.breaches_total}</b> breach{t.breaches_total === 1 ? "" : "es"} ({t.breaches.MINOR}/{t.breaches.MAJOR}/{t.breaches.CRITICAL})</span>
                    <span><b className={t.compliant ? "text-compliant-ink" : ""}>{t.compliant}</b> cleared</span>
                    <span>{t.inconclusive} inconclusive</span>
                    <span>{a.open_count} open</span>
                    <span>examined {relativeTime(a.last_checked)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
