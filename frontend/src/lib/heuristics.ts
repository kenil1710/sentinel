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

/* ─────────────────────────────────────────────────────────────────────────
 * LEARNING FROM THE VALIDATORS
 *
 * A flag stakes GEN, and a COMPLIANT verdict FORFEITS it — the stake is added
 * to the operator's bond and the bot gets nothing back. So re-filing an
 * accusation the validators have already rejected against the same agent is
 * not merely redundant, it is a standing order to lose money on a schedule:
 * every patrol, forever, because `is_tx_challenged` only stops a repeat of the
 * same TRANSACTION and the agent keeps making new ones.
 *
 * So the bot reads the agent's own settled history and defers to it. Once TWO
 * separate rounds have read this mandate and ruled that moving WFC is within
 * it, the bot accepts that and stops paying to re-litigate WFC on that agent.
 *
 * ## What a ruling is taken to cover — and what it is not
 *
 * Narrowly: per agent, per rule, per SUBJECT. Deferring more broadly than the
 * validators actually ruled would blind the watchdog, which is a far worse
 * failure than a wasted stake.
 *
 *   unlisted-token       the one symbol that was cleared. A ruling about WFC
 *                        says nothing about PONS, so PONS is still challenged.
 *   scam-counterparty    the one address that was cleared.
 *   unverified-contract  the one address that was cleared.
 *   over-value-ceiling   the one ceiling that was cleared. The amount that
 *                        breached it is deliberately NOT part of the key: if
 *                        0.6 over a 0.5 cap is within the mandate then so is
 *                        0.7, and keying on the amount would re-file the
 *                        identical argument for every new number.
 *
 * ## How a ruling stops applying
 *
 * A token key carries the allow-list the mandate produced when it was judged —
 * `unlisted-token|ETH,USDC|WFC`. An operator who edits the mandate's token list
 * changes that allow-list, the key stops matching, and the bot resumes
 * challenging by itself. Same for the ceiling key, which carries the ceiling.
 * That is the entire invalidation mechanism, and it needs no extra storage and
 * no extra read: a verdict is remembered against the RULE that was judged, not
 * against the agent in general.
 *
 * ## Why the keys are parsed back out of English
 *
 * The contract stores the accusation as prose, because prose is what the
 * validators read. Rather than add a machine-readable tag to the text a
 * consensus round judges — changing the input to the round to make a client's
 * bookkeeping easier — the SAME parser runs over the sentence the bot is about
 * to file and over the sentence already on chain. Symmetric by construction:
 * there is no second format that can drift out of step with the first.
 * ───────────────────────────────────────────────────────────────────────── */

/** One challenge as `get_agent_history` returns it, narrowed to what learning reads. */
export interface SettledChallenge {
  challenge_id?: number;
  verdict?: string;
  reason?: string;
  injection_flagged?: boolean;
  /** Which transaction was judged. Required for corroboration — see below. */
  tx_hash?: string;
}

/* ─────────────────────────────────────────────────────────────────────────
 * WHY A REASON STRING IS NOT EVIDENCE
 *
 * The accusation the contract stores is free text. Nothing binds it to the
 * transaction it claims to describe, and `challenge_agent` validates only its
 * length. So anyone could write the bot's own sentence — verbatim, it is
 * published in this file — point it at a harmless transfer, and collect a
 * COMPLIANT verdict that the validators were right to give: the transaction
 * really was unremarkable, and the prompt names COMPLIANT as the answer for
 * exactly that case.
 *
 * Two of those, and `learnedFrom` used to hand the bot a standing order to
 * ignore that pattern on that agent. MEASURED, as the audit that prompted this:
 * two forged clearances at 0.015 GEN each — the rest of the stake comes back
 * into the operator's own bond — and the bot withheld a real unlisted-token
 * violation it had correctly flagged.
 *
 * ## The fix: corroborate the reason against the transaction
 *
 * A ruling now counts only if the bot, re-reading the ACTUAL transaction the
 * challenge named, derives the same key from it. The accusation is no longer
 * taken at its word; it is checked against the record.
 *
 * That kills the forgery outright — a reason claiming WFC moved, on a transfer
 * where no WFC moved, produces no key from the record and teaches nothing —
 * while keeping the generalisation the feature exists for: a pattern genuinely
 * cleared twice on real transactions still stands the bot down, which is the
 * whole point of not paying to re-litigate settled arguments.
 *
 * Keying on the tx hash itself was the other option, and it is rejected on
 * purpose: it would make every key unique per transaction, so nothing could
 * ever generalise, `is_tx_challenged` already covers the same-transaction case,
 * and the bot would go straight back to losing a stake on every new trade of a
 * kind the validators have already ruled on. That is the exact failure this
 * machinery was built to stop.
 *
 * ## What it costs
 *
 * One Blockscout fetch per settled COMPLIANT challenge in an agent's history,
 * bounded by CORROBORATE_MAX per patrol, and only for agents that have been
 * cleared of something. A transaction that cannot be re-read corroborates
 * NOTHING and the bot keeps challenging — the safe direction, since the cost of
 * that is a stake and the cost of the other is a blind watchdog.
 * ───────────────────────────────────────────────────────────────────────── */

