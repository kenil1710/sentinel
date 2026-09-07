/**
 * What the patrol bot flags — and, just as importantly, what it does not.
 *
 * ## The division of labour
 *
 * The bot does NOT decide whether a mandate was broken. It cannot: a mandate is
 * plain English, and reading it is exactly the job GenLayer's validators exist
 * to do. What the bot does is far narrower and entirely mechanical — it reads a
 * mandate for the few CONSTRAINTS that can be checked with arithmetic and string
 * matching, and looks for transactions that visibly contradict one.
 *
 * A flag is therefore an ACCUSATION, never a verdict. It costs the bot its
 * challenge stake to make, and five validators then read the same mandate as
 * prose against the full transaction record and decide. The bot being crude is
 * fine; the bot being crude AND final would not be.
 *
 * ## Why it is deliberately conservative
 *
 * Every flag stakes real money that is lost if the challenge is refuted. So the
 * rules below only fire on things that are hard to be wrong about — a token
 * symbol that appears nowhere in an allow-list, a value over a stated ceiling,
 * an explorer-flagged scam address — and abstain everywhere else. An agent that
 * is quietly breaking a rule this file cannot express is caught by a human
 * filing the challenge instead, which is why the UI has a challenge button on
 * every transaction.
 */
import type { TxRow } from "./blockscout";

export interface Flag {
  tx_hash: string;
  reason: string;
  rule: string;
}

const WEI = 10n ** 18n;

/** Symbols that mean "the chain's own coin" wherever a mandate says ETH. */
const NATIVE_ALIASES: Record<string, string[]> = {
  ethereum: ["ETH", "WETH"],
  base: ["ETH", "WETH"],
  arbitrum: ["ETH", "WETH"],
  polygon: ["MATIC", "WMATIC", "POL"],
  // Robinhood Chain settles gas in ETH: /api/v2/stats reports the Ethereum
  // coin image and the live ETH price as its native unit.
  robinhood: ["ETH", "WETH"],
};

/**
 * Tokens named in a mandate.
 *
 * Run on the mandate AS WRITTEN, never on an upper-cased copy. Ticker symbols
 * are capitalised by convention — "Only trade ETH and USDC on Uniswap" — and
 * that convention is the entire signal this regex reads. Upper-casing first
 * makes every English word match, and the flag then reads "the mandate names
 * TRADE, ETH, USDC, ON, WITH, OR", which is both useless as an accusation and
 * wrong as a rule.
 */
const NOT_A_TICKER = new Set([
  "ONLY", "MAX", "AND", "NOT", "NO", "THE", "PER", "API", "NEVER", "ANY", "ALL",
  "USD", "EUR", "GBP", "DEX", "ERC", "NFT", "AMM", "APY", "APR", "TVL", "KYC",
  "FOR", "WITH", "FROM", "INTO", "THAN", "THAT", "THIS", "MUST", "MAY", "CAN",
  "ARE", "IS", "IT", "BE", "TO", "OF", "IN", "ON", "OR", "AT", "IF", "AS", "BY",
]);

export function allowedSymbols(mandate: string): string[] {
  const found = new Set<string>();
  // "ETH/USDC", "ETH and USDC", "only trade WBTC"
  for (const m of mandate.matchAll(/\b([A-Z]{2,6})\b/g)) {
    const sym = m[1];
    if (NOT_A_TICKER.has(sym)) continue;
    found.add(sym);
  }
  return [...found];
}

/** A stated per-transaction native-value ceiling, in wei, or null. */
export function valueCeilingWei(mandate: string): bigint | null {
  // "Maximum 0.5 ETH per trade", "max 2 ETH", "no more than 1.5 ETH"
  const m = mandate.match(
    /(?:max(?:imum)?|no more than|not exceed|under|below|limit of)\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(ETH|MATIC|POL|GEN)?/i,
  );
  if (!m) return null;
  const [whole, frac = ""] = m[1].split(".");
  const unit = (m[2] ?? "").toUpperCase();
  // A dollar figure is not a wei figure and this file will not guess an
  // exchange rate — a mandate priced in USD is left entirely to the validators.
  if (!unit) return null;
  try {
    const padded = (frac + "0".repeat(18)).slice(0, 18);
    return BigInt(whole) * WEI + BigInt(padded || "0");
  } catch {
    return null;
  }
}

