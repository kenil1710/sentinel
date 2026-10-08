"use client";

/**
 * Open challenge: anyone but the operator may accuse an agent of breaching one
 * clause in one transaction, staking the challenge stake.
 *
 * The form looks the transaction up on its chain first (block time, sender),
 * because the block time is part of the filing: it selects the mandate version
 * the challenge will be judged against, and a wrong time voids the filing (the
 * stake goes to the operator). It then shows exactly what will be snapshotted
 * and what the challenger risks and stands to win.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Label, Panel, SeverityTag } from "./ui";
import { TxStatus, useTx } from "./tx";
import { useWallet } from "./WalletProvider";
import { challengeAgent, getConfig, getVersionAt, isTxChallenged, previewChallenge } from "@/lib/contract";
import { absoluteTime, blockscoutUrl, formatGen, isTxHash, shortAddress } from "@/lib/format";
import type { Agent } from "@/types";

interface TxInfo { found: boolean; mined?: boolean; timestamp?: number; block?: number; from?: string; to?: string; error?: string }

export function ChallengeForm({ agent, onFiled, initialTx = "" }: { agent: Agent; onFiled?: (id: number) => void; initialTx?: string }) {
  const { account, connect } = useWallet();
  const { data: cfg } = useSWR("config", getConfig);
  const [hash, setHash] = useState(initialTx);
  const [picked, setClause] = useState("");
  const [reason, setReason] = useState("");
  const [filedId, setFiledId] = useState<number | null>(null);
  const tx = useTx();
  const h = hash.trim().toLowerCase();
  const valid = isTxHash(h);

  const { data: info } = useSWR<TxInfo>(valid ? ["txinfo", agent.chain, h] : null,
    () => fetch(`/api/txinfo?chain=${agent.chain}&hash=${h}`).then((r) => r.json()).catch(() => ({ found: false, error: "lookup failed" })));

  const ts = info?.mined ? info.timestamp ?? 0 : 0;
  const { data: version } = useSWR(ts ? ["version-at", agent.agent_id, ts] : null, () => getVersionAt(agent.agent_id, ts));
  const { data: dup } = useSWR(valid ? ["dup", agent.chain, h, agent.agent_id] : null, () => isTxChallenged(agent.chain, h, agent.agent_id));
  const clauses = useMemo(() => version?.version?.clauses ?? [], [version]);
  const clause = clauses.find((c) => c.id === picked) ? picked : clauses[0]?.id ?? "";
  const { data: preview } = useSWR(ts && clause ? ["preview", agent.agent_id, ts, clause] : null, () => previewChallenge(agent.agent_id, ts, clause));

  const isOperator = account && account.toLowerCase() === agent.operator.toLowerCase();
  const involves = info?.from && [info.from, info.to].includes(agent.wallet.toLowerCase());
  const problems: string[] = [];
  if (agent.status === "RETIRED") problems.push("This agent is retired and can no longer be challenged.");
  if (BigInt(agent.bond) <= 0n) problems.push("This agent's bond is exhausted.");
  if (isOperator) problems.push("An operator cannot challenge their own agent.");
  if (hash && !valid) problems.push("A transaction hash is 0x followed by 64 hex characters.");
  if (valid && info && !info.found) problems.push(`No such transaction on ${agent.chain}.`);
  if (info?.found && !info.mined) problems.push("That transaction is not in a block yet.");
  if (ts && version && !version.found) problems.push("No mandate was in force when that transaction was mined: the agent registered later. Mandates never reach back.");
  if (dup?.challenged) problems.push(`Already challenged against this agent (challenge #${dup.challenge_id}).`);
  if (reason && (reason.trim().length < 10 || reason.trim().length > 300)) problems.push("The reason must be 10–300 characters.");
  const ready = valid && ts > 0 && version?.found && clause && reason.trim().length >= 10 && problems.length === 0 && cfg;

  const submit = async () => {
    if (!account || !cfg || !ready) return;
    await tx.run(async (onProgress) => {
      const r = await challengeAgent(account, agent.agent_id, h, ts, clause, reason.trim(), BigInt(cfg.challenge_stake), {
        onProgress,
        confirm: async () => {
          const d = await isTxChallenged(agent.chain, h, agent.agent_id);
          if (d.challenged && d.challenge_id !== undefined) setFiledId(d.challenge_id);
          return d.challenged;
        },
      });
      if (r.kind === "ok") {
        const d = await isTxChallenged(agent.chain, h, agent.agent_id);
        if (d.challenge_id !== undefined) onFiled?.(d.challenge_id);
      }
      return r;
    });
  };

  return (
    <Panel className="p-5">
      <Label>Open a challenge</Label>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
        Anyone except the operator may challenge. Name one transaction of {shortAddress(agent.wallet)} on {agent.chain} and the
        clause you say it broke. Stake: <b className="mono">{cfg ? formatGen(cfg.challenge_stake) : "…"} GEN</b>.
      </p>

      <label htmlFor="ch-hash" className="mt-4 block text-xs font-medium text-ink-2">Transaction hash</label>
      <input id="ch-hash" value={hash} onChange={(e) => setHash(e.target.value)} spellCheck={false} placeholder="0x…"
        className="mono mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
      {info?.mined && (
        <div className="mt-2 rounded-md bg-panel-2 px-3 py-2 text-xs text-ink-2">
          Block {info.block} · mined {absoluteTime(info.timestamp)} (unix <span className="mono">{info.timestamp}</span>) ·
          from <span className="mono">{shortAddress(info.from)}</span> to <span className="mono">{shortAddress(info.to)}</span>
          {!involves && <span className="block text-neutral-ink">The agent is not the sender or recipient; it must appear in a token transfer, or validators will dismiss the challenge (stake refunded).</span>}
          <a className="ml-1 text-signal hover:underline" href={blockscoutUrl(agent.chain, "tx", h)} target="_blank" rel="noreferrer">explorer ↗</a>
        </div>
      )}

      {version?.found && version.version && (
        <div className="mt-4">
          <div className="text-xs font-medium text-ink-2">
            Clause alleged — judged against version {version.version.version} of the mandate, the one in force at that block time
          </div>
          <div className="mt-1.5 space-y-1.5" role="radiogroup" aria-label="Clause alleged">
            {clauses.map((c) => {
              const flagged = version.version!.lint_flags.find((f) => f.clause === c.id);
              return (
                <label key={c.id} className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 text-[13px] ${clause === c.id ? "border-signal bg-signal/5" : "border-line"}`}>
                  <input type="radio" name="clause" value={c.id} checked={clause === c.id} onChange={() => setClause(c.id)} className="mt-0.5" />
                  <span className="mono font-semibold">{c.id}</span><SeverityTag severity={c.severity} />
                  <span className="min-w-0 flex-1">{c.text}{flagged && <span className="block text-xs text-neutral-ink">Linter: not judgeable from on-chain data — a breach here cannot be slashed.</span>}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <label htmlFor="ch-reason" className="mt-4 block text-xs font-medium text-ink-2">What looks wrong (10–300 characters)</label>
      <textarea id="ch-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
        className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />

      {preview?.ok && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md border border-violation/25 bg-violation/5 p-2.5">
            <div className="font-medium text-violation-ink">If BREACH ({preview.clause_severity}, ×{(preview.multiplier_bps / 10000).toFixed(2)})</div>
            <div className="mt-1 text-ink-2">Slash {formatGen(preview.if_breach.slash)} GEN; you get back <b>{formatGen(preview.if_breach.you_receive)} GEN</b> (stake + half the slash).</div>
          </div>
          <div className="rounded-md border border-compliant/25 bg-compliant/5 p-2.5">
            <div className="font-medium text-compliant-ink">If COMPLIANT</div>
            <div className="mt-1 text-ink-2">Your stake ({formatGen(preview.if_compliant.you_lose)} GEN) goes to the operator.</div>
          </div>
          <div className="rounded-md border border-neutral/25 bg-neutral/5 p-2.5">
            <div className="font-medium text-neutral-ink">If INCONCLUSIVE</div>
            <div className="mt-1 text-ink-2">Your stake comes back in full. A wrong block time is VOID: stake to the operator.</div>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-neutral-ink">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {account ? (
          <button onClick={submit} disabled={!ready || tx.busy}
            className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {tx.busy ? "Filing…" : `Stake ${cfg ? formatGen(cfg.challenge_stake) : ""} GEN and file`}
          </button>
        ) : (
          <button onClick={connect} className="rounded-md border border-line-2 bg-panel px-4 py-2 text-sm">Connect a wallet to file</button>
        )}
        {filedId !== null && <Link href={`/challenge/${filedId}`} className="text-sm text-signal hover:underline">Open challenge #{filedId} →</Link>}
      </div>
      <TxStatus progress={tx.progress} success={filedId !== null ? `Filed as challenge #${filedId}, confirmed in contract state.` : undefined} />
    </Panel>
  );
}
