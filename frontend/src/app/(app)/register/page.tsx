"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Panel, Label, ChainTag, Spinner } from "@/components/ui";
import { useWallet } from "@/components/WalletProvider";
import { getConfig, registerAgent } from "@/lib/contract";
import { CHAIN_LABEL, EXPLORER_HOST, formatGen, isAddress, percentFromBps } from "@/lib/format";
import type { WriteResult } from "@/types";

const CHAINS = ["ethereum", "base", "arbitrum", "polygon"] as const;

const EXAMPLES = [
  "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. Never interact with unverified contracts.",
  "Rebalance the treasury weekly between ETH and USDC only. Never send funds to an address flagged as a scam.",
  "May only interact with verified contracts. No single transaction above 1 ETH. No unlisted tokens, ever.",
];

export default function RegisterPage() {
  const router = useRouter();
  const { account, connect, hasWallet, onWrongNetwork, switchNetwork } = useWallet();
  const { data: cfg } = useSWR("config", getConfig);

  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState<(typeof CHAINS)[number]>("ethereum");
  const [mandate, setMandate] = useState("");
  const [bond, setBond] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);

  const minBond = cfg ? BigInt(cfg.min_bond) : 5n * 10n ** 17n;
  const bondWei = useMemo(() => {
    const t = bond.trim();
    if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
    const [w, f = ""] = t.split(".");
    return BigInt(w) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
  }, [bond]);

  const problems: string[] = [];
  if (wallet && !isAddress(wallet)) problems.push("That is not a 0x-prefixed 40-character address.");
  if (mandate && mandate.trim().length < (cfg?.min_mandate_chars ?? 20))
    problems.push(`A mandate needs at least ${cfg?.min_mandate_chars ?? 20} characters.`);
  if (mandate.length > (cfg?.max_mandate_chars ?? 1000))
    problems.push(`A mandate is capped at ${cfg?.max_mandate_chars ?? 1000} characters.`);
  if (bond && bondWei === null) problems.push("The bond must be a plain decimal amount of GEN.");
  if (bondWei !== null && bondWei < minBond)
    problems.push(`The bond must be at least ${formatGen(minBond)} GEN.`);

  const ready = Boolean(account) && isAddress(wallet) && mandate.trim().length >= (cfg?.min_mandate_chars ?? 20)
    && bondWei !== null && bondWei >= minBond && problems.length === 0;

  async function submit() {
    if (!account || !bondWei) return;
    setBusy(true);
    setResult(null);
    try {
      const out = await registerAgent(account, wallet.trim(), chain, mandate.trim(), bondWei);
      setResult(out);
      if (out.kind === "ok") {
        const id = (out.data as { agent_id?: number })?.agent_id;
        if (typeof id === "number") setTimeout(() => router.push(`/agent/${id}`), 1400);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Label>Put an agent on the register</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Register an agent</h1>
      <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Publish what your agent is allowed to do, and post a bond that answers for it.
        The mandate is stored on chain in plain English — it is what validators read
        when someone says your agent broke it.
      </p>

      <div className="mt-9 grid gap-7 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium">Agent wallet</label>
            <p className="mt-1 text-[13px] text-ink-3">The address your agent trades from.</p>
            <input value={wallet} onChange={(e) => setWallet(e.target.value)}
              placeholder="0x…" spellCheck={false}
              className="mono mt-2.5 w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3" />
          </div>

          <div>
            <label className="text-sm font-medium">Chain</label>
            <p className="mt-1 text-[13px] text-ink-3">
              Which explorer the validators read this agent&apos;s transactions from.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHAINS.map((c) => (
                <button key={c} onClick={() => setChain(c)}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    chain === c ? "border-signal bg-signal/10 text-signal" : "border-line bg-panel text-ink-2 hover:text-ink"}`}>
                  {CHAIN_LABEL[c]}
                </button>
              ))}
            </div>
            <div className="mono mt-2 text-[11px] text-ink-3">{EXPLORER_HOST[chain]}</div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium">Mandate</label>
              <span className={`mono text-[11px] ${mandate.length > (cfg?.max_mandate_chars ?? 1000) ? "text-violation" : "text-ink-3"}`}>
                {mandate.length}/{cfg?.max_mandate_chars ?? 1000}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              Plain English. Be specific about amounts, venues and tokens — a vague rule
              produces an inconclusive verdict, which protects nobody.
            </p>
            <textarea value={mandate} onChange={(e) => setMandate(e.target.value)} rows={5}
              placeholder="Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade…"
              className="mt-2.5 w-full resize-y rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-3" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => setMandate(ex)}
                  className="rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] text-ink-3 hover:text-ink">
                  Example {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Security bond</label>
            <p className="mt-1 text-[13px] text-ink-3">
              At risk against proven breaches. Minimum {cfg ? cfg.min_bond_text : "0.5"} GEN.
              {cfg && ` A proven breach costs ${percentFromBps(cfg.penalty_bps)}% of it.`}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input value={bond} onChange={(e) => setBond(e.target.value)} inputMode="decimal"
                className="mono w-40 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm text-ink" />
              <span className="text-sm text-ink-3">GEN</span>
              {["0.5", "1", "5"].map((v) => (
                <button key={v} onClick={() => setBond(v)}
                  className="rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] text-ink-3 hover:text-ink">
                  {v}
                </button>
              ))}
            </div>
          </div>

          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-neutral/25 bg-neutral/5 p-3.5 text-[13px] text-neutral">
              {problems.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          )}

          {!account ? (
            <button onClick={connect}
              className="w-full rounded-lg bg-signal px-5 py-3 text-sm font-medium text-ground">
              {hasWallet ? "Connect wallet to register" : "Install a wallet to register"}
            </button>
          ) : onWrongNetwork ? (
            <button onClick={switchNetwork}
              className="w-full rounded-lg border border-neutral/40 bg-neutral/10 px-5 py-3 text-sm font-medium text-neutral">
              Switch network to continue
            </button>
          ) : (
            <button onClick={submit} disabled={!ready || busy}
              className="w-full rounded-lg bg-signal px-5 py-3 text-sm font-medium text-ground transition-opacity hover:opacity-90 disabled:opacity-40">
              {busy ? "Registering…" : `Register and bond ${bond} GEN`}
            </button>
          )}

          {busy && <Spinner label="Waiting for the validators to accept the transaction…" />}

          {result?.kind === "ok" && (
            <div className="rounded-lg border border-compliant/30 bg-compliant/10 p-4 text-sm text-compliant">
              Registered. Taking you to the agent…
            </div>
          )}
          {result?.kind === "rejected" && (
            <div className="rounded-lg border border-neutral/30 bg-neutral/10 p-4 text-sm text-neutral">
              <div className="font-medium">The contract turned this down — and sent your bond back.</div>
              <div className="mt-1.5 text-[13px]">{result.reason}</div>
              <div className="mono mt-1.5 text-[11px] opacity-80">
                refunded {formatGen(result.refunded)} GEN
              </div>
            </div>
          )}
          {result?.kind === "failed" && (
            <div className="rounded-lg border border-violation/30 bg-violation/10 p-4 text-sm text-violation">
              {result.error}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Label>Preview</Label>
          <Panel className="mt-2.5 p-5">
            <div className="flex items-center gap-2">
              <ChainTag chain={chain} />
              <span className="rounded-md bg-compliant/10 px-2 py-0.5 text-[11px] font-medium text-compliant ring-1 ring-compliant/25">
                On duty
              </span>
            </div>
            <div className="mono mt-3 truncate text-sm text-ink">
              {wallet || "0x…"}
            </div>
            <p className="mt-3 min-h-[4.5rem] text-[13px] leading-relaxed text-ink-2">
              {mandate || <span className="text-ink-3">Your mandate appears here.</span>}
            </p>
            <div className="mono mt-4 flex items-center justify-between border-t border-line pt-3.5 text-[11px]">
              <span className="text-ink-2">{bond || "0"} GEN bonded</span>
              <span className="text-ink-3">0 breaches</span>
            </div>
          </Panel>

          <Panel className="mt-4 p-5">
            <Label>What you are agreeing to</Label>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-2">
              <li>
                <span className="text-ink">Anyone can challenge</span> any transaction this
                wallet makes on {CHAIN_LABEL[chain]}, by staking{" "}
                {cfg ? cfg.challenge_stake_text : "0.05"} GEN.
              </li>
              <li>
                <span className="text-ink">Five validators judge it</span> — they read your
                mandate and the transaction record, and neither you nor anyone else can
                overrule them.
              </li>
              <li>
                A proven breach slashes{" "}
                <span className="text-violation">
                  {cfg ? percentFromBps(cfg.penalty_bps) : 20}% of your bond
                </span>
                . A refuted challenge pays{" "}
                <span className="text-compliant">
                  {cfg ? percentFromBps(cfg.vindication_bps) : 70}% of the accuser&apos;s stake
                </span>{" "}
                into your bond.
              </li>
              <li>
                You can withdraw the bond and retire the agent whenever no challenge is
                pending — <span className="text-ink">a pause cannot trap it</span>.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
