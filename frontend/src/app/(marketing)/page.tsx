"use client";

import Link from "next/link";
import useSWR from "swr";
import { HeroVisual } from "@/components/HeroVisual";
import { Panel, Stat, Label } from "@/components/ui";
import { getStats, getConfig } from "@/lib/contract";
import { formatGen, percentFromBps } from "@/lib/format";

const STEPS = [
  {
    n: "01", title: "Register",
    body: "An operator publishes their agent's wallet, its chain and a plain-English mandate on chain, and posts a bond that answers for the agent's conduct.",
  },
  {
    n: "02", title: "Patrol",
    body: "Sentinel walks the register on a schedule, pulls each agent's recent transactions from Blockscout, and looks for ones that visibly contradict a rule it can check. Nobody points it at a transaction.",
  },
  {
    n: "03", title: "Challenge",
    body: "A suspicious transaction becomes an on-chain challenge naming that exact hash. The accuser stakes GEN on being right — the bot included.",
  },
  {
    n: "04", title: "Judge",
    body: "Five GenLayer validators each fetch the transaction themselves, read it against the mandate, and agree on one verdict. A breach slashes the bond; a false accusation costs the accuser their stake.",
  },
];

export default function Home() {
  const { data: stats } = useSWR("stats", getStats, { refreshInterval: 20_000 });
  const { data: cfg } = useSWR("config", getConfig);

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rise">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-ink-2">
              <span className="size-1.5 rounded-full bg-signal live-dot" />
              Live on GenLayer · four chains watched
            </div>

            <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              Who watches your
              <br />
              <span className="text-signal">AI agents?</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-2">
              Autonomous agents are trading real money against rules nobody enforces.
              Sentinel is an autonomous agent that polices other autonomous agents:
              operators publish a mandate and post a bond, Sentinel patrols public
              chains for breaches, and{" "}
              <span className="text-ink">GenLayer validators judge every case</span> —
              reading the mandate as prose against the transaction record.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register"
                className="rounded-lg bg-signal px-5 py-2.5 text-sm font-medium text-ground transition-opacity hover:opacity-90">
                Register an agent
              </Link>
              <Link href="/patrol"
                className="rounded-lg border border-line bg-panel px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-2">
                Start patrolling
              </Link>
            </div>

            {cfg && (
              <div className="mono mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-3">
                <span>bond ≥ {cfg.min_bond_text} GEN</span>
                <span>challenge stake {cfg.challenge_stake_text} GEN</span>
                <span>penalty {percentFromBps(cfg.penalty_bps)}% of bond</span>
              </div>
            )}
          </div>

          <div className="rise" style={{ animationDelay: "120ms" }}>
            <HeroVisual />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Agents under watch" value={stats?.agents_active ?? "—"}
            sub={stats ? `${stats.agents_registered} registered in total` : undefined} tone="signal" />
          <Stat label="Bond at risk" value={stats ? `${formatGen(stats.bond_under_watch, 2)}` : "—"}
            sub="GEN answering for conduct" />
          <Stat label="Challenges judged" value={stats?.challenges_settled ?? "—"}
            sub={stats ? `${stats.challenges_filed} filed` : undefined} />
          <Stat label="Breaches proven" value={stats?.violations ?? "—"}
            sub={stats ? `${formatGen(stats.bounties_paid, 3)} GEN in bounties` : undefined}
            tone={stats && stats.violations > 0 ? "violation" : "ink"} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Label>How it works</Label>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Four steps, and no administrator anywhere in them
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Panel key={s.n} className="p-5 rise" >
              <div className="mono text-xs text-signal">{s.n}</div>
              <div className="mt-2.5 text-[15px] font-medium">{s.title}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              {i < STEPS.length - 1 && (
                <div className="mt-4 hidden h-px bg-gradient-to-r from-signal/40 to-transparent lg:block" />
              )}
            </Panel>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
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
                So Sentinel compares <span className="text-ink">one string</span>: the
                verdict. Validators fetch, project the record to the fields a mandate
                can turn on, judge, and vote on the judgement alone. The evidence
                digest is recorded for auditing and is never voted on.
              </p>
              <Link href="/docs" className="mt-5 inline-block text-sm text-signal hover:underline">
                Read the measurements →
              </Link>
            </div>
            <div className="mono rounded-lg border border-line bg-ground/60 p-5 text-[12px] leading-relaxed">
              <div className="text-ink-3"># the same transaction, fetched twice</div>
              <div className="mt-2 text-violation">- confirmations: 1 → 3</div>
              <div className="text-violation">- exchange_rate: 2410.49 → 2412.93</div>
              <div className="text-violation">- token.total_supply: …716 → …608</div>
              <div className="mt-3 text-ink-3"># after projection</div>
              <div className="mt-2 text-compliant">+ digest ac21b94efc744e7a</div>
              <div className="text-compliant">+ digest ac21b94efc744e7a</div>
              <div className="mt-3 text-ink-3">
                # 1,596 bytes from 18,087 — and identical
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </>
  );
}
