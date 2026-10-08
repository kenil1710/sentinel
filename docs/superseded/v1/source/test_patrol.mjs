/**
 * Tests for the patrol bot's judgement — the mechanical rules in
 * frontend/src/lib/heuristics.ts that decide what Sentinel ACCUSES.
 *
 *   node --experimental-strip-types --no-warnings test/test_patrol.mjs
 *
 * These rules stake real GEN that is lost when a challenge is refuted, so being
 * wrong here costs money. They are also the one part of the pipeline that is
 * NOT judged by validators afterwards — a rule that fails to fire produces
 * silence, and silence from a watchdog looks exactly like safety.
 *
 * Every fixture is a real Blockscout body captured on 2026-09-03.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allowedSymbols, valueCeilingWei, forbidsUnverified,
  restrictsToNamedTokens, flagsFor, reasonText,
  reasonSignatures, learnedFrom, withholdLearned, LEARN_AFTER,
  CORROBORATE_MAX,
} from "../frontend/src/lib/heuristics.ts";

const FIX = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8")).fixtures;
const SWAP = JSON.parse(FIX.uniswap_swap_eth.body);

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}\n     ${String(e.message).split("\n")[0]}`); }
}

/**
 * An async test, deferred to the end of the file.
 *
 * `learnedFrom` became async when it started corroborating each clearance
 * against the transaction it judged — a reason string is a claim, and the bot
 * now checks the record instead of believing it.
 */
const deferred = [];
function atest(name, fn) { deferred.push([name, fn]); }

/** The same projection the API route builds from a Blockscout document. */
function rowOf(doc) {
  const addr = (n) => {
    const o = n ?? {};
    return {
      hash: String(o.hash ?? "").toLowerCase(), name: o.name ?? null,
      is_contract: Boolean(o.is_contract), is_verified: Boolean(o.is_verified),
      is_scam: Boolean(o.is_scam),
      tags: ((o.metadata?.tags) ?? []).map((t) => String(t?.name ?? "")).filter(Boolean),
    };
  };
  const to = addr(doc.to), from = addr(doc.from);
  return {
    hash: String(doc.hash ?? "").toLowerCase(),
    timestamp: String(doc.timestamp ?? ""), epoch: 0,
    value: String(doc.value ?? "0"), method: doc.method ?? null,
    methodCall: doc.decoded_input?.method_call ?? null, result: doc.result ?? null,
    from: from.hash, to: to.hash, toName: to.name, toIsContract: to.is_contract,
    toIsVerified: to.is_verified, toIsScam: to.is_scam, toTags: to.tags,
    transfers: (doc.token_transfers ?? []).map((t) => ({
      sym: String(t.token?.symbol ?? "?"),
      addr: String(t.token?.address_hash ?? "").toLowerCase(),
      value: String(t.total?.value ?? "0"), decimals: String(t.total?.decimals ?? "18"),
    })),
  };
}

const STRICT = "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. " +
  "Never interact with unverified contracts or unlisted tokens.";
const PERMISSIVE = "The agent may trade any ERC-20 token on any decentralised exchange, " +
  "in any size, at its own discretion. There are no restrictions.";

// ── symbol extraction ──────────────────────────────────────────────────────

test("extracts the tickers a mandate names", () => {
  assert.deepEqual(allowedSymbols(STRICT).sort(), ["ETH", "USDC"]);
});

test("reads the mandate AS WRITTEN, not upper-cased", () => {
  // The bug this exists for: upper-casing first made every English word match,
  // and the flag read "the mandate names TRADE, ETH, USDC, ON, WITH, OR".
  const found = allowedSymbols(STRICT);
  for (const word of ["TRADE", "ONLY", "TOKENS", "NEVER", "MAXIMUM"]) {
    assert.ok(!found.includes(word), `${word} must not be read as a ticker`);
  }
});

test("filters English words that are genuinely upper-case", () => {
  const found = allowedSymbols("ONLY trade ETH. NO other tokens. NOT USD pairs.");
  assert.ok(found.includes("ETH"));
  for (const w of ["ONLY", "NO", "NOT", "USD"]) assert.ok(!found.includes(w), w);
});

