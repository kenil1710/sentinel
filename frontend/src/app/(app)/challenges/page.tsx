"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChainTag, Empty, Label, SeverityTag, Spinner, VerdictBadge } from "@/components/ui";
import { Countdown } from "@/components/time";
import { getChallenges } from "@/lib/contract";
import { absoluteTime, shortAddress } from "@/lib/format";
import { getDeployment } from "@/lib/genlayer";

const FILTERS = ["all", "open", "final"] as const;

export default function ChallengesPage() {
  const { data, error } = useSWR(["challenges", getDeployment()], () => getChallenges(0, 100), { refreshInterval: 20_000 });
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");
  const rows = (data?.challenges ?? []).filter((c) => f === "all" || (f === "final" ? c.status === "FINAL" : c.status !== "FINAL"));
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>Challenges</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Every accusation, and where it stands</h1>
      <div className="mt-6 flex gap-2" role="group" aria-label="Filter challenges">
        {FILTERS.map((x) => (
          <button key={x} onClick={() => setF(x)} aria-pressed={f === x}
            className={`rounded-md px-3 py-1.5 text-sm ${f === x ? "bg-ink text-white" : "border border-line bg-panel text-ink-2 hover:text-ink"}`}>
            {x === "all" ? "All" : x === "open" ? "Open" : "Final"}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-2">
        {error ? <Empty title="The chain did not answer" /> : !data ? <Spinner /> : rows.length === 0 ? <Empty title="Nothing here yet" /> : rows.map((c) => (
          <Link key={c.challenge_id} href={`/challenge/${c.challenge_id}`}
            className="block rounded-lg border border-line bg-panel px-4 py-3 shadow-[var(--shadow-card)] hover:border-signal/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-sm font-semibold">#{c.challenge_id}</span>
              <ChainTag chain={c.chain} />
              {c.status === "FINAL" ? <VerdictBadge verdict={c.final.verdict} size="sm" /> : c.status === "PENDING" ? <VerdictBadge verdict="PENDING" size="sm" />
                : c.status === "APPEALED" ? <VerdictBadge verdict="APPEALED" size="sm" /> : <VerdictBadge verdict={c.ruling.verdict} size="sm" provisional />}
              <span className="mono text-xs text-ink-2">agent #{c.agent_id} · {c.alleged_clause}</span>
              <SeverityTag severity={c.final.severity || c.ruling.severity} />
              <span className="ml-auto text-xs text-ink-3">
                {c.status === "CONTESTABLE" ? <Countdown at={c.ruling.contest_deadline} open="appealable for" closed="appeal window closed" />
                  : c.status === "FINAL" ? `final ${absoluteTime(c.final.finalized_at)}` : `filed ${absoluteTime(c.filed_at)}`}
              </span>
            </div>
            <p className="mt-1 truncate text-[13px] text-ink-2">{shortAddress(c.challenger)}: {c.reason}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