/** How the bot re-reads a historical transaction. Injected so tests stay offline. */
export type TxLookup = (hash: string) => Promise<TxRow | null>;

/**
 * Corroboration fetches per agent per patrol.
 *
 * A ceiling, not a target: most agents have no settled history at all, and the
 * ones that do are usually corroborating two or three challenges. It exists so
 * that an agent with a long history cannot, by itself, spend a patrol's whole
 * network budget re-reading its own past.
 */
export const CORROBORATE_MAX = 12;

/**
 * How many times the validators must reject the same accusation against the
 * same agent before the bot stops making it.
 *
 * Two, not one. A single COMPLIANT verdict can be a round that read the
 * evidence badly — the same register carries 53 INCONCLUSIVE settlements, so
 * these rounds visibly do not always converge cleanly. Standing down on one
 * ruling would let a single bad round blind the bot to a whole class of
 * breach. Two independent rounds agreeing is a pattern; one is an anecdote.
 *
 * The cost of the extra round is bounded and known: one more stake, once, per
 * agent-and-pattern, ever. That is the right price for not going blind.
 */
export const LEARN_AFTER = 2;

/** What one agent's history says about one rule-and-subject key. */
export interface Ruling {
  /** CORROBORATED COMPLIANT verdicts on this key. The bot stands down at LEARN_AFTER. */
  rulings: number;
  /** Earliest and most recent challenge ids, so a withheld flag can cite them. */
  first: number;
  last: number;
  /**
   * The transactions that corroborated it. Kept so the threshold can require
   * DISTINCT transactions, and so a withheld flag can name what cleared it —
   * "the bot stood down" is only inspectable if the evidence is nameable.
   */
  transactions: string[];
}

/** A flag that was NOT filed, and the verdicts that withheld it. */
export interface Withheld {
  rule: string;
  reason: string;
  /** The challenge first ruled COMPLIANT on this key. */
  cleared_by: number;
  /** How many times the validators have rejected this accusation. */
  rulings: number;
}

/**
 * The sentences this file writes, read back as keys.
 *
 * Each pattern is anchored to a template above and MUST be kept in step with
 * it: a reason whose wording changes without its pattern changing simply stops
 * being learnable, and the bot goes back to paying for verdicts it already has.
 * The tests assert the round trip rather than trusting this comment.
 */
