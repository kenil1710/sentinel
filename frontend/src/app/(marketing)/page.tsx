"use client";

import Link from "next/link";
import useSWR from "swr";
import { HeroVisual } from "@/components/HeroVisual";
import { Panel, Label } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { IconName } from "@/components/icons";
import { getStats } from "@/lib/contract";
import { formatGen } from "@/lib/format";

const STEPS: { n: string; title: string; icon: IconName; body: string }[] = [
  {
    n: "01", title: "Register", icon: "step_register",
    body: "An operator publishes their agent's wallet, its chain and a plain-English mandate on chain, and posts a bond that answers for the agent's conduct.",
  },
  {
    n: "02", title: "Patrol", icon: "step_patrol",
    body: "Sentinel walks the register on a schedule, pulls each agent's recent transactions from Blockscout, and looks for ones that visibly contradict a rule it can check. Nobody points it at a transaction.",
  },
  {
    n: "03", title: "Challenge", icon: "step_challenge",
    body: "A suspicious transaction becomes an on-chain challenge naming that exact hash. The accuser stakes GEN on being right — the bot included.",
  },
  {
    n: "04", title: "Judge", icon: "step_judge",
    body: "Five GenLayer validators each fetch the transaction themselves, read it against the mandate, and agree on one verdict. A breach slashes the bond; a false accusation costs the accuser their stake.",
  },
];

const WHY: { title: string; icon: IconName; body: string }[] = [
  {
    title: "Autonomous", icon: "autonomous",
    body: "Nobody files the challenges. A scheduled bot walks the register, reads real transactions off public explorers, and stakes its own money on every accusation it makes. It is wrong sometimes, and it pays for that too.",
  },
  {
    title: "Trustless", icon: "trustless",
    body: "There is no admin key that decides a case, no multisig that can reverse one, and no privileged reviewer. Five validators fetch the evidence independently and agree on a verdict, or the challenge stays open.",
  },
  {
    title: "Accountable", icon: "accountable",
    body: "Every verdict carries the reasoning that produced it and a digest of the evidence it was read from. The settlement arithmetic can be recomputed from what was stored, by anyone, without trusting our summary of it.",
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
  const { data: stats } = useSWR("landing-proof", getStats, { refreshInterval: 60_000 });

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
              Autonomous agents are moving real money against rules nobody enforces.
              Sentinel makes those rules cost something: an operator publishes what
              their agent may do and posts a bond behind it, and a bot patrols public
              chains looking for transactions that contradict it. When it finds one,{" "}
              <span className="font-medium text-ink">GenLayer validators judge the case</span>{" "}
              — reading the mandate as prose against the transaction record — and the
              bond pays for the breach.
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

      {/* Social proof — one banner, one sentence, not a wall of instruments. */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-card-lifted)]">
          <div className="flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:p-9">
            <div className="min-w-0">
              <Label>Already happening</Label>
              <p className="mt-2.5 text-[19px] leading-snug tracking-tight sm:text-[22px]">
                <span className="mono font-semibold text-violation-ink">
                  {stats ? stats.violations : "—"}
                </span>{" "}
                <span className="font-medium">breaches proven on chain</span>, and{" "}
                <span className="mono font-semibold text-ink">
                  {stats ? formatGen(stats.total_slashed, 3) : "—"} GEN
                </span>{" "}
                <span className="font-medium">slashed from the agents that committed them</span>
                <span className="text-ink-2"> — every case filed by the bot, and judged by validators nobody on this team controls.</span>
              </p>
            </div>
            <Link href="/leaderboard"
              className="shrink-0 rounded-lg border border-line bg-ground px-4 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-signal/40 sm:ml-auto">
              See who caught them →
            </Link>
          </div>
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
                Two validators must agree about a document that never stops moving
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                A Blockscout transaction changes between two fetches seconds apart —
                confirmations, exchange rates, and the token&apos;s own total supply all
                move. Comparing the document would make every challenge permanently
                unsettleable, for reasons that have nothing to do with the mandate.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                So Sentinel compares <span className="font-medium text-ink">one string</span>: the
                verdict. Validators fetch, project the record to the fields a mandate
                can turn on, judge, and vote on the judgement alone. The evidence
                digest is recorded for auditing and is never voted on.
              </p>
              <Link href="/docs" className="mt-5 inline-block text-sm font-medium text-signal hover:underline">
                Read the measurements →
              </Link>
            </div>
            <div className="mono overflow-x-auto rounded-lg border border-line bg-panel-2 p-5 text-[12px] leading-relaxed">
              <div className="text-ink-3"># the same transaction, fetched twice</div>
              <div className="mt-2 text-violation-ink">- confirmations: 1 → 3</div>
              <div className="text-violation-ink">- exchange_rate: 2410.49 → 2412.93</div>
              <div className="text-violation-ink">- token.total_supply: …716 → …608</div>
              <div className="mt-3 text-ink-3"># after projection</div>
              <div className="mt-2 text-compliant-ink">+ digest ac21b94efc744e7a</div>
              <div className="text-compliant-ink">+ digest ac21b94efc744e7a</div>
              <div className="mt-3 text-ink-3">
                # 1,596 bytes from 18,087 — and identical
              </div>
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
