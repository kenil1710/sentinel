"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChainTag, Empty, Label, Panel, SeverityTag, Spinner, VerdictBadge } from "@/components/ui";
import { Countdown, useNow } from "@/components/time";
import { TxStatus, useTx } from "@/components/tx";
import { useWallet } from "@/components/WalletProvider";
import {
  appealRuling, expireAppeal, finalizeRuling, getAgent, getChallenge, getConfig, resolveAppeal, resolveChallenge, settleStalled,
} from "@/lib/contract";
import type { SendOptions } from "@/lib/contract";
import { absoluteTime, blockscoutUrl, formatGen, shortAddress } from "@/lib/format";
import { explorerUrl } from "@/lib/genlayer";
import { pct } from "@/lib/mandate";
import type { Challenge, WriteResult } from "@/types";

const CODE_TEXT: Record<string, string> = {
  NOT_AGENT_TX: "the transaction does not involve the agent's wallet",
  PARTIAL_DATA: "the explorer record was incomplete, and partial data is never decided either way",
  NOT_FOUND: "the explorer has no record of the transaction",
  TIMESTAMP_MISMATCH: "the filing named the wrong block time, so the mandate version it picked cannot be trusted",
  NOT_JUDGEABLE_CLAUSE: "the breach found rests on a clause the linter marked as not judgeable from on-chain data",
  UNUSABLE_ANSWER: "the model's answer failed code's checks (quote, severity label or coherence)",
  MODEL_INCONCLUSIVE: "the validators found the mandate or the record insufficient to decide",
  STALLED: "no panel settled it before the resolution deadline; the stake was returned",
  WRONG_DOCUMENT: "the explorer returned a different transaction",
};

function Step({ title, when, state, children }: { title: string; when?: React.ReactNode; state: "done" | "now" | "later" | "skipped"; children?: React.ReactNode }) {
  const dot = state === "done" ? "bg-compliant" : state === "now" ? "bg-signal-bright live-dot" : "bg-line-2";
  return (
    <li className="relative pl-7">
      <span className={`absolute left-0 top-1.5 size-3 rounded-full ${dot}`} />
      <div className={`flex flex-wrap items-baseline gap-x-3 ${state === "later" || state === "skipped" ? "text-ink-3" : ""}`}>
        <span className="text-sm font-medium">{title}</span>
        {when && <span className="text-xs text-ink-2">{when}</span>}
      </div>
      {children && <div className="mt-1 text-[13px] text-ink-2">{children}</div>}
    </li>
  );
}

