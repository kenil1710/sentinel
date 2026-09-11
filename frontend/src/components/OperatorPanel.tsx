"use client";

import { useState } from "react";
import { Panel, Label } from "./ui";
import { useWallet } from "./WalletProvider";
import { topUpBond, updateMandate, withdrawBond } from "@/lib/contract";
import { formatGen, parseGen } from "@/lib/format";
import type { Agent, Config, WriteResult } from "@/types";

/**
 * The three things only an operator can do to their own agent.
 *
 * GATED ON THE CONNECTED ADDRESS, and the gate is a courtesy rather than a
 * control: the contract checks `sender_address == agent.operator` on
 * `withdraw_bond` and `update_mandate` and would refuse either from anyone
 * else. What hiding them buys is that a visitor is not offered a button that
 * can only ever fail for them.
 *
 * `top_up_bond` is the exception the contract makes deliberately — ANYONE may
 * fund a bond, because there is no way to abuse a payment into the thing that
 * answers for an agent's conduct. It is still shown only here, because the
 * operator is who normally does it; the SLASHED_OUT notice on the agent page
 * is where a backer is told they may.
 *
 * Each action carries its own result, rather than one shared banner: a refused
 * mandate edit rendered under the top-up field reads as a refused top-up.
 */
type Action = "topup" | "mandate" | "withdraw";

