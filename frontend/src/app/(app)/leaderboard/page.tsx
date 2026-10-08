"use client";

import useSWR from "swr";
import { Empty, Label, Spinner } from "@/components/ui";
import { getWatchers } from "@/lib/contract";
import { formatGen } from "@/lib/format";
import { explorerUrl, getDeployment } from "@/lib/genlayer";

export default function WatchersPage() {
  const { data, error } = useSWR(["watchers", getDeployment()], getWatchers, { refreshInterval: 60_000 });
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Label>Watchers</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Who files challenges, and how they fare</h1>
      <p className="mt-2 text-[14px] text-ink-2">Anyone can challenge. Won = the challenge ended FINAL BREACH (stake back plus half the slash); lost = FINAL COMPLIANT (stake to the operator); the rest were inconclusive or void.</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
        {error ? <Empty title="The chain did not answer" /> : !data ? <div className="p-5"><Spinner /></div> : data.watchers.length === 0 ? <Empty title="No challenges filed yet" /> : (
          <table className="w-full min-w-[560px] text-[13px]">
            <caption className="sr-only">Watchers ranked by bounties earned</caption>
            <thead className="border-b border-line text-left text-xs text-ink-2">
              <tr><th className="px-4 py-2.5 font-medium">Watcher</th><th className="px-3 py-2.5 font-medium">Filed</th><th className="px-3 py-2.5 font-medium">Won</th><th className="px-3 py-2.5 font-medium">Lost</th><th className="px-3 py-2.5 font-medium">Inconclusive / void</th><th className="px-4 py-2.5 text-right font-medium">Bounties earned</th></tr>
            </thead>
            <tbody>
              {data.watchers.map((w) => (
                <tr key={w.watcher} className="border-b border-line last:border-0">
                  <td className="mono px-4 py-2.5"><a className="hover:underline" href={explorerUrl("address", w.watcher)} target="_blank" rel="noreferrer">{w.watcher.slice(0, 10)}…{w.watcher.slice(-6)}</a></td>
                  <td className="mono px-3 py-2.5">{w.filed}</td>
                  <td className="mono px-3 py-2.5 text-violation-ink">{w.won}</td>
                  <td className="mono px-3 py-2.5 text-compliant-ink">{w.lost}</td>
                  <td className="mono px-3 py-2.5">{w.void_or_inconclusive}</td>
                  <td className="mono px-4 py-2.5 text-right">{formatGen(w.earned, 4)} GEN</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
