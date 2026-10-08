"use client";

import Link from "next/link";
import useSWR from "swr";
import { Empty, Label, Panel, Spinner } from "@/components/ui";
import { getPrecedents } from "@/lib/contract";
import { absoluteTime } from "@/lib/format";
import { getDeployment } from "@/lib/genlayer";

export default function PrecedentsPage() {
  const { data, error } = useSWR(["precedents-all", getDeployment()], () => getPrecedents(-1), { refreshInterval: 60_000 });
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Label>Precedents</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">What the patrol has been told to stop accusing</h1>
      <Panel className="mt-5 p-5 text-[13.5px] leading-relaxed text-ink-2">
        A precedent is created only when a challenge ends FINAL COMPLIANT and its first ruling was already COMPLIANT — unappealed, or upheld against
        the challenger&apos;s appeal. It names one agent, one clause (by the hash of its text, so editing the clause ends it) and one kind of transaction
        (counterparty, function selector, tokens moved, a coarse native-value bucket). The patrol bot skips a matching transaction instead of staking on it again.
        A provisional ruling never creates one, a COMPLIANT the operator won on appeal never creates one, and one reached on input carrying an injection marker
        never creates one. A single FINAL BREACH of the same kind and clause ends it for good. Precedents only steer the bot: anyone can still challenge.
      </Panel>
      <div className="mt-5 space-y-2">
        {error ? <Empty title="The chain did not answer" /> : !data ? <Spinner /> : data.precedents.length === 0 ? <Empty title="No precedents yet" /> :
          data.precedents.map((p) => (
            <Panel key={p.key} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${p.active ? "bg-compliant/10 text-compliant-ink" : "bg-panel-2 text-ink-3"}`}>{p.active ? "Active" : `Vetoed by breach #${p.vetoed_by}`}</span>
                <Link href={`/agent/${p.agent_id}`} className="text-signal hover:underline">Agent #{p.agent_id}</Link>
                <span className="mono">{p.clause_id}</span>
                <span className="text-xs text-ink-3">from <Link className="text-signal hover:underline" href={`/challenge/${p.challenge_id}`}>challenge #{p.challenge_id}</Link> · {absoluteTime(p.created_at)}</span>
              </div>
              <div className="mono mt-2 break-all text-xs text-ink-2">kind {p.tx_kind}</div>
              <div className="mono mt-1 break-all text-[11px] text-ink-3">key {p.key} · clause sha256 {p.clause_hash}</div>
            </Panel>
          ))}
      </div>
    </div>
  );
}