test("finds tickers written with a slash", () => {
  assert.deepEqual(allowedSymbols("Only trade ETH/USDC pairs.").sort(), ["ETH", "USDC"]);
});

test("a mandate naming no ticker yields nothing", () => {
  assert.deepEqual(allowedSymbols(PERMISSIVE), []);
});

test("a one-letter or seven-letter token is not read as a ticker", () => {
  const found = allowedSymbols("Trade A and ABCDEFGH only.");
  assert.ok(!found.includes("A"));
  assert.ok(!found.includes("ABCDEFGH"));
});

// ── value ceiling ──────────────────────────────────────────────────────────

test("reads a stated maximum in ETH", () => {
  assert.equal(valueCeilingWei("Maximum 0.5 ETH per trade"), 5n * 10n ** 17n);
});

test("reads several phrasings of the same limit", () => {
  for (const phrase of ["max 2 ETH", "no more than 2 ETH", "not exceed 2 ETH",
                        "under 2 ETH", "limit of 2 ETH"]) {
    assert.equal(valueCeilingWei(phrase), 2n * 10n ** 18n, phrase);
  }
});

test("REFUSES to guess an exchange rate for a dollar limit", () => {
  // "Max $500 per trade" is in the plan's own example mandate. This file will
  // not invent an ETH price to test it against — a USD ceiling is left entirely
  // to the validators, who can read it in context.
  assert.equal(valueCeilingWei("Max $500 per trade"), null);
  assert.equal(valueCeilingWei("no more than 500 dollars"), null);
});

test("a mandate with no ceiling yields null", () => {
  assert.equal(valueCeilingWei(PERMISSIVE), null);
  assert.equal(valueCeilingWei("Only trade ETH and USDC."), null);
});

test("fractional limits keep full wei precision", () => {
  assert.equal(valueCeilingWei("max 0.123456789012345678 ETH"), 123456789012345678n);
});

// ── the other predicates ───────────────────────────────────────────────────

test("recognises a ban on unverified contracts", () => {
  assert.ok(forbidsUnverified(STRICT));
  assert.ok(forbidsUnverified("Verified contracts only."));
  assert.ok(!forbidsUnverified(PERMISSIVE));
});

test("recognises a mandate that restricts trading to named tokens", () => {
  assert.ok(restrictsToNamedTokens(STRICT));
  assert.ok(!restrictsToNamedTokens(PERMISSIVE));
});

// ── the whole rule set, against the real swap ──────────────────────────────

test("FLAGS the real WETH→WFC swap against the strict mandate", () => {
  const flags = flagsFor(rowOf(SWAP), STRICT, "ethereum");
  assert.ok(flags.length > 0, "the motivating example must be caught");
  assert.ok(flags.some((f) => f.rule === "unlisted-token"));
  assert.ok(flags.some((f) => f.reason.includes("WFC")));
});

test("names the permitted tickers in the accusation", () => {
  const flags = flagsFor(rowOf(SWAP), STRICT, "ethereum");
  const text = reasonText(flags);
  assert.ok(text.includes("ETH"));
  assert.ok(text.includes("USDC"));
  assert.ok(text.includes("WFC"));
});

test("does NOT flag the same swap against a permissive mandate", () => {
  // The verdict must be a property of the MANDATE, not of the transaction.
  assert.deepEqual(flagsFor(rowOf(SWAP), PERMISSIVE, "ethereum"), []);
});

test("treats WETH as ETH so a wrapped trade is not a false accusation", () => {
  const row = rowOf(SWAP);
  row.transfers = row.transfers.filter((t) => t.sym === "WETH");
  assert.deepEqual(flagsFor(row, STRICT, "ethereum"), []);
});

test("does not flag a transaction with no token transfers", () => {
  const row = rowOf(SWAP);
  row.transfers = [];
  assert.deepEqual(flagsFor(row, STRICT, "ethereum").filter((f) => f.rule === "unlisted-token"), []);
});

test("flags an explorer-designated scam counterparty", () => {
  const row = rowOf(SWAP);
  row.toIsScam = true;
  assert.ok(flagsFor(row, PERMISSIVE, "ethereum").some((f) => f.rule === "scam-counterparty"));
});

