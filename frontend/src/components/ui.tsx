import type { ReactNode } from "react";
import { CHAIN_LABEL } from "@/lib/format";
import type { Verdict } from "@/types";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-panel shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.16em] text-ink-3 font-medium">{children}</div>
  );
}

/**
 * A verdict badge. The three colours are used ONLY here and on the score ring,
 * so a red anywhere in this app means exactly one thing.
 */
export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict | "PENDING"; size?: "sm" | "md" }) {
  const map: Record<string, { bg: string; text: string; ring: string; label: string }> = {
    VIOLATION: { bg: "bg-violation/10", text: "text-violation-ink", ring: "ring-violation/30", label: "Violation" },
    COMPLIANT: { bg: "bg-compliant/10", text: "text-compliant-ink", ring: "ring-compliant/30", label: "Compliant" },
    INCONCLUSIVE: { bg: "bg-neutral/10", text: "text-neutral-ink", ring: "ring-neutral/30", label: "Inconclusive" },
    PENDING: { bg: "bg-signal/10", text: "text-signal", ring: "ring-signal/30", label: "Awaiting judgement" },
    "": { bg: "bg-panel-2", text: "text-ink-3", ring: "ring-line", label: "—" },
  };
  const s = map[verdict] ?? map[""];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md ring-1 font-medium ${pad} ${s.bg} ${s.text} ${s.ring}`}>
      {verdict === "PENDING" && <span className="size-1.5 rounded-full bg-signal-bright live-dot" />}
      {s.label}
    </span>
  );
}

export function ChainTag({ chain, className = "" }: { chain: string; className?: string }) {
  const tone: Record<string, string> = {
    ethereum: "text-[#4338CA] bg-[#4338CA]/8 ring-[#4338CA]/20",
    base: "text-[#1D4ED8] bg-[#1D4ED8]/8 ring-[#1D4ED8]/20",
    arbitrum: "text-[#0369A1] bg-[#0369A1]/8 ring-[#0369A1]/20",
    polygon: "text-[#7E22CE] bg-[#7E22CE]/8 ring-[#7E22CE]/20",
    // Purple rather than Robinhood's brand green, and deliberately so: green
    // means COMPLIANT everywhere else in this app, and a green badge on a watch
    // console reads as "cleared" whatever it is actually labelling.
    //
    // Measured, because purple is a crowded corner here - Polygon is already
    // violet. Its nearest neighbour in this set is Polygon at ΔE2000 17.8 with
    // full colour vision and 16.4 under deuteranopia, which is far clearer than
    // the pair this set already shipped (ethereum/polygon, 0.2 under
    // deuteranopia). Against the panel it is 3.9:1, and its closest approach to
    // any reserved hue is 38.8 - where the green it replaced was 5.5 from the
    // amber INCONCLUSIVE and 8.8 from the red VIOLATION under deuteranopia.
    robinhood: "text-[#A21CAF] bg-[#A21CAF]/8 ring-[#A21CAF]/20",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${tone[chain] ?? "text-ink-2 bg-panel-2 ring-line"} ${className}`}>
      {CHAIN_LABEL[chain] ?? chain}
    </span>
  );
}

/**
 * What an agent DOES. Deliberately monochrome: the three verdict colours mean
 * exactly one thing each in this app, and a type badge is not a judgement.
 */
export function TypeTag({ type, className = "" }: { type: string; className?: string }) {
  const label: Record<string, string> = {
    TRADING: "Trading", DEFI: "DeFi", SHOPPING: "Shopping",
    CONTENT: "Content", CUSTOM: "Custom",
  };
  return (
    <span className={`inline-flex items-center rounded-md bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 ring-1 ring-line-2 ${className}`}>
      {label[type] ?? "Custom"}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  const tone: Record<string, string> = {
    ACTIVE: "text-compliant-ink bg-compliant/8 ring-compliant/25",
    WITHDRAWN: "text-ink-3 bg-panel-2 ring-line",
    SLASHED_OUT: "text-violation-ink bg-violation/8 ring-violation/25",
  };
  const label: Record<string, string> = {
    // "Bond exhausted" named the symptom and hid the cause — it reads equally
    // like "something broke" and like "this one was caught". It was the latter,
    // every time: the only route to this status is a proven violation.
    ACTIVE: "On duty", WITHDRAWN: "Retired", SLASHED_OUT: "Caught — deactivated",
  };
  const why: Record<string, string> = {
    ACTIVE: "Bonded above the minimum and open to challenge.",
    WITHDRAWN: "The operator withdrew the bond. The record stays readable; it cannot be challenged.",
    SLASHED_OUT: "Validators upheld a challenge against this agent. The slash carried its bond "
      + "below the minimum, so the contract deactivated it automatically. A top-up reactivates it.",
  };
  return (
    <span title={why[status] ?? status}
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${tone[status] ?? "text-ink-3 bg-panel-2 ring-line"}`}>
      {label[status] ?? status}
    </span>
  );
}

/** Compliance as a ring. Colour follows the same three-colour rule. */
export function ScoreRing({ bps, decided, size = 56 }: { bps: number; decided: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(bps / 100)));
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const untested = decided === 0;
  const colour = untested ? "var(--color-ink-3)"
    : pct >= 80 ? "var(--color-compliant)"
    : pct >= 40 ? "var(--color-neutral)"
    : "var(--color-violation)";
  // The ring is a fill and reads at these hues; the percentage inside it is
  // small text on near-white and does not.
  const inkColour = untested ? "var(--color-ink-3)"
    : pct >= 80 ? "var(--color-compliant-ink)"
    : pct >= 40 ? "var(--color-neutral-ink)"
    : "var(--color-violation-ink)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}
      title={untested ? "No challenge has been decided yet" : `${pct}% of ${decided} decided challenges found it compliant`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line-2)" strokeWidth="4" fill="none" />
        {!untested && (
          <circle cx={size / 2} cy={size / 2} r={r} stroke={colour} strokeWidth="4" fill="none"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="mono text-xs font-semibold" style={{ color: inkColour }}>
          {untested ? "—" : `${pct}`}
        </span>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "ink" }:
  { label: string; value: ReactNode; sub?: string; tone?: "ink" | "signal" | "violation" | "compliant" }) {
  const colour = { ink: "text-ink", signal: "text-signal", violation: "text-violation-ink", compliant: "text-compliant-ink" }[tone];
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3.5 shadow-[var(--shadow-card)]">
      <Label>{label}</Label>
      <div className={`mono mt-1.5 text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-2 px-6 py-14 text-center">
      <div className="text-sm text-ink-2">{title}</div>
      {hint && <div className="mt-1.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-3">
      <span className="size-3.5 rounded-full border-2 border-line-2 border-t-signal animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}
