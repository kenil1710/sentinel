import Link from "next/link";
import { Label, Panel } from "@/components/ui";
import { DEPLOYMENTS } from "@/lib/deployments";

const REPO = "https://github.com/kenil1710/sentinel";

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 scroll-mt-24 text-xl font-semibold tracking-tight">{children}</h2>;
}

export default function DocsPage() {
  const ex = (a: string) => `${DEPLOYMENTS.explorer}/address/${a}`;
  return (
    <div className="mx-auto max-w-4xl px-5 py-12 text-[14.5px] leading-relaxed">
      <Label>How it works</Label>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sentinel v2: bonded mandates, judged by validators, appealable, final</h1>
      <p className="mt-3 text-ink-2">
        An operator registers an agent&apos;s wallet on one of five chains under a mandate of numbered clauses, each with a severity, and posts a bond.
        Anyone may challenge one transaction of that wallet as a breach of one clause. GenLayer validators each fetch the transaction from Blockscout,
        and must agree on a verdict. A ruling is provisional for an appeal window; then it is final and money moves to pull balances.
      </p>

      <Panel className="mt-6 p-5">
        <Label>Contracts on GenLayer Studio Dev (chain {DEPLOYMENTS.chainId})</Label>
        <ul className="mono mt-2 space-y-1 break-all text-[12.5px]">
          <li>Sentinel (canonical, 1 h windows) <a className="text-signal hover:underline" href={ex(DEPLOYMENTS.sentinel)}>{DEPLOYMENTS.sentinel}</a></li>
          <li>Sentinel (demo, 90 s windows) <a className="text-signal hover:underline" href={ex(DEPLOYMENTS.demo)}>{DEPLOYMENTS.demo}</a></li>
          <li>SentinelConsumer <a className="text-signal hover:underline" href={ex(DEPLOYMENTS.consumer)}>{DEPLOYMENTS.consumer}</a></li>
        </ul>
        <p className="mt-2 text-xs text-ink-2">All three deployed from commit <a className="mono text-signal hover:underline" href={`${REPO}/commit/${DEPLOYMENTS.commit}`}>{DEPLOYMENTS.commit.slice(0, 10)}</a>; the code read back from chain is byte-identical to <span className="mono">contracts/</span> at that commit.</p>
      </Panel>

      <H id="lifecycle">The lifecycle of a challenge</H>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-2">
        <li><b className="text-ink">Filed.</b> The challenger names the transaction, its block time and the clause, and stakes. The block time picks the mandate version in force when the transaction was mined; that version, its severity table, its linter result, the bond, the repeat multiplier and every window are snapshotted onto the challenge.</li>
        <li><b className="text-ink">Judged (provisional).</b> Anyone calls <span className="mono">resolve_challenge</span>. Each validator fetches the transaction, code checks it is the agent&apos;s, that its block time matches the filing, and that the record is complete; then the model rules. BREACH and COMPLIANT become CONTESTABLE; INCONCLUSIVE and VOID are final at once. If no panel settles it within the resolution window, anyone may refund the stake (<span className="mono">settle_stalled</span>).</li>
        <li><b className="text-ink">Contestable.</b> The party the ruling went against (the operator against a BREACH, the challenger against a COMPLIANT) may appeal once, with a bond and counter-evidence that is not a verbatim or near-verbatim resend of what is on record.</li>
        <li><b className="text-ink">Appealed.</b> A fresh panel judges the same immutable facts (their digest must match) with the counter-evidence; its verdict is final. If none settles it before the appeal deadline, anyone may expire it: the bond goes back and the first ruling stands.</li>
        <li><b className="text-ink">Final.</b> Anyone calls <span className="mono">finalize</span> after the window. Money moves to pull balances; each party claims from Balance.</li>
      </ol>

      <H id="money">Who gets what</H>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead className="border-b border-line text-left text-xs text-ink-2"><tr><th className="py-2 pr-3 font-medium">Final verdict</th><th className="py-2 pr-3 font-medium">Operator</th><th className="py-2 pr-3 font-medium">Challenger</th><th className="py-2 font-medium">Treasury</th></tr></thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-line">
            <tr><td className="py-2 pr-3">BREACH</td><td className="py-2 pr-3">bond − slash</td><td className="py-2 pr-3">stake + 50% of the slash</td><td className="py-2">50% of the slash</td></tr>
            <tr><td className="py-2 pr-3">COMPLIANT</td><td className="py-2 pr-3">+ the challenger&apos;s stake</td><td className="py-2 pr-3">loses the stake</td><td className="py-2">—</td></tr>
            <tr><td className="py-2 pr-3">INCONCLUSIVE</td><td className="py-2 pr-3">—</td><td className="py-2 pr-3">stake back</td><td className="py-2">—</td></tr>
            <tr><td className="py-2 pr-3">VOID (wrong block time)</td><td className="py-2 pr-3">+ the stake</td><td className="py-2 pr-3">loses the stake; the transaction can be challenged again</td><td className="py-2">—</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-ink-2">
        Slash = bond at filing × the clause&apos;s severity (from the version&apos;s table) × the repeat multiplier (1 + step × prior final breaches, capped), never more than the bond still there.
        A lost appeal&apos;s bond goes to the other party; a won appeal&apos;s bond comes back. Below the minimum bond an agent is paused. It is still answerable at any bond, zero included: it can be challenged, every ruling goes on its record and counts toward its repeat multiplier, and a slash takes what the bond can cover. It is not in good standing, so the API, the badge and SentinelConsumer refuse it. The patrol bot does not stake on an agent with nothing to slash; anyone else can. While challenges are open, an operator can withdraw only what they could never slash.
      </p>

      <H id="model">What the model decides, and what it never decides</H>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Panel className="p-4"><div className="text-sm font-semibold">The model</div><p className="mt-1 text-[13px] text-ink-2">BREACH, COMPLIANT or INCONCLUSIVE for one transaction against one mandate version; the clause it rests on, quoted, with the severity label written next to it. For the linter: which clauses cannot be judged from on-chain data, each quoted.</p></Panel>
        <Panel className="p-4"><div className="text-sm font-semibold">Code, always</div><p className="mt-1 text-[13px] text-ink-2">Which explorer is read (fixed table), whether the transaction is the agent&apos;s, whether its block time matches, whether the record is complete, which version applies, whether a quote is verbatim and the label matches, every amount, every deadline, who may act, precedents, track records, standing.</p></Panel>
      </div>
      <p className="mt-3 text-ink-2">Validators compare one string: verdict | clause | digest of the immutable facts | transaction kind. If they do not agree the transaction ends UNDETERMINED and nothing is written; the challenge simply stays where it was and can be judged again.</p>

      <H id="api">The public API and the badge</H>
      <pre className="mono mt-3 overflow-x-auto rounded-md bg-panel-2 p-3 text-[12px]">{`GET /api/check?agent=0x28c6c06298d514db089934071355e5743bf21d60&chain=ethereum
GET /api/check?agent=0                      # by agent id
GET /badge/0x28c6c06298d514db089934071355e5743bf21d60.svg?chain=ethereum`}</pre>
      <p className="mt-2 text-ink-2">Both answer from the canonical contract at request time (cached 30–60 s). The JSON carries standing and its reasons, the mandate version, the track record and the last final rulings.</p>

      <H id="consumer">For other contracts</H>
      <p className="mt-2 text-ink-2">
        <Link className="text-signal hover:underline" href="/consumer">SentinelConsumer</Link> reads the register by cross-contract view: <span className="mono">is_in_good_standing(chain, wallet)</span>, and a demo gate that refuses to act for an agent that is not in good standing, or for anyone but its operator.
      </p>

      <H id="limits">Known limitations</H>
      <p className="mt-2 text-ink-2">The full list, with measurements, is in the <a className="text-signal hover:underline" href={`${REPO}#known-limitations`}>README</a>. The ones a visitor meets first: Studio Dev queues value transfers and does not deliver them, so a claim zeroes the balance and posts the transfer without the GEN arriving; four of the five explorers block this server, so the patrol lists Ethereum only; and registering does not prove control of the wallet.</p>
    </div>
  );
}