export default function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cid = Number(id);
  const now = useNow();
  const { account, connect } = useWallet();
  const { data: c, error, mutate } = useSWR(["challenge", cid], () => getChallenge(cid), { refreshInterval: 15_000 });
  const { data: agent } = useSWR(c ? ["agent", c.agent_id] : null, () => getAgent(c!.agent_id));
  const { data: cfg } = useSWR("config", getConfig);
  const tx = useTx();
  const [appealText, setAppealText] = useState("");
  const [done, setDone] = useState("");

  if (error) return <div className="mx-auto max-w-4xl px-5 py-16"><Empty title={`No challenge #${id}`} /></div>;
  if (!c) return <div className="mx-auto max-w-4xl px-5 py-16"><Spinner /></div>;

  const act = (label: string, fn: (o: SendOptions<unknown>) => Promise<WriteResult<unknown>>, until: (x: Challenge) => boolean) =>
    tx.run(async (onProgress) => {
      setDone("");
      const r = await fn({ onProgress, confirm: async () => until(await getChallenge(cid)) });
      if (r.kind === "ok") { setDone(label); await mutate(); }
    });

  const r = c.ruling, ap = c.appeal, fin = c.final, s = c.snapshot;
  const ruled = r.ruled_at > 0;
  const appealed = ap.appealed_at > 0;
  const operator = agent?.operator?.toLowerCase();
  const me = account?.toLowerCase();
  const losingParty = r.verdict === "BREACH" ? operator : r.verdict === "COMPLIANT" ? c.challenger : null;
  const canAppeal = c.status === "CONTESTABLE" && now <= r.contest_deadline && me && me === losingParty;
  const appealLen = appealText.trim().length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Link href={`/agent/${c.agent_id}`} className="text-sm text-ink-3 hover:text-ink">← Agent #{c.agent_id}{agent ? ` · ${agent.name}` : ""}</Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Challenge #{c.challenge_id}</h1>
        <ChainTag chain={c.chain} />
        {c.status === "FINAL" ? <VerdictBadge verdict={fin.verdict} />
          : c.status === "APPEALED" ? <VerdictBadge verdict="APPEALED" />
          : c.status === "CONTESTABLE" ? <VerdictBadge verdict={r.verdict} provisional />
          : <VerdictBadge verdict="PENDING" />}
        {(fin.severity || r.severity) && <SeverityTag severity={fin.severity || r.severity} />}
      </div>
      <p className="mt-2 text-sm text-ink-2">
        {shortAddress(c.challenger)} alleges that transaction{" "}
        <a className="mono text-signal hover:underline" href={blockscoutUrl(c.chain, "tx", c.tx_hash)} target="_blank" rel="noreferrer">{shortAddress(c.tx_hash, 6)} ↗</a>{" "}
        breached clause <b className="mono">{c.alleged_clause}</b>: “{c.reason}”
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <Label>Lifecycle</Label>
            <ol className="mt-4 space-y-5 border-l border-line pl-0 [&>li]:ml-[5px]">
              <Step title="Filed" state="done" when={absoluteTime(c.filed_at)}>
                Stake {formatGen(c.stake)} GEN locked. Evidence bound: {c.chain} tx at block time <span className="mono">{c.tx_timestamp}</span>, agent wallet <span className="mono">{shortAddress(c.wallet)}</span>, mandate v{s.mandate_version}.
              </Step>
              <Step title={ruled ? `Provisional ruling: ${r.verdict}` : "Awaiting judgment"} state={ruled ? "done" : "now"}
                when={ruled ? absoluteTime(r.ruled_at) : <Countdown at={c.resolve_deadline} open="resolution deadline in" closed="deadline passed" />}>
                {!ruled && "Anyone may put it to the validators. If none settles it before the deadline, anyone may refund the stake (recorded as INCONCLUSIVE · STALLED)."}
                {ruled && (r.verdict === "BREACH" || r.verdict === "COMPLIANT") && "The party it went against may appeal once, with a bond and new counter-evidence."}
                {ruled && r.code && CODE_TEXT[r.code] && <>Code: {CODE_TEXT[r.code]}.</>}
              </Step>
              {(r.verdict === "BREACH" || r.verdict === "COMPLIANT") && (
                <Step title={appealed ? `Appealed by the ${ap.role.toLowerCase()}` : c.status === "CONTESTABLE" ? "Contestable" : "Not appealed"}
                  state={appealed ? "done" : c.status === "CONTESTABLE" ? "now" : "skipped"}
                  when={appealed ? absoluteTime(ap.appealed_at) : <Countdown at={r.contest_deadline} open="appeal window closes in" closed="appeal window closed" />} />
              )}
              {appealed && (
                <Step title={ap.outcome ? `Appeal ${ap.outcome.toLowerCase()}` : "Fresh judgment pending"} state={ap.outcome ? "done" : "now"}
                  when={ap.outcome && ap.outcome !== "EXPIRED" ? `fresh panel: ${ap.verdict}` : <Countdown at={ap.deadline} open="appeal deadline in" closed="appeal deadline passed" />} />
              )}
              <Step title={c.status === "FINAL" ? `Final: ${fin.verdict}` : "Final"} state={c.status === "FINAL" ? "done" : "later"}
                when={c.status === "FINAL" ? `${absoluteTime(fin.finalized_at)} · ${fin.how.toLowerCase().split("_").join(" ")}` : undefined} />
            </ol>
          </Panel>

          {ruled && (
            <Panel className="p-5">
              <Label>{appealed && ap.outcome && ap.outcome !== "EXPIRED" ? "First panel's ruling" : "Ruling"}</Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={r.verdict} size="sm" />
                {r.clause && <span className="mono text-sm font-semibold">{r.clause}</span>}
                <SeverityTag severity={r.severity} />
                {r.injection_flagged && <span className="rounded bg-neutral/10 px-1.5 py-0.5 text-[11px] text-neutral-ink">injection marker seen in the inputs</span>}
              </div>
              {r.quote && <blockquote className="mt-3 border-l-2 border-line-2 pl-3 text-[13px] italic text-ink-2">“{r.quote}”</blockquote>}
              <p className="mt-3 text-[13.5px] leading-relaxed">{r.reasoning}</p>
              {r.evidence && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-signal">The on-chain facts every validator agreed on</summary>
                  <pre className="mono mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-panel-2 p-3 text-[11.5px] leading-relaxed">{r.evidence}</pre>
                </details>
              )}
              {r.labels && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-ink-2">Explorer labels as the leader read them (not compared between validators)</summary>
                  <pre className="mono mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-panel-2 p-3 text-[11.5px] leading-relaxed text-ink-2">{r.labels}</pre>
                </details>
              )}
              <dl className="mt-3 grid gap-1 text-xs text-ink-2 sm:grid-cols-2">
                <div><dt className="inline">Digest of the immutable facts: </dt><dd className="mono inline break-all">{r.digest || "—"}</dd></div>
                <div><dt className="inline">Transaction kind: </dt><dd className="mono inline break-all">{r.tx_kind || "—"}</dd></div>
              </dl>
            </Panel>
          )}

          {appealed && (
            <Panel className="p-5">
              <Label>Appeal by the {ap.role.toLowerCase()}</Label>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{ap.text}</p>
              <p className="mt-2 text-xs text-ink-2">Bond {formatGen(ap.stake)} GEN from <span className="mono">{shortAddress(ap.appellant)}</span>.</p>
              {ap.outcome && ap.outcome !== "EXPIRED" && (
                <div className="mt-4 rounded-md border border-line bg-panel-2 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    Fresh panel: <VerdictBadge verdict={ap.verdict} size="sm" />{ap.clause && <span className="mono font-semibold">{ap.clause}</span>}<SeverityTag severity={ap.severity} />
                    <span className={`ml-auto text-xs font-medium ${ap.outcome === "UPHELD" ? "text-signal" : "text-ink-2"}`}>Appeal {ap.outcome.toLowerCase()}</span>
                  </div>
                  {ap.quote && <blockquote className="mt-2 border-l-2 border-line-2 pl-3 text-[13px] italic text-ink-2">“{ap.quote}”</blockquote>}
                  <p className="mt-2 text-[13px] leading-relaxed">{ap.reasoning}</p>
                </div>
              )}
              {ap.outcome === "EXPIRED" && <p className="mt-3 text-sm text-ink-2">No panel settled the appeal before its deadline. The bond went back and the first ruling stands.</p>}
            </Panel>
          )}

          {c.status === "CONTESTABLE" && (
            <Panel className="p-5">
              <Label>Appeal this ruling</Label>
              <p className="mt-1.5 text-[13px] text-ink-2">
                Only the {r.verdict === "BREACH" ? "operator" : "challenger"} may appeal a {r.verdict}, once, before the window closes, with a bond of{" "}
                <b className="mono">{formatGen(s.appeal_bond)} GEN</b>. A new panel judges afresh with your counter-evidence. A text that repeats the accusation or the
                ruling (verbatim or nearly) is refused by the novelty gate, and the bond is credited back to you.
              </p>
              {canAppeal ? (
                <>
                  <label htmlFor="appeal-text" className="mt-3 block text-xs font-medium text-ink-2">Counter-evidence ({cfg?.min_appeal_chars ?? 40}–{cfg?.max_appeal_chars ?? 1000} characters)</label>
                  <textarea id="appeal-text" rows={5} value={appealText} onChange={(e) => setAppealText(e.target.value)} maxLength={1000}
                    className="mt-1 w-full rounded-md border border-line-2 bg-panel px-2.5 py-2 text-[13px]" />
                  <button disabled={tx.busy || appealLen < 40}
                    onClick={() => act("Appeal filed. A fresh panel can now judge it.", (o) => appealRuling(account!, cid, appealText.trim(), BigInt(s.appeal_bond), o), (x) => x.status === "APPEALED")}
                    className="mt-2 rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Post {formatGen(s.appeal_bond)} GEN and appeal</button>
                </>
              ) : (
                <p className="mt-3 text-xs text-ink-3">{account ? "This wallet is not the party the ruling went against." : <button onClick={connect} className="text-signal hover:underline">Connect the losing party&apos;s wallet to appeal</button>}</p>
              )}
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <Label>What happens next</Label>
            <div className="mt-3 flex flex-col gap-2">
              {c.status === "PENDING" && now <= c.resolve_deadline && (
                <button disabled={!account || tx.busy} onClick={() => act("The validators ruled; see the lifecycle.", (o) => resolveChallenge(account!, cid, o), (x) => x.status !== "PENDING")}
                  className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Put it to the validators</button>
              )}
              {c.status === "PENDING" && now > c.resolve_deadline && (
                <button disabled={!account || tx.busy} onClick={() => act("Settled as stalled; the stake was returned.", (o) => settleStalled(account!, cid, o), (x) => x.status === "FINAL")}
                  className="rounded-md border border-line-2 px-4 py-2 text-sm disabled:opacity-50">Refund the stake (stalled)</button>
              )}
              {c.status === "CONTESTABLE" && now > r.contest_deadline && (
                <button disabled={!account || tx.busy} onClick={() => act("Final. Payouts are in the parties' claimable balances.", (o) => finalizeRuling(account!, cid, o), (x) => x.status === "FINAL")}
                  className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Make the ruling final</button>
              )}
              {c.status === "APPEALED" && now <= ap.deadline && (
                <button disabled={!account || tx.busy} onClick={() => act("The appeal was judged; the ruling is final.", (o) => resolveAppeal(account!, cid, o), (x) => x.status === "FINAL")}
                  className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Put the appeal to a fresh panel</button>
              )}
              {c.status === "APPEALED" && now > ap.deadline && (
                <button disabled={!account || tx.busy} onClick={() => act("Appeal expired; the first ruling is final.", (o) => expireAppeal(account!, cid, o), (x) => x.status === "FINAL")}
                  className="rounded-md border border-line-2 px-4 py-2 text-sm disabled:opacity-50">Close the expired appeal</button>
              )}
              {c.status === "CONTESTABLE" && now <= r.contest_deadline && <p className="text-xs text-ink-2">Anyone may make it final once the appeal window closes (<Countdown at={r.contest_deadline} open="in" closed="closed" />).</p>}
              {c.status === "FINAL" && <p className="text-xs text-ink-2">Nothing left to do. Payouts sit in claimable balances until each party claims them.</p>}
              {!account && c.status !== "FINAL" && <button onClick={connect} className="text-left text-xs text-signal hover:underline">Connect any wallet: these steps are permissionless.</button>}
            </div>
            <TxStatus progress={tx.progress} success={done || undefined} />
          </Panel>

          <Panel className="p-5">
            <Label>Snapshot taken at filing</Label>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Mandate version</dt><dd className="mono">v{s.mandate_version} · {s.mandate_hash.slice(0, 10)}…</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Bond at filing</dt><dd className="mono">{formatGen(s.bond_at_filing)} GEN</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Severity table</dt><dd className="mono text-right">{pct(s.severity_bps.MINOR)} / {pct(s.severity_bps.MAJOR)} / {pct(s.severity_bps.CRITICAL)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Repeat multiplier</dt><dd className="mono">×{(s.multiplier_bps / 10000).toFixed(2)} ({s.prior_breaches} prior)</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Bounty share</dt><dd className="mono">{pct(s.bounty_bps)} of the slash</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Appeal window / bond</dt><dd className="mono">{Math.round(s.appeal_window / 60)} min · {formatGen(s.appeal_bond)} GEN</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Linter at filing</dt><dd>{s.lint_status}{s.lint_flags.length ? ` · ${s.lint_flags.map((f) => f.clause).join(", ")} not judgeable` : ""}</dd></div>
            </dl>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-signal">The clauses as snapshotted</summary>
              <ul className="mt-2 space-y-1.5 text-[12.5px]">{s.clauses.map((cl) => <li key={cl.id} className="flex gap-2"><span className="mono font-semibold">{cl.id}</span><SeverityTag severity={cl.severity} /><span>{cl.text}</span></li>)}</ul>
            </details>
          </Panel>

          {c.status === "FINAL" && (
            <Panel className="p-5">
              <Label>Money</Label>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink-2">Slashed from the bond</dt><dd className="mono">{formatGen(fin.slash)} GEN</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">To the challenger</dt><dd className="mono">{formatGen(fin.to_challenger)} GEN</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">· of which bounty</dt><dd className="mono">{formatGen(fin.bounty)} GEN</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">To the treasury</dt><dd className="mono">{formatGen(fin.treasury_cut)} GEN</dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">To the operator</dt><dd className="mono">{formatGen(fin.to_operator)} GEN</dd></div>
              </dl>
              {fin.precedent_key && <p className="mt-3 text-xs text-ink-2">Created precedent <Link className="mono text-signal hover:underline" href="/precedents">{fin.precedent_key.slice(0, 12)}…</Link>: the patrol stands down on this kind of transaction for this clause.</p>}
              <p className="mt-2 text-xs text-ink-3">All payouts are pull balances; each party claims from <Link href="/balance" className="text-signal hover:underline">Balance</Link>.</p>
            </Panel>
          )}

          <Panel className="p-5">
            <Label>On the explorers</Label>
            <ul className="mt-2 space-y-1.5 text-[13px]">
              <li><a className="text-signal hover:underline" href={blockscoutUrl(c.chain, "tx", c.tx_hash)} target="_blank" rel="noreferrer">The challenged transaction on {c.chain} ↗</a></li>
              <li><a className="text-signal hover:underline" href={c.tx_url} target="_blank" rel="noreferrer">The exact JSON the validators fetch ↗</a></li>
              <li><a className="text-signal hover:underline" href={explorerUrl("address", c.challenger)} target="_blank" rel="noreferrer">The challenger on Studio Dev ↗</a></li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
