"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Panel, Label, VerdictBadge, ChainTag, Empty, Spinner } from "@/components/ui";
import { useWallet } from "@/components/WalletProvider";
import { getAgent, getChallenge, resolveChallenge, settleStalled, verifyChallenge } from "@/lib/contract";
import { absoluteTime, blockscoutUrl, durationText, formatGen, relativeTime, shortAddress } from "@/lib/format";
import type { WriteResult } from "@/types";

export default function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cid = Number(id);
  const { account, connect } = useWallet();

  const { data: ch, error, mutate } = useSWR(["challenge", cid], () => getChallenge(cid), { refreshInterval: 15_000 });
  const { data: agent } = useSWR(ch ? ["agent", ch.agent_id] : null, () => getAgent(ch!.agent_id));
  const { data: verify } = useSWR(ch && ch.status !== "PENDING" ? ["verify", cid] : null, () => verifyChallenge(cid));

  const [busy, setBusy] = useState(false);
  const [op, setOp] = useState<WriteResult | null>(null);

  async function judge() {
    if (!account) return;
    setBusy(true); setOp(null);
    try { setOp(await resolveChallenge(account, cid)); await mutate(); }
    finally { setBusy(false); }
  }
  async function forceRefund() {
    if (!account) return;
    setBusy(true); setOp(null);
    try { setOp(await settleStalled(account, cid)); await mutate(); }
    finally { setBusy(false); }
  }

  if (error) {
    return <div className="mx-auto max-w-4xl px-5 py-16"><Empty title={`No challenge with id ${id}`} /></div>;
  }
  if (!ch) return <div className="mx-auto max-w-4xl px-5 py-16"><Spinner /></div>;

  const pending = ch.status === "PENDING";

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Link href={`/agent/${ch.agent_id}`} className="text-sm text-ink-3 hover:text-ink">← Agent #{ch.agent_id}</Link>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={pending ? "PENDING" : ch.verdict} />
        <ChainTag chain={ch.chain} />
        {ch.stalled && (
          <span className="rounded-md bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3 ring-1 ring-line">
            force-refunded after the window
          </span>
        )}
        {ch.injection_flagged && (
          <span className="rounded-md bg-neutral/10 px-2 py-0.5 text-[11px] text-neutral-ink ring-1 ring-neutral/25">
            prompt-injection markers seen in the evidence
          </span>
        )}
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Challenge #{ch.challenge_id}</h1>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
        <span>filed by {shortAddress(ch.challenger, 5)}</span>
        <span>{relativeTime(ch.filed_at)}</span>
        {ch.settled_at > 0 && <span>settled {absoluteTime(ch.settled_at)}</span>}
        {ch.confidence > 0 && <span>confidence {ch.confidence}%</span>}
      </div>

      {/* The side-by-side: what was promised, and what happened. */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel className="min-w-0 p-5">
          <Label>The mandate</Label>
          <p className="mt-3 break-words text-[14px] leading-relaxed text-ink">
            {agent ? agent.mandate : <span className="text-ink-3">Loading…</span>}
          </p>
        </Panel>
        <Panel className="min-w-0 p-5">
          <Label>The transaction</Label>
          <a href={blockscoutUrl(ch.chain, "tx", ch.tx_hash)} target="_blank" rel="noreferrer"
            className="mono mt-3 block break-all text-[12px] text-signal hover:underline">
            {ch.tx_hash}
          </a>
          <div className="mt-3 break-words text-[13px] leading-relaxed text-ink-2">
            <span className="text-ink-3">Alleged: </span>{ch.reason}
          </div>
          <a href={ch.tx_url} target="_blank" rel="noreferrer"
            className="mono mt-3 block min-w-0 truncate text-[11px] text-ink-3 hover:text-signal">
            evidence the validators read: {ch.tx_url} ↗
          </a>
        </Panel>
      </div>

      {/* The verdict */}
      <Panel className="mt-4 p-6">
        <Label>The verdict</Label>
        {pending ? (
          <div className="mt-3">
            <p className="text-[14px] text-ink-2">
              Not yet judged. Anyone may put this to the validators — they each fetch the
              transaction independently and must agree on one verdict.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {account ? (
                <button onClick={judge} disabled={busy}
                  className="rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                  {busy ? "Validators are judging…" : "Put it to the validators"}
                </button>
              ) : (
                <button onClick={connect} className="rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-white">
                  Connect wallet to judge
                </button>
              )}
              {ch.stalled_eligible && account && (
                <button onClick={forceRefund} disabled={busy}
                  className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm text-ink-2 hover:text-ink disabled:opacity-50">
                  Force a refund
                </button>
              )}
            </div>
            {!ch.stalled_eligible && ch.stalled_in > 0 && (
              <div className="mt-3 text-[12px] text-ink-3">
                If no judgement converges, anyone can force a full refund in{" "}
                {durationText(ch.stalled_in)}.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[15px] leading-relaxed text-ink break-words">{ch.reasoning}</p>
            <div className="mono mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line pt-3.5 text-[11px] text-ink-3">
              <span>evidence digest {ch.evidence_digest || "—"}</span>
              {verify && <span className={verify.coherent ? "text-compliant-ink" : "text-violation-ink"}>
                {verify.coherent ? "reasoning coherent with the verdict" : "reasoning contradicts the verdict"}
              </span>}
            </div>
          </div>
        )}

        {op?.kind === "failed" && (
          <div className="mt-3 rounded-lg border border-neutral/30 bg-neutral/10 p-3 text-[13px] text-neutral-ink">
            {op.error}
          </div>
        )}
        {op?.kind === "ok" && (
          <div className="mt-3 rounded-lg border border-compliant/30 bg-compliant/10 p-3 text-[13px] text-compliant-ink">
            Settled.
          </div>
        )}
      </Panel>

      {/* The settlement */}
      {!pending && (
        <Panel className="mt-4 p-6">
          <Label>Settlement</Label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Money label="Stake" value={ch.stake} />
            <Money label="Slashed from the bond" value={ch.settlement.penalty}
              tone={BigInt(ch.settlement.penalty) > 0n ? "violation" : undefined} />
            <Money label="Bounty to the challenger" value={ch.settlement.bounty}
              tone={BigInt(ch.settlement.bounty) > 0n ? "compliant" : undefined} />
            <Money label="Refunded" value={ch.settlement.refunded} />
            <Money label="To the operator" value={ch.settlement.operator_award}
              tone={BigInt(ch.settlement.operator_award) > 0n ? "compliant" : undefined} />
            <Money label="Protocol cut" value={ch.settlement.protocol_cut} />
            <Money label="Bond before" value={ch.settlement.bond_before} />
          </div>

          {verify && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`mono text-[12px] ${verify.all_ok ? "text-compliant-ink" : "text-violation-ink"}`}>
                  {verify.all_ok ? "✓ recomputed from stored evidence — every figure matches" : "✗ recomputation disagrees"}
                </span>
                <span className={`mono text-[12px] ${verify.conservation.balanced ? "text-compliant-ink" : "text-violation-ink"}`}>
                  {verify.conservation.balanced ? "✓ value conserved" : "✗ value not conserved"}
                </span>
              </div>
              {verify.checks.length > 0 && (
                <div className="mono mt-3 space-y-1 text-[11px]">
                  {verify.checks.map((c) => (
                    <div key={c.field} className="flex gap-3">
                      <span className={c.ok ? "text-compliant-ink" : "text-violation-ink"}>{c.ok ? "✓" : "✗"}</span>
                      <span className="text-ink-3">{c.field}</span>
                      <span className="text-ink-2">{formatGen(c.actual, 6)}</span>
                      {!c.ok && <span className="text-violation-ink">expected {formatGen(c.expected, 6)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Money({ label, value, tone }: { label: string; value: string; tone?: "violation" | "compliant" }) {
  const colour = tone === "violation" ? "text-violation-ink" : tone === "compliant" ? "text-compliant-ink" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-3">
      <div className="text-[10px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mono mt-1 text-[15px] font-semibold ${colour}`}>{formatGen(value, 5)}</div>
    </div>
  );
}