export function forbidsUnverified(mandate: string): boolean {
  return /unverified|not verified|unaudited|verified contracts only/i.test(mandate);
}

export function restrictsToNamedTokens(mandate: string): boolean {
  return /\bonly\b/i.test(mandate) && /\btrade|swap|buy|sell\b/i.test(mandate);
}

/**
 * Flags for one transaction against one mandate. Empty means "nothing this file
 * can be confident about", which is the common and correct answer.
 */
export function flagsFor(tx: TxRow, mandate: string, chain: string): Flag[] {
  const out: Flag[] = [];
  // Defensive, deliberately. A throw here aborts the whole agent inside the
  // patrol loop, and the agent is then reported as unexamined rather than as
  // clean — but one malformed row should cost one row, not the whole wallet.
  const transfers = Array.isArray(tx?.transfers) ? tx.transfers : [];
  if (!tx || typeof mandate !== "string") return out;

  // A reverted transaction moved nothing and breaches nothing.
  if (tx.result && tx.result !== "success") return out;

  // 1. Explorer-flagged scam counterparty. Blockscout's own designation, not a
  //    judgement of this file's.
  if (tx.toIsScam) {
    out.push({
      tx_hash: tx.hash,
      rule: "scam-counterparty",
      reason: `The counterparty ${tx.to} is flagged as a scam by the block explorer.`,
    });
  }

  // 2. An explicit ban on unverified contracts, against an unverified contract.
  if (forbidsUnverified(mandate) && tx.toIsContract && !tx.toIsVerified) {
    out.push({
      tx_hash: tx.hash,
      rule: "unverified-contract",
      reason: `The mandate forbids unverified contracts; ${tx.to} has no verified source on the explorer.`,
    });
  }

  // 3. A stated native-value ceiling, exceeded.
  const ceiling = valueCeilingWei(mandate);
  if (ceiling !== null) {
    let value = 0n;
    try { value = BigInt(tx.value || "0"); } catch { value = 0n; }
    if (value > ceiling) {
      out.push({
        tx_hash: tx.hash,
        rule: "over-value-ceiling",
        reason: `The mandate caps a transaction at ${ceiling / WEI}.${((ceiling % WEI) / 10n ** 14n).toString().padStart(4, "0")} but this one sent ${value / WEI}.${((value % WEI) / 10n ** 14n).toString().padStart(4, "0")}.`,
      });
    }
  }

  // 4. A token the mandate does not name, in a mandate that restricts trading
  //    to named tokens. This is the rule that catches the WETH→WFC swap.
  if (restrictsToNamedTokens(mandate) && transfers.length > 0) {
    const allowed = new Set(allowedSymbols(mandate));
    for (const alias of NATIVE_ALIASES[chain] ?? []) {
      if (allowed.has("ETH") || allowed.has("MATIC")) allowed.add(alias);
    }
    const strangers = transfers
      .map((t) => (t?.sym || "").toUpperCase())
      .filter((sym) => sym && !allowed.has(sym));
    const unique = [...new Set(strangers)];
    // If the mandate names no ticker this rule cannot say anything, and a flag
    // built from an empty allow-list would accuse every transaction there is.
    if (unique.length > 0 && allowed.size > 0) {
      out.push({
        tx_hash: tx.hash,
        rule: "unlisted-token",
        reason: `The mandate names ${[...allowed].slice(0, 6).join(", ")} but this transaction moved ${unique.slice(0, 4).join(", ")}.`,
      });
    }
  }

  return out;
}

/** One challenge reason, capped at the contract's 300-character ceiling. */
export function reasonText(flags: Flag[]): string {
  const body = flags.map((f) => f.reason).join(" ");
  return body.length <= 300 ? body : body.slice(0, 297) + "...";
}
