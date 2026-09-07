import type { ReactNode } from "react";
import { CHAIN_LABEL } from "@/lib/format";
import type { Verdict } from "@/types";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-panel/70 backdrop-blur-sm ${className}`}>
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
    VIOLATION: { bg: "bg-violation/12", text: "text-violation", ring: "ring-violation/35", label: "Violation" },
    COMPLIANT: { bg: "bg-compliant/12", text: "text-compliant", ring: "ring-compliant/35", label: "Compliant" },
    INCONCLUSIVE: { bg: "bg-neutral/12", text: "text-neutral", ring: "ring-neutral/35", label: "Inconclusive" },
    PENDING: { bg: "bg-signal/12", text: "text-signal", ring: "ring-signal/35", label: "Awaiting judgement" },
    "": { bg: "bg-panel-2", text: "text-ink-3", ring: "ring-line", label: "—" },
  };
  const s = map[verdict] ?? map[""];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md ring-1 font-medium ${pad} ${s.bg} ${s.text} ${s.ring}`}>
      {verdict === "PENDING" && <span className="size-1.5 rounded-full bg-signal live-dot" />}
      {s.label}
    </span>
  );
}

export function ChainTag({ chain, className = "" }: { chain: string; className?: string }) {
  const tone: Record<string, string> = {
    ethereum: "text-[#8CA0F0] bg-[#8CA0F0]/10 ring-[#8CA0F0]/25",
    base: "text-[#5C8DFF] bg-[#5C8DFF]/10 ring-[#5C8DFF]/25",
    arbitrum: "text-[#4FB3E8] bg-[#4FB3E8]/10 ring-[#4FB3E8]/25",
    polygon: "text-[#B98CF0] bg-[#B98CF0]/10 ring-[#B98CF0]/25",
    // Robinhood's own brand green, asked for by name. It is the one chain tag
    // that sits in a hue this app otherwise reserves: green means COMPLIANT
    // everywhere else. Measured against that verdict green it is ΔE2000 16.1
    // with full colour vision and 18.6 under deuteranopia, so the two are
    // tellable apart - but a green badge on a watch console still leans
    // "cleared", and no other chain tag carries a second meaning like that.
    robinhood: "text-[#00C805] bg-[#00C805]/10 ring-[#00C805]/25",
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
    ACTIVE: "text-compliant bg-compliant/10 ring-compliant/25",
    WITHDRAWN: "text-ink-3 bg-panel-2 ring-line",
    SLASHED_OUT: "text-violation bg-violation/10 ring-violation/25",
  };
  const label: Record<string, string> = {
    ACTIVE: "On duty", WITHDRAWN: "Retired", SLASHED_OUT: "Bond exhausted",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${tone[status] ?? "text-ink-3 bg-panel-2 ring-line"}`}>
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
        <span className="mono text-xs font-semibold" style={{ color: colour }}>
          {untested ? "—" : `${pct}`}
        </span>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "ink" }:
  { label: string; value: ReactNode; sub?: string; tone?: "ink" | "signal" | "violation" | "compliant" }) {
  const colour = { ink: "text-ink", signal: "text-signal", violation: "text-violation", compliant: "text-compliant" }[tone];
  return (
    <div className="rounded-lg border border-line bg-panel/60 px-4 py-3.5">
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
