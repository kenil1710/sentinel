"use client";

import { useState } from "react";
import useSWR from "swr";
import { Label, Panel, Spinner, Stat } from "@/components/ui";
import { TxStatus, useTx } from "@/components/tx";
import { useWallet } from "@/components/WalletProvider";
import { claimBalance, getClaimable, getLedger } from "@/lib/contract";
import { formatGen } from "@/lib/format";
import { getDeployment } from "@/lib/genlayer";

export default function BalancePage() {
  const { account, connect } = useWallet();
  const { data: mine, mutate } = useSWR(account ? ["claimable", account, getDeployment()] : null, () => getClaimable(account!), { refreshInterval: 20_000 });
  const { data: ledger } = useSWR(["ledger", getDeployment()], getLedger, { refreshInterval: 30_000 });
  const tx = useTx();
  const [done, setDone] = useState("");
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Label>Balance</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pull payouts</h1>
      <p className="mt-2 text-[14px] text-ink-2">Nothing is pushed. Bounties, refunds, forfeits, released bonds and refused payments are credited here and paid when the owner claims.</p>
      <Panel className="mt-6 p-5">
        {!account ? <button onClick={connect} className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white">Connect a wallet</button> : !mine ? <Spinner /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Claimable now" value={`${formatGen(mine.claimable)} GEN`} tone="signal" />
              <Stat label="Claimed so far" value={`${formatGen(mine.claimed)} GEN`} />
            </div>
            <button disabled={tx.busy || BigInt(mine.claimable) === 0n}
              onClick={() => tx.run(async (onProgress) => {
                const before = BigInt(mine.claimable);
                const r = await claimBalance(account, { onProgress, confirm: async () => BigInt((await getClaimable(account)).claimable) === 0n });
                if (r.kind === "ok") { setDone(`Claimed ${formatGen(before)} GEN; the transfer has been posted.`); mutate(); }
              })}
              className="mt-4 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Claim</button>
            <TxStatus progress={tx.progress} success={done || undefined} />
            <p className="mt-3 text-xs text-ink-2">Studio Dev queues value transfers and does not deliver them, so a claim zeroes this balance and posts the transfer, but the GEN may not reach the wallet on this network. The books below account for it.</p>
          </>
        )}
      </Panel>
      {ledger && (
        <Panel className="mt-6 p-5">
          <Label>The contract&apos;s books</Label>
          <dl className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-2">
            {([["Received in all", ledger.received], ["Bonds held", ledger.bonds], ["Open stakes and appeal bonds", ledger.open_stakes],
              ["Claimable", ledger.claimable], ["Claimed (transfers posted)", ledger.claimed], ["On-chain balance", ledger.on_chain_balance]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-ink-2">{k}</dt><dd className="mono">{formatGen(v)} GEN</dd></div>))}
          </dl>
          <p className={`mt-3 text-xs ${ledger.invariant_holds && ledger.views_match_storage ? "text-compliant-ink" : "text-violation-ink"}`}>
            {ledger.invariant_holds ? "✓ received = bonds + open stakes + claimable + claimed" : "✗ the invariant does not hold"} ·{" "}
            {ledger.views_match_storage ? "✓ every total recomputed from the records matches its counter" : "✗ a recomputed total disagrees"}
          </p>
          <p className="mt-1 text-xs text-ink-2">Undelivered transfers (on-chain balance minus what the contract still holds): {formatGen(ledger.undelivered_transfers)} GEN.</p>
        </Panel>
      )}
    </div>
  );
}
