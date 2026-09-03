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
} from "../frontend/src/lib/heuristics.ts";

const FIX = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8")).fixtures;
const SWAP = JSON.parse(FIX.uniswap_swap_eth.body);

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}\n     ${String(e.message).split("\n")[0]}`); }
}

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

console.log(`\npatrol heuristics: ${passed} passed, ${failed} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✘ ${f}`);
  process.exit(1);
}
