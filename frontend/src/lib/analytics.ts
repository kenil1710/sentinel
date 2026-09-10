/**
 * Turning the contract's list views into the series the analytics page draws.
 *
 * Three rules run through this file:
 *
 * 1. EVERY AMOUNT IS A WEI STRING and is summed as a bigint. A running total of
 *    bounties built with `+` on Number(wei) is wrong above 2^53, and a chart is
 *    not an excuse to be wrong — the float is derived once, at the last step,
 *    for the pixel position only, and the exact wei stays on the point for the
 *    table view.
 *
 * 2. BUCKET WIDTH IS CHOSEN FROM THE DATA, NOT FIXED. Sentinel's register can be
 *    minutes old or months old; a hardcoded daily bucket draws one bar in the
 *    first case and a thousand in the second. The ladder below picks the widest
 *    step that still leaves roughly ten points.
 *
 * 3. A SERIES WITH TOO FEW POINTS IS NOT A CHART. `MIN_CHART_POINTS` is the gate;
 *    below it the page shows the aggregate figures instead, because a two-point
 *    line invites the reader to see a trend that was never measured.
 */
import type { AgentSummary, Challenge, Chain, Verdict } from "@/types";

/** The contract's chain order. Series colours are keyed to it and never to rank. */
/* Charted chains. Robinhood is omitted for the reason in agents/page.tsx: it
 * cannot be scanned, so a series for it would be a flat line labelled as
 * coverage. Its colour stays in CHAIN_SERIES for any historical record that
 * still names it. */
export const CHAIN_ORDER: readonly Chain[] = ["ethereum", "base", "arbitrum", "polygon"];

/**
 * Chart colours for the five chains — deliberately NOT the `ChainTag` colours.
 *
 * Those are all cool blues and violets: legible as small text badges, but
 * as adjacent arcs they collapse into one another (worst pair ΔE 0.3 under
 * deuteranopia, 7.7 with full colour vision). This set was searched against the
 * app's own panel colour and clears every gate: worst pair ΔE 11.1 under
 * deuteranopia, 17.3 with full colour vision, all four inside the dark
 * lightness band. Polygon's step sits at 2.7:1 against the panel rather than
 * 3:1, which is why the donut ships visible labels and a table view rather than
 * leaving the reader to decode a colour.
 *
 * Robinhood is the exception to "not the ChainTag colour": it is the same
 * purple the badge uses, so one chain is not two different colours in two
 * places. That costs something measurable and it is worth stating plainly.
 *
 * It is ΔE 13.0 from ethereum with full colour vision and 10.2 under
 * deuteranopia, which makes ethereum/robinhood the new worst pair and puts it
 * under the 17.3 / 11.1 this set was originally searched to. A search over the
 * violet band found NO purple that clears that gate: the corridor is closed on
 * one side by ethereum's indigo and on the other by polygon's violet, and the
 * nearest colours that do clear it are teals about ΔE 30 away — which would
 * make Robinhood purple on its badge and teal in this donut, a worse thing for
 * a reader than a tight ΔE.
 *
 * Two reasons that trade is the right way round. Colour is already not the sole
 * channel here — the donut ships visible labels and a table view, for exactly
 * the reason recorded above about polygon's contrast step. And the entry it
 * replaces was worse: Robinhood's brand green sat ΔE 5.5 from the amber
 * INCONCLUSIVE and 8.8 from the red VIOLATION under deuteranopia, borrowing the
 * meaning of a verdict. Purple's closest approach to any reserved hue is 18.8.
 */
export const CHAIN_SERIES: Record<string, string> = {
  ethereum: "#4D4FD5",
  base: "#2A9BCB",
  arbitrum: "#E24484",
  polygon: "#952795",
  robinhood: "#9945FF",
};

export const SERIES = {
  violation: "var(--color-violation)",
  bounty: "var(--color-compliant)",
  registered: "var(--color-signal)",
} as const;

/** Below this a series is reported as figures, not drawn as a line. */
export const MIN_CHART_POINTS = 3;

/**
 * Bucket widths, in seconds, from one minute to one month.
 *
 * The rungs between a day and a week are the ones that matter: without them a
 * three-week-old register jumps straight from twenty daily points to three
 * weekly ones, which is a chart of almost nothing.
 */
const LADDER = [
  60, 300, 900, 3_600, 21_600, 43_200, 86_400,
  172_800, 259_200, 604_800, 1_209_600, 2_592_000,
];

/** Roughly how many points a series should land on before the step widens. */
const TARGET_POINTS = 24;

