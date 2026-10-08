"use client";

import { useState } from "react";
import useSWR from "swr";
import { Label, Panel, Spinner } from "@/components/ui";
import { TxStatus, useTx } from "@/components/tx";
import { useWallet } from "@/components/WalletProvider";
import { actForAgent, consumerRequests, consumerStanding } from "@/lib/contract";
import { isAddress, shortAddress } from "@/lib/format";
import { CONSUMER_ADDRESS, CONTRACT_ADDRESS, explorerUrl } from "@/lib/genlayer";

const CODE = `standing = gl.contract.get_at(SENTINEL).view().get_standing_by_wallet(chain, wallet)
if not standing["good_standing"]:
    refuse(standing["reasons"])`;

export default function ConsumerPage() {
  const { account, connect } = useWallet();
  const [chain, setChain] = useState("ethereum");
  const [wallet, setWallet] = useState("");
  const [instruction, setInstruction] = useState("rebalance 10% of the treasury into USDC");
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const { data: log, mutate } = useSWR("consumer-requests", () => consumerRequests(20), { refreshInterval: 30_000 });
  const tx = useTx();
  const [done, setDone] = useState("");

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Label>For other contracts</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">SentinelConsumer: refuse to act for an agent that is not in good standing</h1>
      <p className="mt-2 max-w-3xl text-[14px] text-ink-2">
        A deployed contract that reads the canonical register by cross-contract view. <span className="mono">is_in_good_standing(chain, wallet)</span> is free for any
        contract to call; <span className="mono">act_for_agent</span> is a demo gate that carries out an instruction only for the agent&apos;s own operator and only while
        Sentinel says the agent is in good standing, and logs every refusal with Sentinel&apos;s reasons. It holds no value and has no owner.
      </p>
      <p className="mono mt-2 break-all text-xs text-ink-3">
        <a className="hover:underline" href={explorerUrl("address", CONSUMER_ADDRESS)} target="_blank" rel="noreferrer">SentinelConsumer {CONSUMER_ADDRESS}</a> → reads{" "}
        <a className="hover:underline" href={explorerUrl("address", CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">Sentinel {CONTRACT_ADDRESS}</a>
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <Label>Ask it</Label>
          <div className="mt-3 flex gap-2">
            <label htmlFor="cs-chain" className="sr-only">Chain</label>
            <select id="cs-chain" value={chain} onChange={(e) => setChain(e.target.value)} className="rounded-md border border-line-2 bg-panel px-2 py-2 text-sm">
              {["ethereum", "base", "arbitrum", "polygon", "robinhood"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <label htmlFor="cs-wallet" className="sr-only">Agent wallet</label>
            <input id="cs-wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="agent wallet 0x…" spellCheck={false}
              className="mono min-w-0 flex-1 rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          </div>
          <button disabled={!isAddress(wallet) || checking} onClick={async () => {
            setChecking(true); setAnswer(null);
            try { setAnswer(await consumerStanding(chain, wallet.trim())); } finally { setChecking(false); }
          }} className="mt-3 rounded-md border border-line-2 px-4 py-2 text-sm disabled:opacity-50">is_in_good_standing</button>
          {checking && <div className="mt-3"><Spinner label="Reading through the consumer contract…" /></div>}
          {answer !== null && <p className={`mono mt-3 text-lg font-semibold ${answer ? "text-compliant-ink" : "text-neutral-ink"}`}>{answer ? "true" : "false"}</p>}

          <label htmlFor="cs-instr" className="mt-5 block text-xs font-medium text-ink-2">Instruction for act_for_agent</label>
          <input id="cs-instr" value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={200}
            className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
          {account ? (
            <button disabled={!isAddress(wallet) || tx.busy} onClick={() => tx.run(async (onProgress) => {
              const before = log?.total ?? 0;
              const r = await actForAgent(account, chain, wallet.trim(), instruction, { onProgress, confirm: async () => (await consumerRequests(1)).total > before });
              setDone(r.kind === "ok" ? "Carried out and logged." : "");
              mutate();
            })} className="mt-3 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Ask it to act</button>
          ) : <button onClick={connect} className="mt-3 rounded-md border border-line-2 px-4 py-2 text-sm">Connect a wallet</button>}
          <TxStatus progress={tx.progress} success={done || undefined} />
          <pre className="mono mt-5 overflow-x-auto rounded-md bg-panel-2 p-3 text-[11.5px] text-ink-2">{CODE}</pre>
        </Panel>

        <Panel className="p-5">
          <Label>Its log</Label>
          {!log ? <Spinner /> : (
            <>
              <p className="mt-1 text-sm text-ink-2">{log.total} requests: {log.carried_out} carried out, {log.refused} refused.</p>
              <ul className="mt-3 space-y-2">
                {log.requests.map((r) => (
                  <li key={r.request_id} className="rounded-md border border-line px-3 py-2 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono font-semibold">#{r.request_id}</span>
                      <span className={r.carried_out ? "text-compliant-ink" : "text-neutral-ink"}>{r.carried_out ? "carried out" : "refused"}</span>
                      <span className="text-ink-3">agent {r.agent_id >= 0 ? `#${r.agent_id}` : "unknown"} · {r.chain} · from {shortAddress(r.sender)}</span>
                    </div>
                    <div className="mt-0.5 text-ink-2">“{r.instruction}”</div>
                    {r.reasons.length > 0 && <div className="mt-0.5 text-neutral-ink">{r.reasons.join("; ")}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
