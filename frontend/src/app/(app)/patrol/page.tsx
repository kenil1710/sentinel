"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChainTag, Empty, Label, Panel, Spinner, Stat } from "@/components/ui";
import { getStats } from "@/lib/contract";
import { shortAddress } from "@/lib/format";
import type { PatrolReport } from "@/types";

export default function PatrolPage() {
  const { data: stats } = useSWR("stats-canonical", getStats, { refreshInterval: 60_000 });
  const [report, setReport] = useState<PatrolReport | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setRunning(true); setErr("");
    try {
      const r = await fetch("/api/patrol?dry=1", { cache: "no-store" });
      setReport(await r.json());
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>The patrol</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">A bot that accuses, stakes, and learns from final rulings</h1>
      <p className="mt-2 max-w-3xl text-[14px] text-ink-2">
        An external scheduler calls the patrol every few minutes with a secret. Each run moves open challenges along (resolve, finalize, judge appeals),
        reads recent transactions of the least recently examined agents, checks them against the mandate version in force when each was mined, skips any
        transaction a final COMPLIANT precedent covers, and stakes on what is left. It only proposes; validators decide.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Patrol runs stamped on chain" value={stats ? stats.patrols_run : "—"} icon="patrols" />
        <Stat label="Active precedents" value={stats ? stats.precedents_active : "—"} icon="verify" />
        <Stat label="Open challenges" value={stats ? stats.challenges_open : "—"} icon="challenges" />
      </div>
      <Panel className="mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={run} disabled={running} className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {running ? "Patrolling (dry run, up to a few minutes)…" : "Run a dry patrol now"}
          </button>
          <span className="text-xs text-ink-2">A public dry run writes nothing; only the scheduler with the secret files.</span>
        </div>
        <p className="mt-3 text-xs text-ink-2">
          Coverage limit, measured: base, arbitrum, polygon and robinhood Blockscout answer this server with a Cloudflare 403, so the patrol can list
          transactions on Ethereum only. Validators read all five chains (through a real browser where needed), so open challengers cover the others.
        </p>
        {running && <div className="mt-4"><Spinner label="Reading the queue and the explorers…" /></div>}
        {err && <p className="mt-3 text-sm text-violation-ink">{err}</p>}
      </Panel>
      {report && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Agents examined" value={report.patrolled} />
            <Stat label="Transactions read" value={report.transactions_scanned} />
            <Stat label="Withheld by precedent" value={report.skipped_by_precedent} tone="compliant" />
            <Stat label="Seconds" value={report.seconds} />
          </div>
          {report.actions.length > 0 && (
            <Panel className="p-5">
              <Label>Open challenges it would move along</Label>
              <ul className="mt-2 space-y-1 text-[13px]">{report.actions.map((a) => <li key={a.challenge_id + a.action}><Link className="text-signal hover:underline" href={`/challenge/${a.challenge_id}`}>#{a.challenge_id}</Link> {a.action} — {a.result}</li>)}</ul>
            </Panel>
          )}
          {report.rows.length === 0 ? <Empty title="Nothing in the queue" /> : report.rows.map((r) => (
            <Panel key={r.agent_id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/agent/${r.agent_id}`} className="font-medium text-signal hover:underline">Agent #{r.agent_id}</Link>
                <ChainTag chain={r.chain} /><span className="mono text-xs text-ink-3">{shortAddress(r.wallet)}</span>
                <span className="ml-auto text-xs text-ink-2">{r.scanned} read · {r.flagged.length} flagged · {r.skipped_precedent.length} withheld · {r.skipped_already_challenged} already challenged</span>
              </div>
              {r.error && <p className="mt-2 text-xs text-neutral-ink">{r.error}</p>}
              {r.flagged.map((f) => (
                <p key={f.tx_hash} className="mt-2 text-[13px]"><span className="mono text-xs">{shortAddress(f.tx_hash, 6)}</span> <b className="mono">{f.clause}</b> {f.reason} {f.filed ? <span className="text-signal">filed #{f.challenge_id}</span> : <span className="text-ink-3">{f.error ?? "not filed (dry run)"}</span>}</p>
              ))}
              {r.skipped_precedent.map((s) => (
                <p key={s.tx_hash + s.clause} className="mt-2 text-[13px] text-compliant-ink">
                  <span className="mono text-xs">{shortAddress(s.tx_hash, 6)}</span> withheld on <b className="mono">{s.clause}</b>: precedent from{" "}
                  <Link className="underline" href={`/challenge/${s.challenge_id}`}>challenge #{s.challenge_id}</Link> covers this kind (<span className="mono break-all text-xs">{s.tx_kind}</span>)
                </p>
              ))}
            </Panel>
          ))}
          {report.notes.length > 0 && <ul className="text-xs text-ink-2">{report.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