const SIGNATURE_RULES: { re: RegExp; keys: (m: RegExpMatchArray) => string[] }[] = [
  {
    // "The counterparty 0x… is flagged as a scam by the block explorer."
    re: /The counterparty (0x[0-9a-fA-F]+) is flagged as a scam by the block explorer\./g,
    keys: (m) => [`scam-counterparty|${m[1].toLowerCase()}`],
  },
  {
    // "The mandate forbids unverified contracts; 0x… has no verified source on the explorer."
    re: /The mandate forbids unverified contracts; (0x[0-9a-fA-F]+) has no verified source on the explorer\./g,
    keys: (m) => [`unverified-contract|${m[1].toLowerCase()}`],
  },
  {
    // "The mandate caps a transaction at 0.5000 but this one sent 2.0000."
    re: /The mandate caps a transaction at ([0-9]+\.[0-9]+) but this one sent [0-9]+\.[0-9]+\./g,
    keys: (m) => [`over-value-ceiling|${m[1]}`],
  },
  {
    // "The mandate names ETH, USDC but this transaction moved WFC, PONS."
    // The character classes exclude "." so a match can never span sentences.
    re: /The mandate names ([^.]+?) but this transaction moved ([^.]+?)\./g,
    keys: (m) => {
      const allowed = symbolList(m[1]).sort().join(",");
      return symbolList(m[2]).map((sym) => `unlisted-token|${allowed}|${sym}`);
    },
  },
];

