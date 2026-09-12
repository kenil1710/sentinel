"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Panel, Label, ChainTag, Spinner } from "@/components/ui";
import { useWallet } from "@/components/WalletProvider";
import { FaucetNote } from "@/components/Onboarding";
import { getAgentByWallet, getConfig, registerAgent } from "@/lib/contract";
import { CHAIN_LABEL, EXPLORER_HOST, formatGen, isAddress, parseGen, percentFromBps } from "@/lib/format";
import type { AgentType, WriteResult } from "@/types";

/*
 * Robinhood Chain is deliberately not offered. The contract would accept a
 * registration on it, and then the patrol could never read the wallet — the
 * operator would post a bond against a watch that cannot happen.
 */
const CHAINS = ["ethereum", "base", "arbitrum", "polygon"] as const;

/**
 * The five types the contract accepts. Anything else it stores as CUSTOM, so
 * this list is a convenience for the operator rather than the rule — the rule
 * is `_norm_type` on chain, and get_config publishes the same list.
 */
const TYPES: { id: AgentType; label: string; hint: string }[] = [
  { id: "TRADING", label: "Trading", hint: "Swaps, market making, arbitrage" },
  { id: "DEFI", label: "DeFi", hint: "Lending, staking, yield" },
  { id: "SHOPPING", label: "Shopping", hint: "Purchasing and procurement" },
  { id: "CONTENT", label: "Content", hint: "Publishing, minting, curation" },
  { id: "CUSTOM", label: "Custom", hint: "Anything else" },
];

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
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("TRADING");
  const [description, setDescription] = useState("");
  const [operatorUrl, setOperatorUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  /** The registered agent, once known — from the receipt or read back from chain. */
  const [agentId, setAgentId] = useState<number | null>(null);
  /** Registered, but the id could not be resolved. Never claim a redirect then. */
  const [lookupFailed, setLookupFailed] = useState(false);

  const minBond = cfg ? BigInt(cfg.min_bond) : 5n * 10n ** 17n;
  const bondWei = useMemo(() => parseGen(bond), [bond]);

  const problems: string[] = [];
  if (wallet && !isAddress(wallet)) problems.push("That is not a 0x-prefixed 40-character address.");
  if (mandate && mandate.trim().length < (cfg?.min_mandate_chars ?? 20))
    problems.push(`A mandate needs at least ${cfg?.min_mandate_chars ?? 20} characters.`);
  if (mandate.length > (cfg?.max_mandate_chars ?? 1000))
    problems.push(`A mandate is capped at ${cfg?.max_mandate_chars ?? 1000} characters.`);
  if (bond && bondWei === null) problems.push("The bond must be a plain decimal amount of GEN.");
  if (bondWei !== null && bondWei < minBond)
    problems.push(`The bond must be at least ${formatGen(minBond)} GEN.`);
  if (name.length > (cfg?.max_name_chars ?? 100))
    problems.push(`The name is capped at ${cfg?.max_name_chars ?? 100} characters.`);
  if (description.length > (cfg?.max_description_chars ?? 500))
    problems.push(`The description is capped at ${cfg?.max_description_chars ?? 500} characters.`);
  // Mirrors the contract's own rule. It is enforced on chain regardless — this
  // just says so before the transaction is sent rather than after it refunds.
  if (operatorUrl.trim() && !/^https?:\/\/\S+$/i.test(operatorUrl.trim()))
    problems.push("The operator URL must start with https:// or http:// and contain no spaces.");

  const ready = Boolean(account) && isAddress(wallet) && mandate.trim().length >= (cfg?.min_mandate_chars ?? 20)
    && bondWei !== null && bondWei >= minBond && problems.length === 0;

  /**
   * The agent id for a registration that has just succeeded.
   *
   * The return payload is the fast path and usually carries it. But
   * `readWriteResult` reports a settled write with an UNREADABLE payload as
   * `ok` with empty data — deliberately, because the transaction happened and
   * the bond moved; only the return value went missing in transport. That case
   * left this page showing "Taking you to the agent…" over a redirect that
   * could never fire, which is the bug: a promise the code had no way to keep.
   *
   * So when the payload has no id, it is READ BACK from the contract. The
   * wallet is claimed on chain by the time the write settles, so the id exists
   * and is simply being fetched rather than guessed. A couple of quick retries
   * cover a read that races an indexer, and the whole path is budgeted to stay
   * inside the two seconds before the redirect is promised.
   */
  async function resolveAgentId(out: Extract<WriteResult, { kind: "ok" }>): Promise<number | null> {
    // Accept a string too: the id crosses JSON and a stringified number is
    // still an id. Rejecting one on its type is how the redirect went missing.
    const raw = (out.data as { agent_id?: number | string })?.agent_id;
    const direct = typeof raw === "string" ? Number(raw) : raw;
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;

    /*
     * Each attempt is raced against a short deadline rather than allowed to run
     * to the read client's 30s timeout.
     *
     * MEASURED on Studio Dev: the same `get_agent_by_wallet` call returned in
     * 1.2s, 1.3s, 3.2s, 4.4s and 12.2s over five consecutive runs. Waiting out
     * the slow tail would put the redirect a dozen seconds after a registration
     * that has already settled. Abandoning a stalled read and asking again
     * turns that tail into retries, which is the difference between a usually
     * fast answer and an occasionally terrible one.
     */
    const attemptDeadline = <T,>(work: Promise<T>): Promise<T | null> =>
      Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 1100))]);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const found = await attemptDeadline(getAgentByWallet(chain, wallet.trim().toLowerCase()));
        const agent = found?.agent;
        const id = Number(agent?.agent_id);
        /*
         * The operator must match, and this is not a formality.
         *
         * An unreadable payload is also what a REJECTION looks like when its
         * text does not survive either — and the commonest rejection is a
         * wallet that is already on the register. Redirecting on the bare
         * lookup would then send this operator to somebody else's agent and
         * call it theirs. One transaction was refunded; nothing was registered.
         * So the agent is only accepted as ours if we own it.
         */
        const mine = String(agent?.operator ?? "").toLowerCase() === account?.toLowerCase();
        if (found?.found && Number.isFinite(id) && mine) return id;
      } catch {
        // A failed lookup is not a failed registration. Fall through, retry,
        // and if it never answers the page says so instead of pretending.
      }
      // No sleep between attempts: the deadline above already paced this one,
      // and a registration that has settled is not going to un-settle.
    }
    return null;
  }

  async function submit() {
    if (!account || !bondWei) return;
    setBusy(true);
    setResult(null);
    setAgentId(null);
    setLookupFailed(false);
    try {
      const out = await registerAgent(account, wallet.trim(), chain, mandate.trim(), {
        name: name.trim(), agentType,
        description: description.trim(), operatorUrl: operatorUrl.trim(),
      }, bondWei);
      setResult(out);
      if (out.kind !== "ok") return;

      const settledAt = Date.now();
      const id = await resolveAgentId(out);
      if (id === null) {
        setLookupFailed(true);
        return;
      }
      setAgentId(id);
      /*
       * Budgeted from the moment the write settled, not from here, so a slow
       * fallback lookup cannot push the redirect past the two seconds the
       * banner promises. Measured: the fallback read can take ~2s on Studio
       * Dev on its own, which is why there is no minimum floor — when the
       * lookup has already spent the budget the operator has been watching
       * "Finding your agent…" the whole time and wants the page, not another
       * pause. When the id came back instantly the 1.2s lets the confirmation
       * actually be read.
       */
      const delay = Math.max(0, Math.min(1200, 1900 - (Date.now() - settledAt)));
      setTimeout(() => router.push(`/agent/${id}`), delay);
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

      <FaucetNote />

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
              <label className="text-sm font-medium">Name <span className="text-ink-3 font-normal">(optional)</span></label>
              <span className={`mono text-[11px] ${name.length > (cfg?.max_name_chars ?? 100) ? "text-violation-ink" : "text-ink-3"}`}>
                {name.length}/{cfg?.max_name_chars ?? 100}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              What people should call this agent. A register of bare hex addresses is
              hard to read.
            </p>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Uniswap Rebalancer"
              className="mt-2.5 w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3" />
          </div>

          <div>
            <label className="text-sm font-medium">What it does</label>
            <p className="mt-1 text-[13px] text-ink-3">
              Descriptive only — nothing here is read by a validator, and none of it
              can move money.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TYPES.map((t) => (
                <button key={t.id} onClick={() => setAgentType(t.id)} title={t.hint}
                  className={`rounded-lg border px-2 py-2.5 text-[13px] transition-colors ${
                    agentType === t.id ? "border-signal bg-signal/10 text-signal" : "border-line bg-panel text-ink-2 hover:text-ink"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-[11px] text-ink-3">
              {TYPES.find((t) => t.id === agentType)?.hint}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium">Description <span className="text-ink-3 font-normal">(optional)</span></label>
              <span className={`mono text-[11px] ${description.length > (cfg?.max_description_chars ?? 500) ? "text-violation-ink" : "text-ink-3"}`}>
                {description.length}/{cfg?.max_description_chars ?? 500}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              Context for anyone deciding whether to trust it. This is not the mandate
              and is never judged against.
            </p>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Rebalances an ETH/USDC book every four hours, funded by a single LP."
              className="mt-2.5 w-full resize-y rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-3" />
          </div>

          <div>
            <label className="text-sm font-medium">Operator URL <span className="text-ink-3 font-normal">(optional)</span></label>
            <p className="mt-1 text-[13px] text-ink-3">
              Where to find whoever runs this agent. Must be https:// or http:// —
              the contract refuses anything else, because the page renders it as a link.
            </p>
            <input value={operatorUrl} onChange={(e) => setOperatorUrl(e.target.value)}
              placeholder="https://example.org/our-agents" spellCheck={false}
              className="mono mt-2.5 w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3" />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium">Mandate</label>
              <span className={`mono text-[11px] ${mandate.length > (cfg?.max_mandate_chars ?? 1000) ? "text-violation-ink" : "text-ink-3"}`}>
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
            <ul className="space-y-1 rounded-lg border border-neutral/25 bg-neutral/5 p-3.5 text-[13px] text-neutral-ink">
              {problems.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          )}

          {!account ? (
            <button onClick={connect}
              className="w-full rounded-lg bg-signal px-5 py-3 text-sm font-medium text-white">
              {hasWallet ? "Connect wallet to register" : "Install a wallet to register"}
            </button>
          ) : onWrongNetwork ? (
            <button onClick={switchNetwork}
              className="w-full rounded-lg border border-neutral/40 bg-neutral/10 px-5 py-3 text-sm font-medium text-neutral-ink">
              Switch network to continue
            </button>
          ) : (
            <button onClick={submit} disabled={!ready || busy}
              className="w-full rounded-lg bg-signal px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
              {busy ? "Registering…" : `Register and bond ${bond} GEN`}
            </button>
          )}

          {busy && <Spinner label="Waiting for the validators to accept the transaction…" />}

          {result?.kind === "ok" && (
            <div className="rounded-lg border border-compliant/30 bg-compliant/10 p-4 text-sm text-compliant-ink">
              {agentId !== null ? (
                <>
                  Registered as agent #{agentId}. Taking you to the agent…{" "}
                  <Link href={`/agent/${agentId}`} className="underline underline-offset-2">
                    Go now
                  </Link>
                </>
              ) : lookupFailed ? (
                <>
                  {/* Registered, but the id could not be read back. Say that
                      plainly rather than promising a redirect that cannot fire. */}
                  <div className="font-medium">Registered, and the bond is posted.</div>
                  <div className="mt-1.5 text-[13px]">
                    The agent id could not be read back just now, so this page cannot
                    jump straight to it. It is on the register —{" "}
                    <Link href="/agents" className="underline underline-offset-2">find it here</Link>.
                  </div>
                </>
              ) : (
                "Registered. Finding your agent…"
              )}
            </div>
          )}
          {result?.kind === "rejected" && (
            <div className="rounded-lg border border-neutral/30 bg-neutral/10 p-4 text-sm text-neutral-ink">
              <div className="font-medium">The contract turned this down — and sent your bond back.</div>
              <div className="mt-1.5 text-[13px]">{result.reason}</div>
              <div className="mono mt-1.5 text-[11px] opacity-80">
                refunded {formatGen(result.refunded)} GEN
              </div>
            </div>
          )}
          {result?.kind === "failed" && (
            <div className="rounded-lg border border-violation/30 bg-violation/10 p-4 text-sm text-violation-ink">
              {result.error}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Label>Preview</Label>
          <Panel className="mt-2.5 p-5">
            <div className="flex items-center gap-2">
              <ChainTag chain={chain} />
              <span className="rounded-md bg-compliant/10 px-2 py-0.5 text-[11px] font-medium text-compliant-ink ring-1 ring-compliant/25">
                On duty
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-md bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 ring-1 ring-line">
                {TYPES.find((t) => t.id === agentType)?.label}
              </span>
              {name && <span className="truncate text-sm font-medium text-ink">{name}</span>}
            </div>
            <div className="mono mt-2 truncate text-[13px] text-ink-2">
              {wallet || "0x…"}
            </div>
            {description && (
              <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-ink-3">{description}</p>
            )}
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
                <span className="text-violation-ink">
                  {cfg ? percentFromBps(cfg.penalty_bps) : 20}% of your bond
                </span>
                . A refuted challenge pays{" "}
                <span className="text-compliant-ink">
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