/** More than this and the x-axis is a smear, so the step widens instead. */
const MAX_BUCKETS = 48;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** The widest ladder step that still leaves about `target` points across `span`. */
export function chooseBucket(spanSeconds: number, target = TARGET_POINTS): number {
  const span = Math.max(1, Math.floor(spanSeconds));
  let step = LADDER[LADDER.length - 1];
  for (const candidate of LADDER) {
    if (span / candidate <= target) {
      step = candidate;
      break;
    }
  }
  while (span / step > MAX_BUCKETS) step *= 2;
  return step;
}

/**
 * A bucket's tick label. Resolution follows the bucket: showing a date on
 * one-minute buckets, or a clock time on monthly ones, reads as noise.
 */
export function bucketLabel(epochSeconds: number, bucket: number): string {
  const d = new Date(epochSeconds * 1000);
  if (bucket < 3_600) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (bucket < 86_400) {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
  }
  if (bucket < 2_592_000) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/**
 * Wei → a plain number, by integer division rather than `Number(wei) / 1e18`.
 * Only ever used for a pixel position; the exact string travels alongside it.
 */
export function genNumber(wei: string | bigint | undefined, places = 6): number {
  if (wei === undefined || wei === null) return 0;
  let v: bigint;
  try {
    v = typeof wei === "bigint" ? wei : BigInt(String(wei).trim() || "0");
  } catch {
    return 0;
  }
  if (v < 0n) v = -v;
  const scale = 10n ** BigInt(18 - places);
  return Number(v / scale) / 10 ** places;
}

export interface CountPoint {
  /** Bucket start, epoch seconds. */
  t: number;
  label: string;
  /** Events that fell in this bucket. */
  value: number;
  /** Events up to and including this bucket. */
  total: number;
}

export interface Series<P> {
  points: P[];
  bucket: number;
  /** True when there are enough buckets to draw an honest line. */
  drawable: boolean;
}

function frame(times: number[], target: number): { bucket: number; start: number; count: number } | null {
  const ts = times.filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
  if (ts.length === 0) return null;
  const bucket = chooseBucket(ts[ts.length - 1] - ts[0], target);
  const start = Math.floor(ts[0] / bucket) * bucket;
  const end = Math.floor(ts[ts.length - 1] / bucket) * bucket;
  return { bucket, start, count: (end - start) / bucket + 1 };
}

/** Counts per bucket plus a running total. Empty buckets are kept, not skipped. */
export function countSeries(times: number[], target = TARGET_POINTS): Series<CountPoint> {
  const shape = frame(times, target);
  if (!shape) return { points: [], bucket: LADDER[0], drawable: false };
  const { bucket, start, count } = shape;

  const bins = new Array<number>(count).fill(0);
  for (const t of times) {
    if (!Number.isFinite(t) || t <= 0) continue;
    const i = Math.floor((Math.floor(t / bucket) * bucket - start) / bucket);
    if (i >= 0 && i < count) bins[i] += 1;
  }

  let running = 0;
  const points = bins.map((value, i) => {
    running += value;
    const t = start + i * bucket;
    return { t, label: bucketLabel(t, bucket), value, total: running };
  });
  return { points, bucket, drawable: points.length >= MIN_CHART_POINTS };
}

export interface WeiPoint extends CountPoint {
  /** Exact wei that landed in this bucket, and the exact running total. */
  wei: string;
  totalWei: string;
}

/** The same shape for amounts. Sums are bigint; the floats are for pixels only. */
export function weiSeries(events: { at: number; wei: string }[], target = TARGET_POINTS): Series<WeiPoint> {
  const shape = frame(events.map((e) => e.at), target);
  if (!shape) return { points: [], bucket: LADDER[0], drawable: false };
  const { bucket, start, count } = shape;

  const bins = new Array<bigint>(count).fill(0n);
  for (const e of events) {
    if (!Number.isFinite(e.at) || e.at <= 0) continue;
    const i = Math.floor((Math.floor(e.at / bucket) * bucket - start) / bucket);
    if (i < 0 || i >= count) continue;
    try {
      bins[i] += BigInt(String(e.wei).trim() || "0");
    } catch {
      // A malformed amount contributes nothing rather than poisoning the total.
    }
  }

  let running = 0n;
  const points = bins.map((wei, i) => {
    running += wei;
    const t = start + i * bucket;
    return {
      t,
      label: bucketLabel(t, bucket),
      value: genNumber(wei),
      total: genNumber(running),
      wei: wei.toString(),
      totalWei: running.toString(),
    };
  });
  return { points, bucket, drawable: points.length >= MIN_CHART_POINTS };
}

export interface ChainSlice {
  chain: string;
  count: number;
  /** Percent of the whole, 0–100. */
  share: number;
  colour: string;
}

/**
 * Counts by chain in the contract's fixed chain order, so a chain's colour
 * never moves when another chain's count changes.
 */
export function byChain(rows: { chain: string }[]): ChainSlice[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.chain, (counts.get(row.chain) ?? 0) + 1);
  const total = rows.length || 1;
  const known = CHAIN_ORDER.map((chain) => ({
    chain: chain as string,
    count: counts.get(chain) ?? 0,
    share: ((counts.get(chain) ?? 0) * 100) / total,
    colour: CHAIN_SERIES[chain],
  }));
  // A chain the contract does not list should still be visible if it appears.
  for (const [chain, count] of counts) {
    if (!CHAIN_ORDER.includes(chain as Chain)) {
      known.push({ chain, count, share: (count * 100) / total, colour: "var(--color-ink-3)" });
    }
  }
  return known;
}