function symbolList(csv: string): string[] {
  return csv.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

/**
 * Drop a trailing sentence that `reasonText` cut off at 300 characters.
 *
 * A half-written accusation must not become a key. "…moved WF..." would parse
 * as a cleared token named WF — harmless, since no such token exists, but a
 * key built from text nobody wrote is the kind of thing that is harmless right
 * up until the day it is not.
 */
function completeSentencesOf(reason: string): string {
  const body = reason.replace(/\s+/g, " ").trim();
  if (!body.endsWith("...")) return body;
  const cut = body.slice(0, -3).lastIndexOf(". ");
  return cut < 0 ? "" : body.slice(0, cut + 1);
}

/**
 * Every rule-and-subject key an accusation asserts. Empty means the text is not
 * one this file wrote — a human's own words, most often — and an accusation
 * that cannot be read back is never learned from and never withheld.
 */
export function reasonSignatures(reason: string): string[] {
  if (typeof reason !== "string") return [];
  const body = completeSentencesOf(reason);
  const out = new Set<string>();
  for (const { re, keys } of SIGNATURE_RULES) {
    // Each RegExp is module-level and /g, so lastIndex is reset before use
    // rather than trusted — a previous partial scan would otherwise make this
    // function's answer depend on what was parsed before it.
    re.lastIndex = 0;
    for (const m of body.matchAll(re)) for (const k of keys(m)) out.add(k);
  }
  return [...out];
}

/**
 * What this agent's settled history has taught the bot: key → the rulings
 * behind it. Only keys the validators have rejected at least LEARN_AFTER times
 * are returned, so the caller can treat membership as "stand down".
 *
 * ONLY a COMPLIANT verdict counts toward the threshold. INCONCLUSIVE settled
 * nothing — a round that could not converge is not a ruling that the
 * transaction was fine, and counting it would let an unreadable explorer talk
 * the watchdog into silence.
 *
 * A VIOLATION on the same key VETOES the key outright, however many clearances
 * sit beside it. Once this exact accusation has been PROVEN against this agent
 * even once, standing down on it is the one outcome that cannot be defended:
 * the bot would be declining to look at a breach it has already demonstrated.
 * A contested pattern is one the bot keeps paying to argue.
 *
 * Whoever filed it counts. The verdict is the validators', not the
 * challenger's, and a human's refuted challenge is exactly as much evidence
 * that this accusation loses as the bot's own.
 *
 * A challenge flagged for prompt injection contributes NOTHING, even when it
 * came back COMPLIANT. That flag says the evidence or the accusation contained
 * text aimed at the judge; a clearance obtained under those conditions is the
 * one verdict a bot should never make permanent.
 */
export async function learnedFrom(
  challenges: SettledChallenge[],
  mandate: string,
  chain: string,
  lookup: TxLookup,
): Promise<Map<string, Ruling>> {
  const counts = new Map<string, Ruling>();
  const vetoed = new Set<string>();
  let fetches = 0;

  for (const c of Array.isArray(challenges) ? challenges : []) {
    if (!c) continue;
    const verdict = String(c.verdict ?? "").toUpperCase();
    if (verdict !== "COMPLIANT" && verdict !== "VIOLATION") continue;
    if (c.injection_flagged) continue;
    const id = Number(c.challenge_id ?? -1);
    const claimed = reasonSignatures(String(c.reason ?? ""));
    if (claimed.length === 0) continue;

    /*
     * A VIOLATION needs no corroboration. It is a proven breach, and the only
     * thing it can do here is make the bot keep looking — the failure-safe
     * direction, so an unreadable transaction must never be able to suppress it.
     *
     * This is also why the veto is kept even though it rarely fires from a
     * human's challenge: a human writes prose, which parses to no signature at
     * all, so their VIOLATION vetoes nothing. The veto covers the bot's own
     * template only, and the corroboration below is what actually carries the
     * defence.
     */
    if (verdict === "VIOLATION") {
      for (const sig of claimed) vetoed.add(sig);
      continue;
    }

    // A COMPLIANT verdict must be corroborated against the transaction it
    // judged. No hash, no budget, or an unreadable transaction — it teaches
    // nothing and the bot goes on challenging.
    const hash = String(c.tx_hash ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) continue;
    if (fetches >= CORROBORATE_MAX) continue;
    fetches++;
    let record: TxRow | null = null;
    try {
      record = await lookup(hash);
    } catch {
      continue;
    }
    if (!record) continue;

    // The key the RECORD produces, not the key the accusation claimed. A
    // forged reason asserts a pattern the transaction does not exhibit, so the
    // intersection below is empty and nothing is learned.
    const corroborated = new Set<string>();
    for (const f of flagsFor(record, mandate, chain)) {
      for (const sig of reasonSignatures(f.reason)) corroborated.add(sig);
    }

    for (const sig of claimed) {
      if (!corroborated.has(sig)) continue;
      const seen = counts.get(sig);
      // `get_agent_history` returns newest first, so the SMALLER id is the
      // earlier ruling whichever order they arrive in — computed rather than
      // assumed, because an ordering this code does not control should not be
      // load-bearing for what it reports.
      if (!seen) counts.set(sig, { rulings: 1, first: id, last: id, transactions: [hash] });
      else counts.set(sig, {
        rulings: seen.rulings + 1,
        first: Math.min(seen.first, id),
        last: Math.max(seen.last, id),
        transactions: seen.transactions.concat([hash]),
      });
    }
  }

  const out = new Map<string, Ruling>();
  for (const [sig, ruling] of counts) {
    if (vetoed.has(sig)) continue;
    if (ruling.rulings < LEARN_AFTER) continue;
    // The rulings must come from DIFFERENT transactions. Two clearances of one
    // transaction are one event seen twice, not a pattern — and the contract
    // now releases a refunded claim, so the same transaction can genuinely be
    // challenged more than once.
    if (new Set(ruling.transactions).size < LEARN_AFTER) continue;
    out.set(sig, ruling);
  }
  return out;
}

/**
 * Split flags into the ones still worth staking on and the ones the validators
 * have already rejected.
 *
 * A flag is withheld only when EVERY key it asserts has been cleared. A
 * transaction moving WFC and PONS against a mandate that has been ruled fine
 * for WFC alone is still challenged — on PONS, which is what the reason then
 * says. Filing the whole accusation again would re-argue the settled half and
 * invite the same COMPLIANT verdict on a technicality.
 */
export function withholdLearned(
  flags: Flag[],
  learned: Map<string, Ruling>,
): { keep: Flag[]; withheld: Withheld[] } {
  const keep: Flag[] = [];
  const withheld: Withheld[] = [];
  for (const f of flags) {
    const sigs = reasonSignatures(f.reason);
    if (sigs.length === 0 || !sigs.every((s) => learned.has(s))) {
      keep.push(f);
      continue;
    }
    // Cite the weakest evidence behind the decision, not the strongest: the key
    // withheld here is only as settled as its least-rejected part.
    const weakest = sigs
      .map((s) => learned.get(s) as Ruling)
      .reduce((a, b) => (b.rulings < a.rulings ? b : a));
    withheld.push({
      rule: f.rule,
      reason: f.reason,
      cleared_by: weakest.first,
      rulings: weakest.rulings,
    });
  }
  return { keep, withheld };
}
