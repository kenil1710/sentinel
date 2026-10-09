"use client";

import Link from "next/link";
import useSWR from "swr";
import { HeroVisual } from "@/components/HeroVisual";
import { Panel, Label } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { IconName } from "@/components/icons";
import { getCanonicalStats } from "@/lib/contract";
import { formatGen } from "@/lib/format";

const STEPS: { n: string; title: string; icon: IconName; body: string }[] = [
  {
    n: "01", title: "Register", icon: "step_register",
    body: "An operator publishes the agent's wallet, its chain and a mandate of numbered clauses, each with a severity, and posts a bond. Validators lint it: clauses that cannot be judged from on-chain data are marked and can never be slashed.",
  },
  {
    n: "02", title: "Challenge", icon: "step_challenge",
    body: "Anyone but the operator names one transaction and one clause, and stakes. The mandate version in force when that transaction was mined is snapshotted with every parameter the ruling will use.",
  },
  {
    n: "03", title: "Judge, then appeal", icon: "step_judge",
    body: "Validators each fetch the transaction and must agree. The ruling is provisional: the party it went against may appeal once with a bond and new evidence, and a fresh panel decides.",
  },
  {
    n: "04", title: "Final", icon: "accountable",
    body: "After the window anyone makes it final. Code computes the slash from the clause's severity and the repeat multiplier; every payout is a pull balance. Final clearances teach the patrol bot what to stop accusing.",
  },
];

const WHY: { title: string; icon: IconName; body: string }[] = [
  {
    title: "Fair to the accused", icon: "trustless",
    body: "A ruling is provisional for an hour and the operator can appeal it with new evidence. Edits to a mandate wait an hour and never reach back. A clause the validators say cannot be judged from on-chain data can never be slashed.",
  },
  {
    title: "Open to anyone", icon: "autonomous",
    body: "Any wallet can challenge with a stake, not just the patrol bot. A challenger who proves a breach gets their stake back and half the slash; one who is wrong pays the operator. The same transaction cannot be argued twice.",
  },
  {
    title: "Checkable", icon: "accountable",
    body: "Every number on this site is a contract read. The contract recomputes its own ledger and each track record from the records and says whether they match. The code on chain is byte-identical to the repository.",
  },
];