test("flags an unverified contract when the mandate forbids one", () => {
  const row = rowOf(SWAP);
  row.toIsVerified = false;
  assert.ok(flagsFor(row, STRICT, "ethereum").some((f) => f.rule === "unverified-contract"));
});

test("does not flag an unverified contract when the mandate permits it", () => {
  const row = rowOf(SWAP);
  row.toIsVerified = false;
  assert.ok(!flagsFor(row, PERMISSIVE, "ethereum").some((f) => f.rule === "unverified-contract"));
});

test("flags a value over a stated ceiling", () => {
  const row = rowOf(SWAP);
  row.value = String(2n * 10n ** 18n);
  assert.ok(flagsFor(row, STRICT, "ethereum").some((f) => f.rule === "over-value-ceiling"));
});

test("does not flag a value under the ceiling", () => {
  const row = rowOf(SWAP);
  row.value = String(10n ** 17n);
  assert.ok(!flagsFor(row, STRICT, "ethereum").some((f) => f.rule === "over-value-ceiling"));
});

test("NEVER flags a reverted transaction", () => {
  // It moved nothing and breached nothing.
  const row = rowOf(SWAP);
  row.result = "reverted";
  row.toIsScam = true;
  row.value = String(999n * 10n ** 18n);
  assert.deepEqual(flagsFor(row, STRICT, "ethereum"), []);
});

test("an empty mandate accuses nobody", () => {
  assert.deepEqual(flagsFor(rowOf(SWAP), "", "ethereum"), []);
});

test("polygon's native alias is MATIC, not ETH", () => {
  const row = rowOf(SWAP);
  row.transfers = [{ sym: "WMATIC", addr: "0x1", value: "1", decimals: "18" }];
  const m = "Only trade MATIC and USDC on Uniswap.";
  assert.deepEqual(flagsFor(row, m, "polygon"), []);
});

test("robinhood settles in ETH, so WETH is not an unnamed token", () => {
  // /api/v2/stats on robinhoodchain.blockscout.com reports the Ethereum coin
  // image and the live ETH price as its native unit. A chain missing from
  // NATIVE_ALIASES falls back to no aliases at all, and every mandate that
  // says "ETH" would then accuse its own agent of trading an unnamed token.
  const row = rowOf(SWAP);
  row.transfers = [{ sym: "WETH", addr: "0x1", value: "1", decimals: "18" }];
  const m = "Only trade ETH and USDC through the DEX router.";
  assert.deepEqual(flagsFor(row, m, "robinhood"), []);
});

test("robinhood still flags a token the mandate does not name", () => {
  const row = rowOf(SWAP);
  row.transfers = [{ sym: "PONS", addr: "0x1", value: "1", decimals: "18" }];
  const m = "Only trade ETH and USDC through the DEX router.";
  const flags = flagsFor(row, m, "robinhood");
  assert.equal(flags.length, 1);
  assert.match(flags[0].reason, /PONS/);
});

test("the reason text respects the contract's 300-character ceiling", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    tx_hash: "0x", rule: "r", reason: `Rule ${i} was broken in a fairly verbose way. `,
  }));
  assert.ok(reasonText(many).length <= 300);
});

test("flagsFor never throws on a malformed row", () => {
  const bad = [
    { ...rowOf(SWAP), value: "not a number" },
    { ...rowOf(SWAP), transfers: [{ sym: null, addr: null, value: null, decimals: null }] },
    { ...rowOf(SWAP), transfers: null },
  ];
  for (const row of bad) {
    try { flagsFor(row, STRICT, "ethereum"); }
    catch (e) { assert.fail(`threw on ${JSON.stringify(row).slice(0, 60)}: ${e.message}`); }
  }
});

// ── learning from the validators ───────────────────────────────────────────
//
// The bug: the bot re-filed the same accusation against the same agent every
// patrol, and lost the stake every time, because `is_tx_challenged` only stops
// a repeat of the same TRANSACTION. These assert that a COMPLIANT verdict is
// read back out of the prose the contract stores and withholds the next
// identical accusation — and, just as important, withholds nothing more.

