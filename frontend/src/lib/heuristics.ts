/**
 * What the patrol bot can check by itself, read from clause TEXT.
 *
 * The bot only proposes: a flag here costs it a stake if validators disagree.
 * It recognises five clause shapes and only trusts ADDRESSES - never a token
 * symbol, because a token named "USDT" at another address is the oldest spoof
 * there is. So a clause that names tokens by symbol ("Only move USDT and USDC")
 * makes the bot flag every token it sees; validators then clear the genuine
 * ones, and those clearances become precedents the bot defers to.
 *
 * A transaction that failed moved nothing, so the bot never stakes on one
 * (anyone else still may). Native amounts are compared in wei, exactly. For a
 * clause about TRADING or SWAPPING, a token the agent received counts as
 * traded; for one about SENDING, MOVING or TRANSFERRING, only what it sent.
 */
import type { Clause, Severity } from "@/types";
import type { TxRow } from "./blockscout";

export type Rule = "only-call" | "never-call" | "only-tokens" | "max-native" | "no-native";
export interface Flag { clause: string; severity: Severity; rule: Rule; reason: string; precedentEligible: boolean }

const RANK: Record<Severity, number> = { MINOR: 1, MAJOR: 2, CRITICAL: 3 };
const addrs = (t: string) => [...new Set((t.toLowerCase().match(/0x[0-9a-f]{40}/g) ?? []))];
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;
const TOKEN_WORDS = /\b(token|tokens|stablecoin|stablecoins|usdt|usdc|weth|dai|eth|wbtc|pol|matic)\b/;

/** "0.5" -> 500000000000000000n; null when it is not a plain decimal. */
export function decimalToWei(text: string): bigint | null {
  const s = text.split(",").join("");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 18) return null;
  return BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

export function clauseRules(text: string): Rule[] {
  const t = text.toLowerCase();
  const out: Rule[] = [];
  if (/\bonly call\b/.test(t) && addrs(t).length) out.push("only-call");
  if (/\bnever (call|interact with)\b/.test(t) && addrs(t).length) out.push("never-call");
  if (/\bonly (send|move|trade|swap|transfer)\b/.test(t) && TOKEN_WORDS.test(t) && !/\bonly call\b/.test(t)) out.push("only-tokens");
  if (/never send more than [\d.,]+ (eth|pol|matic)\b/.test(t)) out.push("max-native");
  if (/never send native\b/.test(t)) out.push("no-native");
  return out;
}

/** Flags on one transaction. `needsTransfers` when a token rule applies but the row has no transfer list yet. */
export function flagsFor(row: TxRow, wallet: string, clauses: Clause[]): { flags: Flag[]; needsTransfers: boolean } {
  const w = wallet.toLowerCase();
  const flags: Flag[] = [];
  let needsTransfers = false;
  if (row.status && row.status !== "ok") return { flags, needsTransfers };
  const sent = row.from === w;
  for (const c of clauses) {
    const listed = addrs(c.text);
    for (const rule of clauseRules(c.text)) {
      if (rule === "only-call" && sent && row.to && !listed.includes(row.to)) {
        flags.push({ clause: c.id, severity: c.severity, rule, precedentEligible: true,
          reason: `Called ${short(row.to)}, which ${c.id} does not list among the contracts the agent may call.` });
      }
      if (rule === "never-call" && sent && listed.includes(row.to)) {
        flags.push({ clause: c.id, severity: c.severity, rule, precedentEligible: true,
          reason: `Called ${short(row.to)}, which ${c.id} forbids the agent to call.` });
      }
      if (rule === "max-native" && sent) {
        const m = c.text.toLowerCase().match(/never send more than ([\d.,]+?)[.,]? (eth|pol|matic)\b/);
        const limitWei = m ? decimalToWei(m[1]) : null;
        let valueWei = 0n;
        try { valueWei = BigInt(row.value || "0"); } catch { valueWei = 0n; }
        const v = Number(valueWei) / 1e18;
        const limit = m ? m[1] : "";
        if (limitWei !== null && valueWei > limitWei) {
          flags.push({ clause: c.id, severity: c.severity, rule, precedentEligible: false,
            reason: `Sent ${v.toLocaleString("en-US", { maximumFractionDigits: 6 })} native units in one transaction; ${c.id} caps it at ${limit}.` });
        }
      }
      let native = 0n;
      try { native = BigInt(row.value || "0"); } catch { native = 0n; }
      if (rule === "no-native" && sent && native > 0n) {
        flags.push({ clause: c.id, severity: c.severity, rule, precedentEligible: false,
          reason: `Sent native value (${Number(native) / 1e18}) although ${c.id} forbids sending any.` });
      }
      if (rule === "only-tokens") {
        if (row.transfers === null) { needsTransfers = true; continue; }
        const trades = /\bonly (trade|swap)\b/.test(c.text.toLowerCase());
        const moved = row.transfers.filter((t) => t.from === w || (trades && t.to === w)).map((t) => t.token);
        const strangers = [...new Set(moved.filter((tok) => tok && !listed.includes(tok)))];
        if (strangers.length) {
          flags.push({ clause: c.id, severity: c.severity, rule, precedentEligible: true,
            reason: listed.length
              ? `${trades ? "Traded" : "Sent"} token ${short(strangers[0])}, which ${c.id} does not list by address.`
              : `${trades ? "Traded" : "Sent"} token ${short(strangers[0])}; ${c.id} names tokens by symbol only, so validators must confirm it is one of them.` });
        }
      }
    }
  }
  flags.sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.clause.localeCompare(b.clause));
  return { flags, needsTransfers };
}