export interface MandateRow {
  agent_id: number;
  name: string;
  chain: string;
  /** The full published rule when the agent's history was read, else the preview. */
  mandate: string;
  violations: number;
  decided: number;
  lastViolationAt: number;
  /** The validators' own words on the most recent upheld challenge. */
  lastReasoning: string;
}

/**
 * The mandates that have actually been broken, worst first.
 *
 * `histories` is optional: the summary views carry only a truncated mandate, so
 * the page fetches `get_agent_history` for the handful of agents that have a
 * violation and passes the full rule text in here.
 */
export function topViolatedMandates(
  agents: AgentSummary[],
  histories: Record<number, { mandate: string; challenges: Challenge[] }> = {},
  limit = 6,
): MandateRow[] {
  return agents
    .filter((a) => a.violation_count > 0)
    .sort((a, b) => b.violation_count - a.violation_count || b.challenge_count - a.challenge_count)
    .slice(0, limit)
    .map((a) => {
      const history = histories[a.agent_id];
      const upheld = (history?.challenges ?? [])
        .filter((c) => c.verdict === "VIOLATION")
        .sort((x, y) => y.settled_at - x.settled_at);
      return {
        agent_id: a.agent_id,
        name: a.name?.trim() || `Agent #${a.agent_id}`,
        chain: a.chain,
        mandate: history?.mandate?.trim() || a.mandate_preview || "",
        violations: a.violation_count,
        decided: a.decided_count,
        lastViolationAt: upheld[0]?.settled_at ?? 0,
        lastReasoning: upheld[0]?.reasoning ?? "",
      };
    });
}

export type ActivityKind = "registered" | "filed" | "settled" | "checked";

export interface ActivityEvent {
  id: string;
  at: number;
  kind: ActivityKind;
  title: string;
  detail: string;
  href?: string;
  verdict?: Verdict;
}

/**
 * One ordered record of everything the register has done: registrations, filings,
 * judgements, and the patrol's own check stamps.
 *
 * The check stamps are the reason this is a timeline rather than a count. The
 * contract keeps only the LAST check per agent, so `patrols_run` says how often
 * the bot walked and `last_checked` says who it reached — neither alone tells
 * you whether anybody is watching right now.
 */
export function activityTimeline(
  agents: AgentSummary[],
  challenges: Challenge[],
  limit = 14,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const a of agents) {
    if (a.registered_at > 0) {
      events.push({
        id: `reg-${a.agent_id}`,
        at: a.registered_at,
        kind: "registered",
        title: a.name?.trim() || `Agent #${a.agent_id}`,
        detail: "registered and bonded",
        href: `/agent/${a.agent_id}`,
      });
    }
    if (a.last_checked > 0) {
      events.push({
        id: `chk-${a.agent_id}`,
        at: a.last_checked,
        kind: "checked",
        title: a.name?.trim() || `Agent #${a.agent_id}`,
        detail: "examined by the patrol",
        href: `/agent/${a.agent_id}`,
      });
    }
  }

  for (const c of challenges) {
    if (c.filed_at > 0) {
      events.push({
        id: `fil-${c.challenge_id}`,
        at: c.filed_at,
        kind: "filed",
        title: `Challenge #${c.challenge_id}`,
        detail: `filed against agent #${c.agent_id}`,
        href: `/challenge/${c.challenge_id}`,
      });
    }
    if (c.settled_at > 0) {
      events.push({
        id: `set-${c.challenge_id}`,
        at: c.settled_at,
        kind: "settled",
        title: `Challenge #${c.challenge_id}`,
        detail: "judged by the validators",
        href: `/challenge/${c.challenge_id}`,
        verdict: c.verdict,
      });
    }
  }

  return events.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Sum a column of wei strings without ever leaving integer arithmetic. */
export function sumWei(values: (string | undefined)[]): string {
  let total = 0n;
  for (const v of values) {
    try {
      total += BigInt(String(v ?? "0").trim() || "0");
    } catch {
      // Skip anything that is not an integer rather than corrupt the total.
    }
  }
  return total.toString();
}