/** A distinct, well-formed transaction hash per challenge id. */
const hashOf = (id) => "0x" + String(id).padStart(64, "0");

/** A settled challenge as get_agent_history returns it. */
function settled(id, verdict, reason, extra = {}) {
  return {
    challenge_id: id, verdict, reason, injection_flagged: false,
    tx_hash: hashOf(id), ...extra,
  };
}

/**
 * Run the learner against a history whose transactions are served from memory.
 *
 * `rows` maps a challenge id to the transaction record that challenge judged.
 * Anything not named there falls back to `fallback` — which for most tests is
 * the real Uniswap fixture, i.e. a transaction that GENUINELY exhibits the
 * pattern being cleared. That is what the existing behaviour is about: a
 * pattern truly cleared twice still stands the bot down.
 *
 * The forgery tests below hand over a harmless row instead, which is the whole
 * point: the same reason text, a record that does not back it, nothing learned.
 */
function learn(history, { mandate = STRICT, chain = "ethereum", rows = {}, fallback = null } = {}) {
  const byHash = new Map();
  for (const [id, row] of Object.entries(rows)) byHash.set(hashOf(Number(id)), row);
  return learnedFrom(history, mandate, chain, async (hash) => {
    if (byHash.has(hash)) return byHash.get(hash);
    return fallback === null ? rowOf(SWAP) : fallback;
  });
}

/** The exact reason the bot would file for this row — the thing stored on chain. */
function wouldFile(row, mandate, chain = "ethereum") {
  return reasonText(flagsFor(row, mandate, chain));
}

test("a filed accusation round-trips back into the key it asserts", () => {
  // The whole mechanism rests on this: the SAME parser over the sentence about
  // to be filed and over the sentence already on chain. If the wording of a
  // reason ever changes without its pattern, this is what notices.
  const text = wouldFile(rowOf(SWAP), STRICT);
  const sigs = reasonSignatures(text);
  assert.ok(sigs.length > 0, `nothing parsed out of: ${text}`);
  assert.ok(sigs.some((s) => s.startsWith("unlisted-token|") && s.endsWith("|WFC")),
    `expected a WFC key, got ${JSON.stringify(sigs)}`);
});

test("every rule the bot can file is readable back as a key", () => {
  const scam = { ...rowOf(SWAP), toIsScam: true };
  const unver = { ...rowOf(SWAP), toIsVerified: false };
  const over = { ...rowOf(SWAP), value: String(2n * 10n ** 18n) };
  const cases = [
    [wouldFile(scam, PERMISSIVE), "scam-counterparty|"],
    [wouldFile(unver, "Never interact with unverified contracts.", "ethereum"), "unverified-contract|"],
    [reasonText(flagsFor(over, STRICT, "ethereum").filter((f) => f.rule === "over-value-ceiling")), "over-value-ceiling|"],
  ];
  for (const [text, prefix] of cases) {
    const sigs = reasonSignatures(text);
    assert.ok(sigs.some((s) => s.startsWith(prefix)),
      `${prefix} did not round-trip from: ${text}`);
  }
});

atest("ONE COMPLIANT verdict is not enough to stand down", async () => {
  // A single ruling can be a round that read the evidence badly — this register
  // carries 53 INCONCLUSIVE settlements, so the rounds visibly do not always
  // converge. Standing down on one would let one bad round blind the bot.
  const row = rowOf(SWAP);
  const learned = await learn([settled(7, "COMPLIANT", wouldFile(row, STRICT))]);
  assert.equal(learned.size, 0);
  assert.equal(withholdLearned(flagsFor(row, STRICT, "ethereum"), learned).keep.length, 1);
});

atest("TWO COMPLIANT verdicts withhold the identical accusation next time", async () => {
  // THE BUG, stated as a test. Same agent, same rule, same token, new tx.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn([settled(9, "COMPLIANT", text), settled(7, "COMPLIANT", text)]);
  const { keep, withheld } = withholdLearned(flagsFor(row, STRICT, "ethereum"), learned);
  assert.deepEqual(keep, [], "the bot must not re-file what the validators rejected twice");
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].cleared_by, 7, "must cite the EARLIEST ruling, whatever the order");
  assert.equal(withheld[0].rulings, 2);
});

