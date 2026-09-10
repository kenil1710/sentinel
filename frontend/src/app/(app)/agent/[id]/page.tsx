"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Panel, Label, ChainTag, StatusTag, TypeTag, ScoreRing, VerdictBadge, Empty, Spinner } from "@/components/ui";
import { ChallengeForm } from "@/components/ChallengeForm";
import { AgentTransactions } from "@/components/AgentTransactions";
import { useWallet } from "@/components/WalletProvider";
import { getAgent, getAgentHistory, getConfig, topUpBond, withdrawBond } from "@/lib/contract";
import { absoluteTime, blockscoutUrl, formatGen, relativeTime, shortAddress } from "@/lib/format";
import type { WriteResult } from "@/types";

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agentId = Number(id);
  const { account } = useWallet();

  const { data: agent, error, mutate } = useSWR(["agent", agentId], () => getAgent(agentId), {
    refreshInterval: 20_000,
  });
  const { data: history, mutate: mutateHistory } = useSWR(["history", agentId], () => getAgentHistory(agentId, 50), {
    refreshInterval: 20_000,
  });
  const { data: cfg } = useSWR("config", getConfig);

  const [challengeTx, setChallengeTx] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [op, setOp] = useState<WriteResult | null>(null);

  const isOperator = Boolean(account && agent && account.toLowerCase() === agent.operator.toLowerCase());

  async function doWithdraw() {
    if (!account) return;
    setBusy("withdraw"); setOp(null);
    try { setOp(await withdrawBond(account, agentId)); await mutate(); }
    finally { setBusy(null); }
  }
  async function doTopUp() {
    if (!account) return;
    setBusy("topup"); setOp(null);
    try { setOp(await topUpBond(account, agentId, 10n ** 18n)); await mutate(); }
    finally { setBusy(null); }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-16">
        <Empty title={`No agent with id ${id}`} hint="It may never have been registered." />
        <div className="mt-6 text-center">
          <Link href="/agents" className="text-sm text-signal hover:underline">← Back to the register</Link>
        </div>
      </div>
    );
  }
  if (!agent) return <div className="mx-auto max-w-4xl px-5 py-16"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Link href="/agents" className="text-sm text-ink-3 hover:text-ink">← The register</Link>

      <div className="mt-5 flex flex-wrap items-start gap-5">
        <ScoreRing bps={agent.compliance_bps} decided={agent.decided_count} size={76} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypeTag type={agent.agent_type} />
            <ChainTag chain={agent.chain} />
            <StatusTag status={agent.status} />
            {agent.pending_count > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-signal/10 px-2 py-0.5 text-[11px] font-medium text-signal ring-1 ring-signal/25">
                <span className="size-1.5 rounded-full bg-signal live-dot" />
                {agent.pending_count} under judgement
              </span>
            )}
          </div>
          {agent.name ? (
            <>
              <h1 className="mt-2.5 text-xl font-semibold tracking-tight sm:text-2xl">{agent.name}</h1>
              <div className="mono mt-1 break-all text-[13px] text-ink-2">{agent.wallet}</div>
            </>
          ) : (
            <h1 className="mono mt-2.5 break-all text-xl font-semibold tracking-tight sm:text-2xl">
              {agent.wallet}
            </h1>
          )}
          {agent.description && (
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-2">{agent.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
            <span>Agent #{agent.agent_id}</span>
            <span>operator {shortAddress(agent.operator, 5)}</span>
            <span>registered {relativeTime(agent.registered_at)}</span>
            <a href={blockscoutUrl(agent.chain, "address", agent.wallet)} target="_blank" rel="noreferrer"
              className="text-signal hover:underline">on {agent.explorer} ↗</a>
            {/*
              * The scheme is validated on chain (_url_problem refuses anything
              * but http/https), so this cannot be a javascript: href. rel is
              * still set: an operator link is attacker-supplied by definition.
              */}
            {agent.operator_url && (
              <a href={agent.operator_url} target="_blank" rel="noreferrer nofollow ugc"
                className="text-signal hover:underline">operator ↗</a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel className="p-6">
            <Label>The mandate</Label>
            <p className="mt-3 text-[15px] leading-relaxed text-ink">{agent.mandate}</p>
            <div className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">
              Published {absoluteTime(agent.mandate_updated_at)}. This exact text is what
              validators read when someone challenges a transaction — it cannot be edited
              while a challenge is pending.
            </div>
          </Panel>

          <AgentTransactions agent={agent} onPick={(tx: string) => {
            setChallengeTx(tx);
            document.getElementById("challenge-form")?.scrollIntoView({ behavior: "smooth" });
          }} />

          <div>
            <Label>Challenge history</Label>
            <div className="mt-3 space-y-3">
              {!history && <Spinner />}
              {history && history.challenges.length === 0 && (
                <Empty title="No challenge has been filed against this agent"
                  hint="Its compliance score stays at 100% until one is decided — unproven is not guilty." />
              )}
              {history?.challenges.map((c) => (
                <Link key={c.challenge_id} href={`/challenge/${c.challenge_id}`}
                  className="block rounded-lg border border-line bg-panel shadow-[var(--shadow-card)] p-4 transition-colors hover:border-signal/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={c.status === "PENDING" ? "PENDING" : c.verdict} size="sm" />
                    <span className="mono text-[11px] text-ink-3">{shortAddress(c.tx_hash, 8)}</span>
                    <span className="ml-auto text-[11px] text-ink-3">{relativeTime(c.filed_at)}</span>
                  </div>
                  <p className="mt-2.5 line-clamp-2 text-[13px] text-ink-2">{c.reason}</p>
                  {c.verdict === "VIOLATION" && (
                    <div className="mono mt-2 text-[11px] text-violation-ink">
                      −{formatGen(c.settlement.penalty, 4)} GEN slashed
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Panel className="p-5">
            <Label>Bond</Label>
            <div className="mono mt-2 text-3xl font-semibold text-ink">
              {formatGen(agent.bond, 4)} <span className="text-base text-ink-3">GEN</span>
            </div>
            <div className="mt-4 space-y-2 text-[12px]">
              <Row k="Challenges" v={String(agent.challenge_count)} />
              <Row k="Breaches proven" v={String(agent.violation_count)} tone={agent.violation_count ? "violation" : undefined} />
              <Row k="Cleared" v={String(agent.compliant_count)} tone={agent.compliant_count ? "compliant" : undefined} />
              <Row k="Inconclusive" v={String(agent.inconclusive_count)} />
              {BigInt(agent.total_slashed) > 0n && (
                <Row k="Total slashed" v={`${formatGen(agent.total_slashed, 4)} GEN`} tone="violation" />
              )}
              <Row k="Last checked" v={relativeTime(agent.last_checked)} />
            </div>

            {isOperator && (
              <div className="mt-5 space-y-2 border-t border-line pt-4">
                <div className="text-[11px] text-ink-3">You registered this agent.</div>
                <button onClick={doTopUp} disabled={busy !== null}
                  className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink hover:border-line-2 disabled:opacity-50">
                  {busy === "topup" ? "Adding…" : "Top up bond by 1 GEN"}
                </button>
                <button onClick={doWithdraw} disabled={busy !== null || agent.pending_count > 0}
                  title={agent.pending_count > 0 ? "A challenge is pending — the bond answers for it" : undefined}
                  className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink-2 hover:text-ink disabled:opacity-40">
                  {busy === "withdraw" ? "Withdrawing…" : "Withdraw bond and retire"}
                </button>
                {op?.kind === "rejected" && (
                  <div className="rounded-md border border-neutral/25 bg-neutral/10 p-2.5 text-[12px] text-neutral-ink">{op.reason}</div>
                )}
                {op?.kind === "failed" && (
                  <div className="rounded-md border border-violation/25 bg-violation/10 p-2.5 text-[12px] text-violation-ink">{op.error}</div>
                )}
                {op?.kind === "ok" && (
                  <div className="rounded-md border border-compliant/25 bg-compliant/10 p-2.5 text-[12px] text-compliant-ink">Done.</div>
                )}
              </div>
            )}
          </Panel>

          <div id="challenge-form">
            <ChallengeForm agent={agent} config={cfg} tx={challengeTx} setTx={setChallengeTx}
              onFiled={() => { mutate(); mutateHistory(); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "violation" | "compliant" }) {
  const colour = tone === "violation" ? "text-violation-ink" : tone === "compliant" ? "text-compliant-ink" : "text-ink-2";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-3">{k}</span>
      <span className={`mono ${colour}`}>{v}</span>
    </div>
  );
}