export function OperatorPanel({ agent, config, onDone }: {
  agent: Agent; config?: Config; onDone?: () => void;
}) {
  const { account, onWrongNetwork, switchNetwork } = useWallet();

  const [amount, setAmount] = useState("1");
  /**
   * `null` means "not editing" and shows whatever the chain currently holds, so
   * a mandate updated elsewhere appears here on the next poll. Once there is a
   * draft it wins — a refetch mid-sentence must not overwrite what someone is
   * still typing. This is why the current mandate is NOT mirrored into state.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ action: Action; out: WriteResult } | null>(null);

  const minBond = config ? BigInt(config.min_bond) : 5n * 10n ** 17n;
  const bond = BigInt(agent.bond);
  const pending = agent.pending_count > 0;
  const retired = agent.status === "WITHDRAWN";

  // ── Top up ───────────────────────────────────────────────────────────────
  const topUpWei = parseGen(amount);
  const maxBond = 10n ** 24n; // MAX_BOND in the contract: 1,000,000 GEN.
  const topUpProblem =
    retired ? "This agent is retired. Register it again to redeploy it — a top-up would be refunded."
    : amount.trim() === "" ? null
    : topUpWei === null ? "Enter a plain decimal amount of GEN, like 1 or 0.25."
    : topUpWei <= 0n ? "A top-up has to carry some value."
    : bond + topUpWei > maxBond ? `That would carry the bond past the ${formatGen(maxBond, 0)} GEN ceiling.`
    : null;
  const canTopUp = topUpWei !== null && topUpWei > 0n && !topUpProblem;
  /** What a SLASHED_OUT agent needs before the contract puts it back on duty. */
  const shortfall = agent.status === "SLASHED_OUT" && bond < minBond ? minBond - bond : null;
  const willReactivate = Boolean(shortfall && topUpWei !== null && bond + topUpWei >= minBond);

  // ── Mandate ──────────────────────────────────────────────────────────────
  const mandateText = draft ?? agent.mandate;
  /**
   * The contract measures the mandate AFTER collapsing runs of whitespace
   * (`" ".join(raw.split())`), so counting the raw string would refuse a
   * mandate the chain accepts, and accept one it refuses.
   */
  const normalised = mandateText.trim().split(/\s+/).filter(Boolean).join(" ");
  const minChars = config?.min_mandate_chars ?? 20;
  const maxChars = config?.max_mandate_chars ?? 1000;
  const changed = normalised !== agent.mandate.trim();
  const mandateProblem =
    agent.status !== "ACTIVE"
      ? `This agent is ${agent.status === "SLASHED_OUT" ? "deactivated" : "retired"}; its mandate cannot change until it is back on duty.`
    : pending
      ? `${agent.pending_count} challenge${agent.pending_count === 1 ? " is" : "s are"} awaiting judgement. ` +
        "The mandate is what validators judge against, so it is frozen until they settle."
    : !changed ? null
    : normalised.length < minChars ? `A mandate needs at least ${minChars} characters.`
    : normalised.length > maxChars ? `A mandate is capped at ${maxChars}; this one is ${normalised.length}.`
    : null;
  const canUpdate = changed && !mandateProblem;

  // ── Withdraw ─────────────────────────────────────────────────────────────
  const withdrawProblem =
    retired ? "This bond has already been withdrawn."
    : pending
      ? `${agent.pending_count} challenge${agent.pending_count === 1 ? "" : "s"} awaiting judgement — ` +
        "the bond answers for them and cannot leave until they settle."
    : null;

  async function run(action: Action, work: () => Promise<WriteResult>) {
    if (!account) return;
    setBusy(action);
    setResult(null);
    try {
      const out = await work();
      setResult({ action, out });
      if (out.kind === "ok") {
        if (action === "mandate") setDraft(null);
        if (action === "topup") setAmount("1");
        onDone?.();
      }
    } finally {
      setBusy(null);
    }
  }

  if (onWrongNetwork) {
    return (
      <Panel className="p-5">
        <Label>Your agent</Label>
        <p className="mt-2 text-[13px] text-ink-2">
          You registered this agent, but your wallet is on another network.
        </p>
        <button onClick={switchNetwork}
          className="mt-3 w-full rounded-lg border border-neutral/40 bg-neutral/10 px-4 py-2.5 text-sm font-medium text-neutral-ink">
          Switch network
        </button>
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <Label>Your agent</Label>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        You registered this one, so these are yours to change. Nobody else sees them.
      </p>

      {/* ── Top up ─────────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium">Top up bond</span>
          <span className="mono text-[11px] text-ink-3">now {formatGen(agent.bond, 4)} GEN</span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          {shortfall
            ? <>Adding <span className="mono text-ink-2">{formatGen(shortfall, 4)} GEN</span> or more carries
                this back over the {formatGen(minBond, 2)} GEN minimum and puts it on duty again.</>
            : <>A larger bond means a larger penalty if a challenge is upheld — and a more
                credible agent until one is.</>}
        </p>

        <div className="mt-2.5 flex gap-2">
          <div className="relative flex-1">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
              spellCheck={false} placeholder="1.0" disabled={retired}
              aria-label="Amount of GEN to add to the bond"
              className="mono w-full rounded-lg border border-line bg-panel-2 py-2 pl-3 pr-12 text-[13px] text-ink placeholder:text-ink-3 disabled:opacity-50" />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-ink-3">GEN</span>
          </div>
          <button onClick={() => run("topup", () => topUpBond(account!, agent.agent_id, topUpWei!))}
            disabled={!canTopUp || busy !== null}
            className="rounded-lg bg-signal px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            {busy === "topup" ? "Adding…" : "Top up"}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {(shortfall ? [formatGen(shortfall, 18), "0.5", "1", "5"] : ["0.5", "1", "5"]).map((v) => (
            <button key={v} onClick={() => setAmount(v)} disabled={retired}
              className="mono rounded-md border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3 hover:text-ink disabled:opacity-40">
              +{v}
            </button>
          ))}
        </div>

        {willReactivate && (
          <div className="mt-2 text-[11px] text-compliant-ink">
            This carries the bond to {formatGen(bond + topUpWei!, 4)} GEN — back on duty, and
            challengeable again straight away.
          </div>
        )}
        {topUpProblem && <Note tone="neutral">{topUpProblem}</Note>}
        {result?.action === "topup" && <Outcome out={result.out} okText="Bond topped up." />}
      </div>

      {/* ── Mandate ────────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium">Update mandate</span>
          <span className={`mono text-[11px] ${normalised.length > maxChars ? "text-violation-ink" : "text-ink-3"}`}>
            {normalised.length}/{maxChars}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          This exact text is what validators read when someone challenges a transaction.
          It cannot be edited while a challenge is pending.
        </p>
        <textarea value={mandateText} onChange={(e) => setDraft(e.target.value)} rows={5}
          disabled={agent.status !== "ACTIVE" || pending}
          aria-label="The agent's mandate"
          className="mt-2.5 w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-3 disabled:opacity-60" />
        <div className="mt-2 flex gap-2">
          <button onClick={() => run("mandate", () => updateMandate(account!, agent.agent_id, normalised))}
            disabled={!canUpdate || busy !== null}
            className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink hover:border-line-2 disabled:opacity-40">
            {busy === "mandate" ? "Publishing…" : "Update mandate"}
          </button>
          {draft !== null && (
            <button onClick={() => setDraft(null)} disabled={busy !== null}
              className="rounded-lg px-3 py-2 text-[13px] text-ink-3 hover:text-ink disabled:opacity-40">
              Revert
            </button>
          )}
        </div>
        {mandateProblem && <Note tone="neutral">{mandateProblem}</Note>}
        {result?.action === "mandate" && <Outcome out={result.out} okText="The new mandate is published." />}
      </div>

      {/* ── Withdraw ───────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[13px] font-medium">Withdraw bond</div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Takes the whole {formatGen(agent.bond, 4)} GEN back and retires the agent. Its record
          stays readable, it can no longer be challenged, and this cannot be undone —
          redeploying means registering again.
        </p>
        <button onClick={() => run("withdraw", () => withdrawBond(account!, agent.agent_id))}
          disabled={Boolean(withdrawProblem) || busy !== null}
          title={withdrawProblem ?? undefined}
          className="mt-2.5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink-2 hover:text-ink disabled:opacity-40">
          {busy === "withdraw" ? "Withdrawing…" : `Withdraw ${formatGen(agent.bond, 4)} GEN and retire`}
        </button>
        {withdrawProblem && <Note tone="neutral">{withdrawProblem}</Note>}
        {result?.action === "withdraw" && <Outcome out={result.out} okText="Withdrawn. The agent is retired." />}
      </div>
    </Panel>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone: "neutral" }) {
  const cls = { neutral: "border-neutral/25 bg-neutral/5 text-neutral-ink" }[tone];
  return <div className={`mt-2 rounded-md border p-2.5 text-[12px] leading-relaxed ${cls}`}>{children}</div>;
}

/**
 * The three states of a write, each said in full.
 *
 * `rejected` is the one that has to be spelled out: the transaction SUCCEEDED
 * and the money came back, which is neither a confirmation nor a failure.
 */
function Outcome({ out, okText }: { out: WriteResult; okText: string }) {
  if (out.kind === "ok") {
    return (
      <div className="mt-2 rounded-md border border-compliant/25 bg-compliant/10 p-2.5 text-[12px] text-compliant-ink">
        {okText}
      </div>
    );
  }
  if (out.kind === "rejected") {
    return (
      <div className="mt-2 rounded-md border border-neutral/25 bg-neutral/10 p-2.5 text-[12px] leading-relaxed text-neutral-ink">
        <div className="font-medium">
          Turned down{BigInt(out.refunded || "0") > 0n ? ` — ${formatGen(out.refunded, 4)} GEN came back` : ""}.
        </div>
        <div className="mt-1">{out.reason}</div>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-violation/25 bg-violation/10 p-2.5 text-[12px] leading-relaxed text-violation-ink">
      {out.error}
    </div>
  );
}