export default function Home() {
  /*
   * The ONLY live figure on this page, and it is here because the alternative
   * is worse: a hardcoded "7 violations" would be a marketing claim that
   * quietly goes stale, on a page whose whole argument is that the numbers are
   * checkable. Two counters, rendered as a sentence rather than a stat grid —
   * the grid belongs on /patrol and /analytics, where someone has come to read
   * instruments.
   */
  const { data: stats } = useSWR("landing-proof", getCanonicalStats, { refreshInterval: 60_000 });
  const n = (v: number | undefined) => (stats ? String(v ?? 0) : "—");

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rise">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-ink-2 shadow-[var(--shadow-card)]">
              <span className="size-1.5 rounded-full bg-signal-bright live-dot" />
              Live on GenLayer
            </div>

            <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              Who watches your
              <br />
              <span className="text-signal">AI agents?</span>
            </h1>

            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-ink-2">
              Autonomous agents move real money under rules nobody enforces. Sentinel
              makes those rules cost something: an operator publishes numbered clauses
              with a severity each and bonds them; anyone can challenge a transaction;{" "}
              <span className="font-medium text-ink">GenLayer validators judge it</span>{" "}
              against the mandate version in force when it was mined. Rulings can be
              appealed once, then they are final, and code computes the slash.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-signal px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">
                <Icon name="patrol" size={16} />
                Register an agent
              </Link>
              <Link href="/agents"
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-5 py-2.5 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-colors hover:border-line-2">
                <Icon name="evidence" size={16} />
                See the evidence
              </Link>
            </div>
          </div>

          <div className="rise" style={{ animationDelay: "120ms" }}>
            <HeroVisual />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20" aria-labelledby="live-h">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel p-7 shadow-[var(--shadow-card-lifted)] sm:p-9">
          <div className="flex flex-wrap items-baseline gap-3">
            <Label>The canonical register, read from the contract just now</Label>
            <Link href="/analytics" className="ml-auto text-sm text-signal hover:underline">All figures →</Link>
          </div>
          <h2 id="live-h" className="sr-only">Live figures</h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ["Agents registered", n(stats?.agents_registered), "text-ink"],
              ["Challenges filed", n(stats?.challenges_filed), "text-ink"],
              ["Open now", n(stats?.challenges_open), "text-signal"],
              ["Final breaches", n(stats?.final.BREACH), "text-violation-ink"],
              ["Final compliant", n(stats?.final.COMPLIANT), "text-compliant-ink"],
              ["Final inconclusive", n(stats?.final.INCONCLUSIVE), "text-neutral-ink"],
              ["Appeals filed", n(stats?.appeals.filed), "text-ink"],
              ["Appeals upheld", n(stats?.appeals.upheld), "text-ink"],
              ["Precedents", n(stats?.precedents), "text-ink"],
              ["GEN slashed", stats ? formatGen(stats.total_slashed, 4) : "—", "text-violation-ink"],
              ["GEN in bounties", stats ? formatGen(stats.total_bounties, 4) : "—", "text-ink"],
              ["Patrol runs", n(stats?.patrols_run), "text-ink"],
            ] as const).map(([label, value, tone]) => (
              <div key={label}>
                <dt className="text-xs text-ink-2">{label}</dt>
                <dd className={`mono mt-1 text-2xl font-semibold tabular-nums ${tone}`} data-stat={label}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Label>How it works</Label>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Four steps, and no administrator anywhere in them
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Panel key={s.n} className="p-5 rise">
              <div className="flex items-center gap-2 text-signal">
                <Icon name={s.icon} size={18} />
                <span className="mono text-xs font-semibold">{s.n}</span>
              </div>
              <div className="mt-2.5 text-[15px] font-medium">{s.title}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              {i < STEPS.length - 1 && (
                <div className="mt-4 hidden h-px bg-gradient-to-r from-signal/40 to-transparent lg:block" />
              )}
            </Panel>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Label>Why Sentinel</Label>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Three properties, and none of them require trusting us
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {WHY.map((w) => (
            <Panel key={w.title} className="p-6">
              <div className="flex items-center gap-2.5">
                <Icon name={w.icon} size={20} className="text-signal" />
                <span className="text-[17px] font-semibold tracking-tight">{w.title}</span>
              </div>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-2">{w.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Panel className="overflow-hidden">
          <div className="grid gap-8 p-7 md:grid-cols-2 md:p-9">
            <div>
              <Label>The hard part</Label>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">
                Validators must agree about a document that never stops moving
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                A Blockscout transaction changes between two fetches seconds apart: confirmations, exchange rates and token supplies all move,
                and labels can be edited at any time. So validators compare only the verdict, the clause, and a digest of the facts a chain cannot
                change: sender, recipient, value, selector, token transfers, block and time.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                If they disagree, nothing is written and the challenge waits for another panel. An appeal must read the same immutable facts
                as the first ruling, or it waits too.
              </p>
              <Link href="/docs" className="mt-5 inline-block text-sm font-medium text-signal hover:underline">
                How it works →
              </Link>
            </div>
            <div className="mono overflow-x-auto rounded-lg border border-line bg-panel-2 p-5 text-[12px] leading-relaxed">
              <div className="text-ink-3"># the same transaction, fetched twice</div>
              <div className="mt-2 text-violation-ink">- confirmations: 1 → 3</div>
              <div className="text-violation-ink">- exchange_rate: 2410.49 → 2412.93</div>
              <div className="text-violation-ink">- token.total_supply: …716 → …608</div>
              <div className="mt-3 text-ink-3"># what validators compare</div>
              <div className="mt-2 text-compliant-ink">+ BREACH|C1|c94ffd7f…|call:0xee7a…:0x34fcd5be…</div>
              <div className="text-compliant-ink">+ BREACH|C1|c94ffd7f…|call:0xee7a…:0x34fcd5be…</div>
              <div className="mt-3 text-ink-3"># verdict | clause (BREACH only) | digest of immutable facts | kind</div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-28">
        <div className="rounded-2xl border border-line bg-panel px-7 py-12 text-center shadow-[var(--shadow-card-lifted)] sm:px-10">
          <h2 className="text-[26px] font-semibold tracking-tight sm:text-3xl">
            Put a bond behind what your agent promises
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2">
            Publishing a mandate takes one transaction. After that the register is
            public, the patrol is automatic, and anyone who thinks your agent broke
            its word can say so on chain and stake money on being right.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-signal px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90">
              <Icon name="patrol" size={16} />
              Register an agent
            </Link>
            <Link href="/agents"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-ground px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-signal/40">
              <Icon name="evidence" size={16} />
              See the evidence
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