atest("the threshold is exactly LEARN_AFTER, not a hard-coded 2", async () => {
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const upTo = (n) => learn(Array.from({ length: n }, (_, i) => settled(i, "COMPLIANT", text)));
  assert.equal((await upTo(LEARN_AFTER - 1)).size, 0);
  const at = await upTo(LEARN_AFTER);
  assert.equal(at.size, 1);
  assert.equal(at.get([...at.keys()][0]).rulings, LEARN_AFTER);
});

atest("a single VIOLATION vetoes a pattern however many clearances sit beside it", async () => {
  // Standing down on an accusation already PROVEN against this agent is the one
  // outcome that cannot be defended: the bot would be declining to look at a
  // breach it has itself demonstrated.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const many = Array.from({ length: 20 }, (_, i) => settled(i, "COMPLIANT", text));
  assert.equal((await learn(many)).size, 1, "the fixture must otherwise be learned");
  const contested = await learn([...many, settled(99, "VIOLATION", text)]);
  assert.equal(contested.size, 0, "a contested pattern is one the bot keeps arguing");
  assert.equal(withholdLearned(flagsFor(row, STRICT, "ethereum"), contested).keep.length, 1);
});

atest("INCONCLUSIVE rounds do not count toward the threshold", async () => {
  // The live register has more INCONCLUSIVE settlements than COMPLIANT ones.
  // If they counted, an explorer nobody can read would talk the bot into silence.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn([
    settled(1, "COMPLIANT", text), settled(2, "INCONCLUSIVE", text),
    settled(3, "INCONCLUSIVE", text), settled(4, "INCONCLUSIVE", text),
  ]);
  assert.equal(learned.size, 0);
});

atest("a VIOLATION verdict teaches the bot NOTHING", async () => {
  // A proven breach is a reason to keep watching, not to stop.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn([settled(7, "VIOLATION", text), settled(8, "VIOLATION", text)]);
  assert.equal(learned.size, 0);
  assert.equal(withholdLearned(flagsFor(row, STRICT, "ethereum"), learned).keep.length, 1);
});

atest("an INCONCLUSIVE round is not a clearance", async () => {
  // A round that could not converge settled nothing. Treating it as COMPLIANT
  // would let an unreadable explorer permanently silence the watchdog.
  const row = rowOf(SWAP);
  for (const v of ["INCONCLUSIVE", "", "PENDING", "RETRY"]) {
    const text = wouldFile(row, STRICT);
    const learned = await learn([settled(7, v, text), settled(8, v, text)]);
    assert.equal(learned.size, 0, `"${v}" must teach nothing`);
  }
});

atest("a clearance reached on injection-flagged evidence is not learned", async () => {
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn([
    settled(7, "COMPLIANT", text, { injection_flagged: true }),
    settled(8, "COMPLIANT", text, { injection_flagged: true }),
  ]);
  assert.equal(learned.size, 0);
  assert.equal(withholdLearned(flagsFor(row, STRICT, "ethereum"), learned).keep.length, 1);
});

atest("a clearance for WFC says nothing about another token", async () => {
  // The narrowness is the safety property: deferring wider than the validators
  // actually ruled blinds the watchdog, which is worse than a wasted stake.
  const wfc = rowOf(SWAP);
  const wfcText = wouldFile(wfc, STRICT);
  const learned = await learn([settled(7, "COMPLIANT", wfcText), settled(8, "COMPLIANT", wfcText)]);

  const pons = { ...rowOf(SWAP), transfers: [{ sym: "PONS", addr: "0x1", value: "1", decimals: "18" }] };
  const flags = flagsFor(pons, STRICT, "ethereum");
  assert.equal(flags.length, 1);
  const { keep, withheld } = withholdLearned(flags, learned);
  assert.equal(keep.length, 1, "PONS was never put to the validators");
  assert.equal(withheld.length, 0);
});

