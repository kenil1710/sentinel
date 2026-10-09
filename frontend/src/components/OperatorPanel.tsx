"use client";

/**
 * The operator's controls, shown only to the operator's own wallet (the
 * contract refuses everyone else anyway). Withdrawals and unregistering are
 * timelocked; while challenges are open, only the part of the bond they could
 * never slash can be withdrawn, and an unregistering agent's bond is released
 * only once nothing is open. Mandate edits are queued behind a delay and never
 * reach back.
 */
import { useState } from "react";
import useSWR from "swr";
import { Label, Panel } from "./ui";
import { ClauseEditor, TableEditor } from "./ClauseEditor";
import { Countdown, useNow } from "./time";
import { TxStatus, useTx } from "./tx";
import {
  cancelWithdrawal, executeWithdrawal, finalizeUnregister, getAgent, getConfig, getMandateVersions,
  requestWithdrawal, topUpBond, unregisterAgent, updateMandate,
} from "@/lib/contract";
import { formatGen, parseGen } from "@/lib/format";
import { DEFAULT_TABLE, draftProblems, fromClauses, mandateText, tableText } from "@/lib/mandate";
import type { DraftClause, Table } from "@/lib/mandate";
import type { SendOptions } from "@/lib/contract";
import type { Agent, WriteResult } from "@/types";

