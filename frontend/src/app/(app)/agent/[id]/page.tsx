"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChainTag, Empty, Label, Panel, SeverityTag, Spinner, StandingBadge, StatusTag, TypeTag, VerdictBadge } from "@/components/ui";
import { ChallengeForm } from "@/components/ChallengeForm";
import { OperatorPanel } from "@/components/OperatorPanel";
import { MandateVersions } from "@/components/MandateVersions";
import { TrackRecord } from "@/components/TrackRecord";
import { TxStatus, useTx } from "@/components/tx";
import { useWallet } from "@/components/WalletProvider";
import { getAgent, getAgentChallenges, getMandateVersions, getPrecedents, getTrackRecord, lintMandate } from "@/lib/contract";
import { absoluteTime, blockscoutUrl, formatGen, relativeTime, shortAddress } from "@/lib/format";
import { explorerUrl, getDeployment } from "@/lib/genlayer";

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agentId = Number(id);
  const { account } = useWallet();
  const { data: agent, error, mutate } = useSWR(["agent", agentId], () => getAgent(agentId), { refreshInterval: 20_000 });
  const { data: versions, mutate: mutateV } = useSWR(["versions", agentId], () => getMandateVersions(agentId), { refreshInterval: 30_000 });
  const { data: track } = useSWR(["track", agentId], () => getTrackRecord(agentId), { refreshInterval: 30_000 });
  const { data: history } = useSWR(["agent-challenges", agentId], () => getAgentChallenges(agentId, 100), { refreshInterval: 20_000 });
  const { data: precedents } = useSWR(["precedents", agentId], () => getPrecedents(agentId), { refreshInterval: 60_000 });
  const lint = useTx();
  const [linted, setLinted] = useState("");

  if (error) return <div className="mx-auto max-w-4xl px-5 py-16"><Empty title={`No agent with id ${id}`} hint="It may never have been registered." /></div>;
  if (!agent) return <div className="mx-auto max-w-4xl px-5 py-16"><Spinner /></div>;
  const isOperator = Boolean(account && account.toLowerCase() === agent.operator.toLowerCase());
  const origin = typeof window !== "undefined" ? window.location.origin : "https://sentinel-tau-ashen.vercel.app";
  const badge = `${origin}/badge/${agent.wallet}.svg?chain=${agent.chain}`;
  const canonical = getDeployment() === "canonical";

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Link href="/agents" className="text-sm text-ink-3 hover:text-ink">← The register</Link>
      <div className="mt-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypeTag type={agent.agent_type} /><ChainTag chain={agent.chain} /><StatusTag status={agent.status} />
            <StandingBadge good={agent.standing.good_standing} reasons={agent.standing.reasons} />
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{agent.name || `Agent #${agent.agent_id}`} <span className="mono text-base text-ink-3">#{agent.agent_id}</span></h1>
          {agent.description && <p className="mt-1.5 max-w-3xl text-[14px] text-ink-2">{agent.description}</p>}
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <div><dt className="inline text-ink-3">Wallet </dt><dd className="mono inline break-all"><a className="text-signal hover:underline" href={blockscoutUrl(agent.chain, "address", agent.wallet)} target="_blank" rel="noreferrer">{agent.wallet}</a></dd></div>
            <div><dt className="inline text-ink-3">Bonded by </dt><dd className="mono inline break-all"><a className="hover:underline" href={explorerUrl("address", agent.operator)} target="_blank" rel="noreferrer">{agent.operator}</a></dd></div>
            <div><dt className="inline text-ink-3">Registered </dt><dd className="inline">{absoluteTime(agent.registered_at)}</dd></div>
            <div><dt className="inline text-ink-3">Last examined </dt><dd className="inline">{relativeTime(agent.last_checked)}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-line-2 bg-panel px-5 py-4 text-right shadow-[var(--shadow-card)]">
          <Label>Bond</Label>
          <div className="mono mt-1 text-3xl font-semibold">{formatGen(agent.bond, 4)}<span className="ml-1 text-base text-ink-3">GEN</span></div>
          <div className="mt-1 text-xs text-ink-2">{agent.open_count} open · {agent.challenge_count} filed in all</div>
        </div>
      </div>
      {(agent.previous_registrations ?? []).length > 0 && (
        <p className="mt-4 rounded-lg border border-line bg-panel-2 px-4 py-2.5 text-[13px] text-ink-2">
          This wallet was registered before on {agent.chain}:{" "}
          {agent.previous_registrations.map((p, i) => (
            <span key={p.agent_id}>{i > 0 && ", "}<Link className="text-signal hover:underline" href={`/agent/${p.agent_id}`}>#{p.agent_id}</Link> ({p.status.toLowerCase()}, {p.breaches} final breach{p.breaches === 1 ? "" : "es"})</span>
          ))}. Earlier breaches count toward the repeat multiplier, and an earlier CRITICAL breach keeps it out of good standing.
        </p>
      )}
      {!agent.standing.good_standing && agent.standing.reasons.length > 0 && (
        <p className="mt-4 rounded-lg border border-neutral/30 bg-neutral/5 px-4 py-2.5 text-[13px] text-neutral-ink">Not in good standing: {agent.standing.reasons.join("; ")}.</p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0 space-y-6">
          {track && <TrackRecord t={track} />}

          <section aria-labelledby="versions-h">
            <h2 id="versions-h" className="text-lg font-semibold tracking-tight">Mandate versions</h2>
            <p className="mt-1 text-[13px] text-ink-2">Edits take effect after a delay and never reach back: a challenge is judged against the version in force when its transaction was mined.</p>
            <div className="mt-3">
              {versions ? (
                <MandateVersions versions={versions.versions} lintAction={(v) => v.lint_status === "PENDING" && account ? (
                  <button disabled={lint.busy} onClick={() => lint.run(async (onProgress) => {
                    const r = await lintMandate(account, agent.agent_id, v.version, { onProgress,
                      confirm: async () => (await getMandateVersions(agent.agent_id)).versions.find((x) => x.version === v.version)?.lint_status !== "PENDING" });
                    if (r.kind === "ok") { setLinted(`Version ${v.version} linted.`); mutateV(); }
                  })} className="rounded-md border border-signal/40 px-2 py-1 text-xs text-signal disabled:opacity-50">Run the linter</button>
                ) : null} />
              ) : <Spinner />}
              <TxStatus progress={lint.progress} success={linted || undefined} />
            </div>
          </section>

          <section aria-labelledby="ch-h">
            <h2 id="ch-h" className="text-lg font-semibold tracking-tight">Challenges</h2>
            <div className="mt-3 space-y-2">
              {!history ? <Spinner /> : history.challenges.length === 0 ? <Empty title="No challenges yet" hint="Anyone may file one below." /> :
                history.challenges.map((c) => (
                  <Link key={c.challenge_id} href={`/challenge/${c.challenge_id}`}
                    className="block rounded-lg border border-line bg-panel px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:border-signal/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-sm font-semibold">#{c.challenge_id}</span>
                      {c.status === "FINAL" ? <VerdictBadge verdict={c.final.verdict} size="sm" /> : c.status === "PENDING" ? <VerdictBadge verdict="PENDING" size="sm" />
                        : c.status === "APPEALED" ? <VerdictBadge verdict="APPEALED" size="sm" /> : <VerdictBadge verdict={c.ruling.verdict} size="sm" provisional />}
                      <span className="mono text-xs text-ink-2">{c.alleged_clause}</span>
                      <SeverityTag severity={c.final.severity || c.ruling.severity} />
                      {c.appeal.outcome && <span className="text-[11px] text-ink-2">appeal {c.appeal.outcome.toLowerCase()}</span>}
                      <span className="mono ml-auto text-xs text-ink-3">{shortAddress(c.tx_hash, 6)}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-ink-2">{c.reason}</p>
                  </Link>
                ))}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {isOperator && <OperatorPanel agent={agent} account={account!} onChange={() => { mutate(); mutateV(); }} />}
          <ChallengeForm agent={agent} />
          <Panel className="p-5">
            <Label>Precedents for this agent</Label>
            {!precedents ? <Spinner /> : precedents.precedents.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-2">None. A precedent is created only by a FINAL COMPLIANT ruling that was COMPLIANT from the start.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-[12.5px]">{precedents.precedents.map((p) => (
                <li key={p.key} className="rounded-md bg-panel-2 px-2.5 py-2">
                  <span className={p.active ? "text-compliant-ink" : "text-ink-3 line-through"}>{p.clause_id}</span>{" "}
                  <span className="mono break-all text-ink-2">{p.tx_kind}</span>
                  <span className="block text-ink-3">from <Link className="text-signal hover:underline" href={`/challenge/${p.challenge_id}`}>#{p.challenge_id}</Link>{!p.active && ` · vetoed by breach #${p.vetoed_by}`}</span>
                </li>))}</ul>
            )}
          </Panel>
          {canonical && (
            <Panel className="p-5">
              <Label>Badge and API</Label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={badge} alt={`Sentinel standing badge for agent ${agent.agent_id}`} className="mt-3 h-5" />
              <pre className="mono mt-3 overflow-x-auto rounded-md bg-panel-2 p-2.5 text-[11px]">{`![Sentinel](${badge})`}</pre>
              <a className="mt-2 block break-all text-xs text-signal hover:underline" href={`/api/check?agent=${agent.wallet}&chain=${agent.chain}`}>/api/check?agent={shortAddress(agent.wallet)}&amp;chain={agent.chain}</a>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