atest("a clearance for one address says nothing about another", async () => {
  const a = { ...rowOf(SWAP), to: "0x" + "a".repeat(40), toIsScam: true };
  const b = { ...rowOf(SWAP), to: "0x" + "b".repeat(40), toIsScam: true };
  const aText = wouldFile(a, PERMISSIVE);
  const learned = await learn([settled(7, "COMPLIANT", aText), settled(8, "COMPLIANT", aText)],
    { mandate: PERMISSIVE, rows: { 7: a, 8: a } });
  assert.equal(withholdLearned(flagsFor(a, PERMISSIVE, "ethereum"), learned).keep.length, 0);
  assert.equal(withholdLearned(flagsFor(b, PERMISSIVE, "ethereum"), learned).keep.length, 1);
});

atest("a half-settled accusation is re-argued on its unsettled half only", async () => {
  // Filing the whole thing again would re-litigate the closed half and invite
  // the same COMPLIANT verdict on a technicality.
  const both = { ...rowOf(SWAP), toIsScam: true };
  const scamOnly = flagsFor(both, STRICT, "ethereum")
    .find((f) => f.rule === "scam-counterparty").reason;
  const learned = await learn([
    settled(7, "COMPLIANT", scamOnly), settled(8, "COMPLIANT", scamOnly),
  ], { rows: { 7: both, 8: both } });
  const { keep, withheld } = withholdLearned(flagsFor(both, STRICT, "ethereum"), learned);
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].rule, "scam-counterparty");
  assert.ok(keep.length >= 1);
  assert.ok(!keep.some((f) => f.rule === "scam-counterparty"));
  assert.ok(reasonText(keep).includes("WFC"), "the filed reason must be the unsettled half");
});

atest("editing the mandate's token list makes the bot start challenging again", async () => {
  // A verdict is remembered against the RULE that was judged. Change the rule
  // and the old ruling stops applying — with no extra state and no extra read.
  const row = rowOf(SWAP);
  const rowText = wouldFile(row, STRICT);
  const learned = await learn([settled(7, "COMPLIANT", rowText), settled(8, "COMPLIANT", rowText)]);
  const widened = "Only trade ETH, USDC and DAI on Uniswap. Maximum 0.5 ETH per trade. " +
    "Never interact with unverified contracts or unlisted tokens.";
  const { keep } = withholdLearned(flagsFor(row, widened, "ethereum"), learned);
  assert.equal(keep.length, 1, "a changed allow-list is a different rule");
});

atest("changing the stated ceiling makes the bot start challenging again", async () => {
  const over = { ...rowOf(SWAP), value: String(2n * 10n ** 18n) };
  const ceilingFlag = (m) => flagsFor(over, m, "ethereum").filter((f) => f.rule === "over-value-ceiling");
  const capText = reasonText(ceilingFlag(STRICT));
  const learned = await learn([settled(7, "COMPLIANT", capText), settled(8, "COMPLIANT", capText)],
    { rows: { 7: over, 8: over } });
  assert.equal(withholdLearned(ceilingFlag(STRICT), learned).keep.length, 0);

  const raised = STRICT.replace("Maximum 0.5 ETH", "Maximum 1 ETH");
  assert.equal(withholdLearned(ceilingFlag(raised), learned).keep.length, 1);
});

atest("a cleared ceiling covers any amount over it, not just the one judged", async () => {
  // If 2 ETH over a 0.5 cap is within the mandate then so is 3, and keying on
  // the amount would re-file the identical argument for every new number.
  const f = (wei) => flagsFor({ ...rowOf(SWAP), value: String(wei) }, STRICT, "ethereum")
    .filter((x) => x.rule === "over-value-ceiling");
  const twoEth = reasonText(f(2n * 10n ** 18n));
  const twoEthRow = { ...rowOf(SWAP), value: String(2n * 10n ** 18n) };
  const learned = await learn([settled(7, "COMPLIANT", twoEth), settled(8, "COMPLIANT", twoEth)],
    { rows: { 7: twoEthRow, 8: twoEthRow } });
  assert.equal(withholdLearned(f(3n * 10n ** 18n), learned).keep.length, 0);
});

