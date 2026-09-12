"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Panel, Label } from "./ui";
import { Icon } from "./icons";
import { useWallet } from "./WalletProvider";
import { challengeAgent, isTxChallenged, previewChallenge } from "@/lib/contract";
import { formatGen, isTxHash, percentFromBps } from "@/lib/format";
import type { Agent, Config, PatrolPreview, WriteResult } from "@/types";

/**
 * `tx` is owned by the PARENT, not by this form.
 *
 * The agent page has a "Challenge" button on every transaction row, so the hash
 * arrives from outside. Mirroring a prop into local state needs an effect that
 * calls setState on every change, which is both a lint error and a real
 * cascading render — so the parent holds the value and this is a controlled
 * input, which is what it always should have been.
 */
export function ChallengeForm({ agent, config, tx, setTx, onFiled }: {
  agent: Agent; config?: Config; tx: string; setTx: (v: string) => void; onFiled?: () => void;
}) {
  const router = useRouter();
  const { account, connect, onWrongNetwork, switchNetwork } = useWallet();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);

  /*
   * Check before spending. A duplicate is refused and refunded, which costs a
   * transaction and nothing else — but knowing first is better than paying to
   * find out. Keyed on the hash, so SWR handles the "not a hash yet" case by
   * simply not fetching, with no effect and no setState.
   */
  const valid = isTxHash(tx);
  const { data: probe } = useSWR(
    valid ? ["challenge-probe", agent.agent_id, agent.chain, tx.trim()] : null,
    async () => {
      const [p, a] = await Promise.all([
        previewChallenge(agent.agent_id, tx.trim()),
        isTxChallenged(agent.chain, tx.trim()),
      ]);
      return { preview: p as PatrolPreview, already: a };
    },
    { shouldRetryOnError: false },
  );
  const preview = probe?.preview ?? null;
  const already = probe?.already ?? null;

  const stake = config ? BigInt(config.challenge_stake) : 5n * 10n ** 16n;
  const isOperator = Boolean(account && account.toLowerCase() === agent.operator.toLowerCase());
  const maxReason = config?.max_reason_chars ?? 300;

  const problems: string[] = [];
  if (tx && !isTxHash(tx)) problems.push("A transaction hash is 0x followed by 64 hex characters.");
  if (already?.challenged) problems.push("That transaction has already been judged — one judgement per transaction.");
  if (isOperator) problems.push("You registered this agent; an operator cannot challenge their own.");
  if (reason && reason.trim().length < 10) problems.push("Say what looks wrong, in a few words at least.");
  if (reason.length > maxReason) problems.push(`The reason is capped at ${maxReason} characters.`);
  /*
   * "not currently challengeable" named a flag, not a reason. The contract has
   * three distinct ways to reach it and they mean entirely different things to
   * whoever is reading — one is "this agent was caught", one is "the operator
   * took their money and left", one is "the whole contract is stopped". Say
   * which, and say what would change it.
   */
  if (!agent.challengeable) {
    const floor = config ? `${formatGen(config.min_bond, 2)} GEN` : "the minimum";
    if (agent.status === "SLASHED_OUT") {
      problems.push(
        `This agent has already been deactivated after ${agent.violation_count} proven ` +
        `violation${agent.violation_count === 1 ? "" : "s"} — its bond fell below ${floor}, ` +
        `so it can no longer cover a penalty. No further challenges can be filed until ` +
        `someone tops the bond back above ${floor}.`);
    } else if (agent.status === "WITHDRAWN") {
      problems.push(
        "This agent is retired: its operator withdrew the bond, so there is nothing left " +
        "to answer for its conduct. Its record stays readable, but it cannot be challenged.");
    } else {
      problems.push(
        "This agent cannot be challenged right now — its bond is not available to answer " +
        "for a penalty. Check its status above.");
    }
  }

  const ready = Boolean(account) && isTxHash(tx) && reason.trim().length >= 10 && problems.length === 0;

  async function submit() {
    if (!account) return;
    setBusy(true); setResult(null);
    try {
      const out = await challengeAgent(account, agent.agent_id, tx.trim(), reason.trim(), stake);
      setResult(out);
      if (out.kind === "ok") {
        onFiled?.();
        const id = (out.data as { challenge_id?: number })?.challenge_id;
        if (typeof id === "number") setTimeout(() => router.push(`/challenge/${id}`), 1400);
      }
    } finally { setBusy(false); }
  }

  return (
    <Panel className="p-5">
      <Label>File a challenge</Label>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        Name one transaction you believe breaks this mandate and stake{" "}
        <span className="mono text-ink">{formatGen(stake)} GEN</span> on being right.
        Five validators decide.
      </p>

      <input value={tx} onChange={(e) => setTx(e.target.value)} spellCheck={false}
        placeholder="0x… transaction hash"
        className="mono mt-4 w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-3" />

      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="text-[11px] text-ink-3">Why it looks wrong</span>
        <span className={`mono text-[11px] ${reason.length > maxReason ? "text-violation-ink" : "text-ink-3"}`}>
          {reason.length}/{maxReason}
        </span>
      </div>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
        placeholder="Swapped into a token the mandate does not permit…"
        className="mt-1.5 w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-3" />

      {preview && isTxHash(tx) && !already?.challenged && (
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          <Outcome label="Upheld" value={`+${formatGen(preview.if_violation.bounty, 3)}`} tone="compliant" note="bounty" />
          <Outcome label="Refuted" value={`−${formatGen(preview.if_compliant.you_lose, 3)}`} tone="violation" note="your stake" />
          <Outcome label="Inconclusive" value="±0" tone="neutral" note="refunded" />
        </div>
      )}

      {problems.length > 0 && (
        <ul className="mt-3.5 space-y-1 rounded-lg border border-neutral/25 bg-neutral/5 p-3 text-[12px] text-neutral-ink">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}

      {already?.challenged && typeof already.challenge_id === "number" && (
        <a href={`/challenge/${already.challenge_id}`}
          className="mt-2 block text-[12px] text-signal hover:underline">
          See the existing judgement →
        </a>
      )}

      <div className="mt-4">
        {!account ? (
          <button onClick={connect} className="w-full rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-white">
            Connect wallet to challenge
          </button>
        ) : onWrongNetwork ? (
          <button onClick={switchNetwork}
            className="w-full rounded-lg border border-neutral/40 bg-neutral/10 px-4 py-2.5 text-sm font-medium text-neutral-ink">
            Switch network
          </button>
        ) : (
          <button onClick={submit} disabled={!ready || busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violation px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            <Icon name="challenges" size={16} />
            {busy ? "Filing…" : `Challenge and stake ${formatGen(stake)} GEN`}
          </button>
        )}
      </div>

      {config && (
        <div className="mt-3 text-[11px] leading-relaxed text-ink-3">
          If upheld, the operator is slashed {percentFromBps(config.penalty_bps)}% of their bond
          and you take {percentFromBps(config.bounty_bps)}% of that as a bounty, plus your stake
          back. If refuted, {percentFromBps(config.vindication_bps)}% of your stake goes to the
          operator you accused.
        </div>
      )}

      {result?.kind === "ok" && (
        <div className="mt-3 rounded-lg border border-compliant/30 bg-compliant/10 p-3 text-[13px] text-compliant-ink">
          Filed. Opening the challenge…
        </div>
      )}
      {result?.kind === "rejected" && (
        <div className="mt-3 rounded-lg border border-neutral/30 bg-neutral/10 p-3 text-[13px] text-neutral-ink">
          <div className="font-medium">Turned down — your stake came back.</div>
          <div className="mt-1">{result.reason}</div>
        </div>
      )}
      {result?.kind === "failed" && (
        <div className="mt-3 rounded-lg border border-violation/30 bg-violation/10 p-3 text-[13px] text-violation-ink">
          {result.error}
        </div>
      )}
    </Panel>
  );
}

function Outcome({ label, value, tone, note }: {
  label: string; value: string; tone: "compliant" | "violation" | "neutral"; note: string;
}) {
  const colour = { compliant: "text-compliant-ink", violation: "text-violation-ink", neutral: "text-neutral-ink" }[tone];
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-2 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mono mt-1 text-[13px] font-semibold ${colour}`}>{value}</div>
      <div className="text-[10px] text-ink-3">{note}</div>
    </div>
  );
}