export function OperatorPanel({ agent, account, onChange }: { agent: Agent; account: `0x${string}`; onChange: () => void }) {
  const { data: cfg } = useSWR("config", getConfig);
  const now = useNow(5000);
  const tx = useTx();
  const [topUp, setTopUp] = useState("0.5");
  const [withdraw, setWithdraw] = useState("");
  const [editing, setEditing] = useState(false);
  const latest = agent.latest_version;
  const [clauses, setClauses] = useState<DraftClause[]>(latest ? fromClauses(latest.clauses) : []);
  const [table, setTable] = useState<Table>(latest ? {
    MINOR: latest.severity_bps.MINOR, MAJOR: latest.severity_bps.MAJOR, CRITICAL: latest.severity_bps.CRITICAL,
    STEP: latest.repeat_step_bps, CAP: latest.repeat_cap_bps } : DEFAULT_TABLE);
  const [done, setDone] = useState("");

  const refresh = async () => { onChange(); };
  const act = (label: string, fn: (o: SendOptions<unknown>) => Promise<WriteResult<unknown>>, confirm: (a: Agent) => boolean) =>
    tx.run(async (onProgress) => {
      setDone("");
      const r = await fn({ onProgress, confirm: async () => confirm(await getAgent(agent.agent_id)) });
      if (r.kind === "ok") { setDone(label); await refresh(); }
    });

  const open = agent.open_count;
  const queuedW = BigInt(agent.withdraw_amount) > 0n;
  const unlocked = queuedW && now >= agent.withdraw_unlock_at;
  const problems = editing ? draftProblems(clauses, table) : [];
  const queuedVersion = latest && latest.effective_from > now;

  return (
    <Panel className="p-5">
      <Label>Operator controls</Label>
      <p className="mt-1 text-xs text-ink-2">Only {agent.operator.slice(0, 8)}… can use these. {open > 0 && <b className="text-neutral-ink">{open} challenge(s) or appeal(s) are open: {formatGen(agent.held_for_open)} GEN of the bond is held for what they could cost; {formatGen(agent.withdrawable)} GEN can be withdrawn.</b>}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line p-3.5">
          <div className="text-sm font-medium">Top up the bond</div>
          <p className="text-xs text-ink-2">Bond now {formatGen(agent.bond)} GEN; minimum {cfg ? formatGen(cfg.min_bond) : "…"} GEN. A paused agent back at the minimum is active again.</p>
          <div className="mt-2 flex gap-2">
            <label htmlFor="op-topup" className="sr-only">Top-up amount in GEN</label>
            <input id="op-topup" value={topUp} onChange={(e) => setTopUp(e.target.value)} className="mono w-28 rounded-md border border-line-2 px-2 py-1.5 text-sm" />
            <button disabled={tx.busy || !parseGen(topUp) || agent.status === "RETIRED" || agent.status === "UNREGISTERING"}
              onClick={() => { const v = parseGen(topUp)!; const before = BigInt(agent.bond);
                act("Bond topped up.", (o) => topUpBond(account, agent.agent_id, v, o), (a) => BigInt(a.bond) >= before + v); }}
              className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Top up</button>
          </div>
        </div>

        <div className="rounded-lg border border-line p-3.5">
          <div className="text-sm font-medium">Withdraw part of the bond</div>
          {queuedW ? (
            <>
              <p className="text-xs text-ink-2">{formatGen(agent.withdraw_amount)} GEN queued; <Countdown at={agent.withdraw_unlock_at} open="unlocks in" closed="unlocked" />. Anyone may execute it once unlocked; it moves to your claimable balance, less anything still held for open challenges.</p>
              <div className="mt-2 flex gap-2">
                <button disabled={tx.busy || !unlocked || BigInt(agent.withdrawable) <= 0n}
                  onClick={() => act("Withdrawal executed; it is in your claimable balance.", (o) => executeWithdrawal(account, agent.agent_id, o), (a) => BigInt(a.withdraw_amount) === 0n)}
                  className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Execute</button>
                <button disabled={tx.busy} onClick={() => act("Withdrawal cancelled.", (o) => cancelWithdrawal(account, agent.agent_id, o), (a) => BigInt(a.withdraw_amount) === 0n)}
                  className="rounded-md border border-line-2 px-3 py-1.5 text-sm">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-ink-2">Timelocked {cfg ? Math.round(cfg.withdraw_delay / 60) : "…"} min; the bond keeps answering for challenges filed meanwhile.</p>
              <div className="mt-2 flex gap-2">
                <label htmlFor="op-withdraw" className="sr-only">Withdrawal amount in GEN</label>
                <input id="op-withdraw" value={withdraw} onChange={(e) => setWithdraw(e.target.value)} placeholder={formatGen(agent.withdrawable)} className="mono w-28 rounded-md border border-line-2 px-2 py-1.5 text-sm" />
                <button disabled={tx.busy || !parseGen(withdraw) || parseGen(withdraw)! > BigInt(agent.withdrawable) || !["ACTIVE", "PAUSED"].includes(agent.status)}
                  onClick={() => act("Withdrawal requested; the timelock has started.", (o) => requestWithdrawal(account, agent.agent_id, parseGen(withdraw)!, o), (a) => BigInt(a.withdraw_amount) > 0n)}
                  className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Request</button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-line p-3.5">
          <div className="text-sm font-medium">Unregister</div>
          {agent.status === "UNREGISTERING" ? (
            <>
              <p className="text-xs text-ink-2">Unregistering; <Countdown at={agent.unregister_unlock_at} open="completes in" closed="ready" />. Anyone may finalize it; the whole bond moves to your claimable balance.</p>
              <button disabled={tx.busy || now < agent.unregister_unlock_at || open > 0}
                onClick={() => act("Agent retired; the bond is in your claimable balance.", (o) => finalizeUnregister(account, agent.agent_id, o), (a) => a.status === "RETIRED")}
                className="mt-2 rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Finalize</button>
            </>
          ) : agent.status === "RETIRED" ? <p className="text-xs text-ink-2">Retired.</p> : (
            <>
              <p className="text-xs text-ink-2">Starts a {cfg ? Math.round(cfg.withdraw_delay / 60) : "…"} min timelock during which the agent can still be challenged; the bond is released once nothing is open.</p>
              <button disabled={tx.busy} onClick={() => act("Unregistering started.", (o) => unregisterAgent(account, agent.agent_id, o), (a) => a.status === "UNREGISTERING")}
                className="mt-2 rounded-md border border-line-2 px-3 py-1.5 text-sm disabled:opacity-50">Unregister</button>
            </>
          )}
        </div>

        <div className="rounded-lg border border-line p-3.5">
          <div className="text-sm font-medium">Publish a new mandate version</div>
          <p className="text-xs text-ink-2">Takes effect {cfg ? Math.round(cfg.mandate_delay / 60) : "…"} min after it lands. Transactions mined before then are judged under the version in force when they were mined.</p>
          {queuedVersion ? <p className="mt-2 text-xs text-neutral-ink">Version {latest!.version} is queued; one queued version at a time.</p> : (
            <button onClick={() => setEditing((v) => !v)} className="mt-2 rounded-md border border-line-2 px-3 py-1.5 text-sm">{editing ? "Close editor" : "Edit mandate"}</button>
          )}
        </div>
      </div>

      {editing && !queuedVersion && (
        <div className="mt-4 rounded-lg border border-line p-4">
          <ClauseEditor clauses={clauses} onChange={setClauses} idPrefix="edit" />
          <div className="mt-4"><TableEditor table={table} onChange={setTable} idPrefix="edit-table" /></div>
          {problems.length > 0 && <ul className="mt-3 text-xs text-neutral-ink">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
          <button disabled={tx.busy || problems.length > 0}
            onClick={async () => {
              const before = agent.versions;
              await act("New version published; it is queued behind the delay.", (o) => updateMandate(account, agent.agent_id, mandateText(clauses), tableText(table), o),
                (a) => a.versions === before + 1);
              setEditing(false);
              await getMandateVersions(agent.agent_id).catch(() => null);
            }}
            className="mt-3 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Publish version {agent.versions + 1}</button>
        </div>
      )}
      <TxStatus progress={tx.progress} success={done || undefined} />
    </Panel>
  );
}
