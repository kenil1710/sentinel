"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AgentCard } from "@/components/AgentCard";
import { Empty, Label, Spinner } from "@/components/ui";
import { getActiveAgents, getAgentsByChain, getAgentsByType } from "@/lib/contract";
import { CHAIN_LABEL } from "@/lib/format";

const CHAINS = ["all", "ethereum", "base", "arbitrum", "polygon", "robinhood"] as const;
const TYPES = ["all", "TRADING", "DEFI", "SHOPPING", "CONTENT", "CUSTOM"] as const;
const TYPE_LABEL: Record<string, string> = {
  all: "All types", TRADING: "Trading", DEFI: "DeFi",
  SHOPPING: "Shopping", CONTENT: "Content", CUSTOM: "Custom",
};
type Sort = "recent" | "bond" | "risk" | "stale";

export default function AgentsPage() {
  const [chain, setChain] = useState<(typeof CHAINS)[number]>("all");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [sort, setSort] = useState<Sort>("recent");

  /*
   * The chain filter is served by the contract; the type filter is applied to
   * whatever that returns. Asking the contract for both would need a view per
   * combination, and the register is small enough that one narrowing happens
   * here for free.
   */
  const { data, error, isLoading } = useSWR(
    ["agents", chain, type],
    () => {
      if (chain !== "all") return getAgentsByChain(chain, 60);
      if (type !== "all") return getAgentsByType(type, 60);
      return getActiveAgents(60);
    },
    { refreshInterval: 25_000 },
  );

  const agents = useMemo(() => {
    let rows = [...(data?.agents ?? [])];
    if (type !== "all") rows = rows.filter((a) => a.agent_type === type);
    if (sort === "bond") rows.sort((a, b) => (BigInt(b.bond) > BigInt(a.bond) ? 1 : -1));
    if (sort === "risk") rows.sort((a, b) => a.compliance_bps - b.compliance_bps || b.violation_count - a.violation_count);
    if (sort === "stale") rows.sort((a, b) => a.last_checked - b.last_checked);
    return rows;
  }, [data, sort, type]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>The register</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agents under watch</h1>
      <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Every registered agent, its published mandate, and the bond that answers for it.
        Anyone may challenge any transaction — including you.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {CHAINS.map((c) => (
          <button key={c} onClick={() => setChain(c)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              chain === c ? "bg-signal text-ground font-medium" : "border border-line bg-panel text-ink-2 hover:text-ink"}`}>
            {c === "all" ? "All chains" : CHAIN_LABEL[c]}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
          className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-ink-2">
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
          className="ml-auto rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-ink-2">
          <option value="recent">Newest first</option>
          <option value="bond">Largest bond</option>
          <option value="risk">Lowest compliance</option>
          <option value="stale">Least recently checked</option>
        </select>
      </div>

      <div className="mt-6">
        {isLoading && <Spinner label="Reading the register…" />}
        {error && (
          <div className="rounded-lg border border-violation/30 bg-violation/10 p-4 text-sm text-violation">
            Could not read the register: {String(error.message ?? error)}
          </div>
        )}
        {!isLoading && !error && agents.length === 0 && (
          <Empty title="No agents registered on this chain yet"
            hint="Register one and it appears here immediately." />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => <AgentCard key={a.agent_id} agent={a} />)}
        </div>
      </div>
    </div>
  );
}
