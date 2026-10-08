"use client";

import useSWR from "swr";
import { Label, Panel, Spinner, Stat } from "@/components/ui";
import { getLedger, getStats } from "@/lib/contract";
import { formatGen } from "@/lib/format";
import { getDeployment } from "@/lib/genlayer";

function Bar({ label, n, total, tone }: { label: string; n: number; total: number; tone: string }) {
  const w = total ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-ink-2">{label}</span><span className="mono">{n}</span></div>
      <div className="mt-1 h-2 rounded bg-panel-2" aria-hidden="true"><div className={`h-2 rounded ${tone}`} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: s } = useSWR(["stats", getDeployment()], getStats, { refreshInterval: 30_000 });
  const { data: l } = useSWR(["ledger", getDeployment()], getLedger, { refreshInterval: 30_000 });
  if (!s) return <div className="mx-auto max-w-6xl px-5 py-12"><Spinner /></div>;
  const finals = s.final.BREACH + s.final.COMPLIANT + s.final.INCONCLUSIVE + s.final.VOID;
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>Analytics</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">The register in numbers, read from the contract</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agents registered" value={s.agents_registered} sub={`${s.agents_by_status.ACTIVE ?? 0} active · ${s.agents_by_status.PAUSED ?? 0} paused · ${s.agents_by_status.RETIRED ?? 0} retired`} icon="agents" />
        <Stat label="Challenges filed" value={s.challenges_filed} sub={`${s.challenges_open} still open`} icon="challenges" />
        <Stat label="Slashed" value={`${formatGen(s.total_slashed, 3)}`} sub="GEN, from final breaches" tone="violation" icon="breaches" />
        <Stat label="Bounties" value={`${formatGen(s.total_bounties, 3)}`} sub="GEN, credited to challengers" icon="bounties" />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Panel className="p-5">
          <Label>Final rulings</Label>
          <div className="mt-4 space-y-3">
            <Bar label="Breach" n={s.final.BREACH} total={finals} tone="bg-violation" />
            <Bar label="Compliant" n={s.final.COMPLIANT} total={finals} tone="bg-compliant" />
            <Bar label="Inconclusive" n={s.final.INCONCLUSIVE} total={finals} tone="bg-neutral" />
            <Bar label="Void filing" n={s.final.VOID} total={finals} tone="bg-ink-3" />
          </div>
          <p className="mt-3 text-xs text-ink-2">{s.stalled} settled as stalled (no panel agreed before the deadline).</p>
        </Panel>
        <Panel className="p-5">
          <Label>Appeals and precedents</Label>
          <dl className="mt-4 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-ink-2">Appeals filed</dt><dd className="mono">{s.appeals.filed}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Upheld (ruling overturned)</dt><dd className="mono">{s.appeals.upheld}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Rejected</dt><dd className="mono">{s.appeals.rejected}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Expired</dt><dd className="mono">{s.appeals.expired}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Precedents (active)</dt><dd className="mono">{s.precedents} ({s.precedents_active})</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Patrol runs stamped</dt><dd className="mono">{s.patrols_run}</dd></div>
          </dl>
        </Panel>
      </div>
      {l && (
        <Panel className="mt-6 p-5">
          <Label>Ledger</Label>
          <p className="mt-2 text-[13px] text-ink-2">
            Received {formatGen(l.received)} GEN = bonds {formatGen(l.bonds)} + open stakes {formatGen(l.open_stakes)} + claimable {formatGen(l.claimable)} + claimed {formatGen(l.claimed)}.{" "}
            <span className={l.invariant_holds && l.views_match_storage ? "text-compliant-ink" : "text-violation-ink"}>
              {l.invariant_holds && l.views_match_storage ? "Holds, and every total matches its recomputation from the records." : "Does not hold."}
            </span>
          </p>
        </Panel>
      )}
    </div>
  );
}
