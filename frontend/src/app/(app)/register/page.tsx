"use client";

/**
 * Register an agent in three steps, each shown as it lands on chain:
 *   1. the registration itself (bond posted, mandate version 1 in force),
 *   2. the linter: validators mark clauses that cannot be judged from on-chain
 *      data (a breach of those can never be slashed),
 *   3. the result, shown here before the operator leaves the page.
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Label, Panel, SeverityTag } from "@/components/ui";
import { ClauseEditor, TableEditor } from "@/components/ClauseEditor";
import { TxStatus, useTx } from "@/components/tx";
import { useWallet } from "@/components/WalletProvider";
import { getAgentByWallet, getConfig, getMandateVersions, lintMandate, registerAgent } from "@/lib/contract";
import { formatGen, isAddress, parseGen } from "@/lib/format";
import { DEFAULT_TABLE, draftProblems, mandateText, tableText } from "@/lib/mandate";
import type { DraftClause, Table } from "@/lib/mandate";
import type { MandateVersion } from "@/types";

const CHAINS = ["ethereum", "base", "arbitrum", "polygon", "robinhood"];
const TYPES = ["TRADING", "DEFI", "SHOPPING", "CONTENT", "CUSTOM"];

export default function RegisterPage() {
  const { account, connect } = useWallet();
  const { data: cfg } = useSWR("config", getConfig);
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [name, setName] = useState("");
  const [type, setType] = useState("TRADING");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [bond, setBond] = useState("0.5");
  const [clauses, setClauses] = useState<DraftClause[]>([
    { severity: "MAJOR", text: "Only trade WETH 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 and USDC 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48." },
    { severity: "MINOR", text: "Never send more than 0.5 ETH of native value in one transaction." },
  ]);
  const [table, setTable] = useState<Table>(DEFAULT_TABLE);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [lint, setLint] = useState<MandateVersion | null>(null);
  const reg = useTx();
  const lintTx = useTx();

  const w = wallet.trim().toLowerCase();
  const bondWei = parseGen(bond);
  const problems = [
    ...(w && !isAddress(w) ? ["The agent wallet must be a 0x address."] : []),
    ...(bondWei !== null && cfg && bondWei < BigInt(cfg.min_bond) ? [`The bond must be at least ${formatGen(cfg.min_bond)} GEN.`] : []),
    ...(bondWei === null ? ["The bond must be an amount in GEN, e.g. 0.5."] : []),
    ...(url && !/^https?:\/\//i.test(url.trim()) ? ["The operator URL must start with https:// or http://"] : []),
    ...draftProblems(clauses, table),
  ];
  const ready = isAddress(w) && problems.length === 0 && !!account;

  const submit = () => reg.run(async (onProgress) => {
    const r = await registerAgent(account!, w, chain, mandateText(clauses), tableText(table),
      { name, agentType: type, description, operatorUrl: url.trim() }, bondWei!, {
        onProgress,
        confirm: async () => {
          const f = await getAgentByWallet(chain, w);
          if (f.found && f.agent && f.agent.operator.toLowerCase() === account!.toLowerCase()) { setAgentId(f.agent.agent_id); return true; }
          return false;
        },
      });
    return r;
  });

  const runLint = () => lintTx.run(async (onProgress) => {
    const r = await lintMandate(account!, agentId!, 1, {
      onProgress,
      confirm: async () => {
        const v = (await getMandateVersions(agentId!)).versions[0];
        if (v.lint_status !== "PENDING") { setLint(v); return true; }
        return false;
      },
    });
    return r;
  });

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Label>Register</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Put a bond behind what your agent promises</h1>
      <p className="mt-2 text-[14px] text-ink-2">
        A mandate is numbered clauses. Each carries a severity you choose, and the severity table says what a proven breach of each costs, as a share of the bond
        at the time a challenge is filed. Both are frozen in this version; edits later create a new version that takes effect after a delay.
        Registering does not prove you control the wallet: the bond is your money, and it answers for that wallet&apos;s conduct.
      </p>

      <Panel className="mt-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="r-wallet" className="text-xs font-medium text-ink-2">Agent wallet</label>
            <input id="r-wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" spellCheck={false}
              className="mono mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          </div>
          <div>
            <label htmlFor="r-chain" className="text-xs font-medium text-ink-2">Chain it acts on</label>
            <select id="r-chain" value={chain} onChange={(e) => setChain(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]">
              {CHAINS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="r-name" className="text-xs font-medium text-ink-2">Name (optional)</label>
            <input id="r-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          </div>
          <div>
            <label htmlFor="r-type" className="text-xs font-medium text-ink-2">Type</label>
            <select id="r-type" value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]">
              {TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="r-desc" className="text-xs font-medium text-ink-2">Description (optional, not read by validators)</label>
            <input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          </div>
          <div>
            <label htmlFor="r-url" className="text-xs font-medium text-ink-2">Operator URL (optional)</label>
            <input id="r-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          </div>
          <div>
            <label htmlFor="r-bond" className="text-xs font-medium text-ink-2">Bond in GEN (minimum {cfg ? formatGen(cfg.min_bond) : "…"})</label>
            <input id="r-bond" value={bond} onChange={(e) => setBond(e.target.value)} className="mono mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          </div>
        </div>
      </Panel>

      <Panel className="mt-6 p-5">
        <Label>The mandate</Label>
        <p className="mt-1 mb-3 text-[13px] text-ink-2">Write clauses a validator can check against a transaction: name contracts and tokens by address, give amounts. Clauses about prices in dollars, intent or anything off-chain will be flagged by the linter and can never be slashed.</p>
        <ClauseEditor clauses={clauses} onChange={setClauses} />
        <div className="mt-6"><Label>Severity table</Label></div>
        <div className="mt-3"><TableEditor table={table} onChange={setTable} /></div>
        <pre className="mono mt-4 overflow-x-auto whitespace-pre-wrap rounded-md bg-panel-2 p-3 text-[11.5px] text-ink-2">{mandateText(clauses)}{"\n"}{tableText(table)}</pre>
      </Panel>

      {problems.length > 0 && <ul className="mt-4 space-y-1 text-[13px] text-neutral-ink">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {account ? (
          <button onClick={submit} disabled={!ready || reg.busy || agentId !== null}
            className="rounded-md bg-signal px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {agentId !== null ? `Registered as #${agentId}` : `Post ${bond} GEN and register`}
          </button>
        ) : <button onClick={connect} className="rounded-md bg-signal px-5 py-2.5 text-sm font-medium text-white">Connect a wallet</button>}
      </div>
      <TxStatus progress={reg.progress} success={agentId !== null ? `Registered as agent #${agentId}; version 1 is in force. Run the linter next.` : undefined} />

      {agentId !== null && (
        <Panel className="mt-6 p-5">
          <Label>Step 2 — the linter</Label>
          <p className="mt-1 text-[13px] text-ink-2">Validators read the clauses and must agree, clause id for clause id, which cannot be judged from on-chain data. If they do not agree, nothing is written and you can run it again; after {cfg ? Math.round(cfg.lint_window / 3600) : "…"} h anyone can close it as INCONCLUSIVE.</p>
          {!lint && <button onClick={runLint} disabled={lintTx.busy} className="mt-3 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Run the linter</button>}
          <TxStatus progress={lintTx.progress} success={lint ? "Linted and confirmed in contract state." : undefined} />
          {lint && (
            <div className="mt-4">
              <div className="text-sm font-medium">Result: {lint.lint_status}{lint.lint_status === "DONE" && ` — ${lint.lint_flags.length} clause(s) flagged`}</div>
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {lint.clauses.map((c) => {
                  const f = lint.lint_flags.find((x) => x.clause === c.id);
                  return (
                    <li key={c.id} className="flex gap-2">
                      <span className="mono font-semibold">{c.id}</span><SeverityTag severity={c.severity} />
                      <span className={f ? "text-neutral-ink" : ""}>{c.text}{f ? ` — not judgeable: “${f.quote}”` : " — judgeable"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Link href={`/agent/${agentId}`} className="mt-4 inline-block text-sm font-medium text-signal hover:underline">Go to agent #{agentId} →</Link>
        </Panel>
      )}
    </div>
  );
}