atest("a human's free-text reason teaches the bot nothing", async () => {
  // Learning is symmetric parsing of the bot's own sentences. Anything it
  // cannot read back is never learned from and never withholds anything.
  const words = "This looks like it broke the rules to me, honestly.";
  const learned = await learn([settled(7, "COMPLIANT", words), settled(8, "COMPLIANT", words)]);
  assert.equal(learned.size, 0);
});

test("an unreadable accusation is never withheld", () => {
  const learned = new Map([["unlisted-token|ETH,USDC|WFC", { rulings: 2, first: 7, last: 9 }]]);
  const odd = [{ tx_hash: "0x1", rule: "custom", reason: "Something a person typed." }];
  assert.equal(withholdLearned(odd, learned).keep.length, 1);
});

test("a reason truncated at 300 characters does not invent a cleared token", () => {
  // reasonText cuts at 297 and appends "..." — a half-written accusation must
  // not become a key, so the incomplete sentence is dropped.
  const long = reasonText([
    { tx_hash: "0x1", rule: "pad", reason: "A".repeat(280) + "." },
    { tx_hash: "0x1", rule: "unlisted-token",
      reason: "The mandate names ETH, USDC but this transaction moved WFC." },
  ]);
  assert.ok(long.endsWith("..."), "the fixture must actually be truncated");
  for (const sig of reasonSignatures(long)) {
    assert.ok(!sig.startsWith("unlisted-token|"), `invented a key from cut text: ${sig}`);
  }
});

atest("repeated verdicts collapse to one key that counts them all", async () => {
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn([4, 9, 12].map((id) => settled(id, "COMPLIANT", text)));
  assert.equal(learned.size, 1);
  const { withheld } = withholdLearned(flagsFor(row, STRICT, "ethereum"), learned);
  assert.equal(withheld[0].cleared_by, 4);
  assert.equal(withheld[0].rulings, 3);
});

atest("learning never throws on a malformed history", async () => {
  const bad = [null, undefined, {}, { verdict: "COMPLIANT" },
    { verdict: "COMPLIANT", reason: null }, { verdict: null, reason: 42 }];
  try { assert.equal((await learn(bad)).size, 0); }
  catch (e) { assert.fail(`threw on a malformed history: ${e.message}`); }
  for (const notAList of [null, undefined, "nope", 7]) {
    try { assert.equal((await learn(notAList)).size, 0); }
    catch (e) { assert.fail(`threw on ${String(notAList)}: ${e.message}`); }
  }
});

// ── corroboration: a reason string is a claim, not evidence ────────────────
//
// THE ATTACK, stated as tests. The accusation the contract stores is free text
// and nothing binds it to the transaction it describes, so anyone could copy
// the bot's own published sentence onto a harmless transfer and collect a
// COMPLIANT verdict the validators were right to give. Two of those used to
// hand the bot a standing order to ignore that pattern on that agent — for
// about 0.03 GEN, since most of a forfeited stake returns to the operator's
// own bond.
//
// A clearance now counts only if the bot, re-reading the transaction the
// challenge actually named, derives the same key from the record.

/** A transaction that breaches nothing: a plain transfer, no token movement. */
const HARMLESS = {
  ...rowOf(SWAP), value: "0", transfers: [],
  to: "0x" + "e".repeat(40), toIsContract: false, toIsVerified: true, toIsScam: false,
};

atest("a forged reason on a harmless transaction teaches the bot NOTHING", async () => {
  const row = rowOf(SWAP);
  const forged = wouldFile(row, STRICT);       // the bot's own sentence, verbatim
  const learned = await learn(
    [settled(7, "COMPLIANT", forged), settled(8, "COMPLIANT", forged)],
    { rows: { 7: HARMLESS, 8: HARMLESS } });
  assert.equal(learned.size, 0, "a fabricated clearance was learned");
  // And the real violation is still challenged.
  assert.equal(withholdLearned(flagsFor(row, STRICT, "ethereum"), learned).keep.length, 1);
});

atest("one forged clearance cannot top up one genuine one", async () => {
  // The threshold must not be reachable by mixing a real ruling with a fake.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn(
    [settled(7, "COMPLIANT", text), settled(8, "COMPLIANT", text)],
    { rows: { 7: row, 8: HARMLESS } });
  assert.equal(learned.size, 0, "one genuine ruling is not LEARN_AFTER");
});

atest("a genuine pattern cleared twice still stands the bot down", async () => {
  // The fix must not cost the feature its purpose: re-litigating an argument
  // the validators have settled is a standing order to lose a stake on a
  // schedule, which is what this machinery exists to stop.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn(
    [settled(9, "COMPLIANT", text), settled(7, "COMPLIANT", text)],
    { rows: { 9: row, 7: row } });
  assert.equal(learned.size, 1);
  const { keep, withheld } = withholdLearned(flagsFor(row, STRICT, "ethereum"), learned);
  assert.deepEqual(keep, []);
  assert.equal(withheld[0].cleared_by, 7);
});

atest("a clearance carries the transactions that corroborated it", async () => {
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const learned = await learn(
    [settled(7, "COMPLIANT", text), settled(8, "COMPLIANT", text)],
    { rows: { 7: row, 8: row } });
  const ruling = learned.get([...learned.keys()][0]);
  assert.deepEqual(ruling.transactions, [hashOf(7), hashOf(8)],
    "the evidence behind a stand-down must be nameable");
});

atest("two clearances of ONE transaction are not two rulings", async () => {
  // A refunded challenge releases its claim now, so the same transaction really
  // can be challenged twice. One event seen twice is not a pattern.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const history = [
    { challenge_id: 7, verdict: "COMPLIANT", reason: text, injection_flagged: false, tx_hash: hashOf(1) },
    { challenge_id: 8, verdict: "COMPLIANT", reason: text, injection_flagged: false, tx_hash: hashOf(1) },
  ];
  const learned = await learn(history, { rows: { 1: row } });
  assert.equal(learned.size, 0);
});

atest("a challenge with no transaction hash teaches nothing", async () => {
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  for (const bad of [undefined, null, "", "not-a-hash", "0x" + "a".repeat(63)]) {
    const history = [7, 8].map((id) => ({
      challenge_id: id, verdict: "COMPLIANT", reason: text,
      injection_flagged: false, tx_hash: bad,
    }));
    assert.equal((await learn(history, { rows: { 7: row, 8: row } })).size, 0,
      `tx_hash ${JSON.stringify(bad)} must teach nothing`);
  }
});

atest("an unreadable transaction is not a clearance", async () => {
  // The safe direction: a network failure costs a stake, while treating it as a
  // clearance would silence the watchdog on the strength of an outage.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const history = [settled(7, "COMPLIANT", text), settled(8, "COMPLIANT", text)];

  const missing = await learnedFrom(history, STRICT, "ethereum", async () => null);
  assert.equal(missing.size, 0, "a 404 must not clear anything");

  const throws = await learnedFrom(history, STRICT, "ethereum", async () => {
    throw new Error("explorer unavailable");
  });
  assert.equal(throws.size, 0, "a fetch failure must not clear anything");
});

atest("corroboration is bounded per agent", async () => {
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  let fetches = 0;
  const history = Array.from({ length: CORROBORATE_MAX * 3 },
    (_, i) => settled(i, "COMPLIANT", text));
  await learnedFrom(history, STRICT, "ethereum", async () => { fetches++; return row; });
  assert.ok(fetches <= CORROBORATE_MAX,
    `one agent's history spent ${fetches} fetches, over the ${CORROBORATE_MAX} ceiling`);
});

atest("a VIOLATION still vetoes without needing to be corroborated", async () => {
  // A proven breach can only ever make the bot keep looking, so an unreadable
  // transaction must not be able to suppress it.
  const row = rowOf(SWAP);
  const text = wouldFile(row, STRICT);
  const history = [
    settled(1, "COMPLIANT", text), settled(2, "COMPLIANT", text),
    settled(3, "VIOLATION", text),
  ];
  const learned = await learn(history, { rows: { 1: row, 2: row, 3: HARMLESS } });
  assert.equal(learned.size, 0, "a proven violation must veto regardless");
});

for (const [name, fn] of deferred) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}\n     ${String(e.message).split("\n")[0]}`); }
}

console.log(`\npatrol heuristics: ${passed} passed, ${failed} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✘ ${f}`);
  process.exit(1);
}
