/**
 * The patrol bot's pure parts, against the same Blockscout documents the
 * contract suite uses:
 *   - lib/kind.ts produces EXACTLY the contract's _tx_kind (a precedent key is
 *     only useful if the bot and the contract spell the kind the same way);
 *   - lib/heuristics.ts reads the five clause shapes and trusts addresses only.
 *
 *   node --experimental-strip-types --no-warnings test/test_patrol.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const { kindOfDoc, txKind, valueBucket } = await import(root + "frontend/src/lib/kind.ts");
const { flagsFor, clauseRules } = await import(root + "frontend/src/lib/heuristics.ts");
const docs = JSON.parse(readFileSync(root + "test/fixtures/blockscout.json", "utf8")).docs;

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };

const py = (doc) => execFileSync("python3", ["-c", `
import sys, json
sys.path.insert(0, "${root}test")
import fixtures as F
print(F.C._tx_kind(F.C._core(json.loads(sys.stdin.read()))))`], { input: JSON.stringify(doc) }).toString().trim();

for (const name of ["uniswap_swap_eth", "arbitrum_tx", "payout_batch_eth"]) {
  t(`kind parity on ${name}`, () => {
    const doc = JSON.parse(docs[name].body);
    assert.equal(kindOfDoc(doc), py(doc));
  });
}
t("kind parity on a plain value transfer", () => {
  const doc = { hash: "0x" + "1".repeat(64), to: { hash: "0xAbC0000000000000000000000000000000000001" }, raw_input: "0x", value: "600000000000000000", token_transfers: [] };
  assert.equal(kindOfDoc(doc), py(doc));
  assert.equal(kindOfDoc(doc), "send:0xabc0000000000000000000000000000000000001:0x::lt1");
});
t("value buckets", () => {
  assert.deepEqual(["0", "1", "10000000000000000", "999999999999999999", "1000000000000000000", "10000000000000000000"].map(valueBucket),
    ["0", "lt0.01", "lt0.1", "lt1", "lt10", "ge10"]);
  assert.equal(txKind({ to: "", created: "0xC", rawInput: "0x60806040", value: "0", tokens: ["0xB", "0xa", "0xb"] }), "call:0xc:0x60806040:0xa,0xb:0");
});

const W = "0x28c6c06298d514db089934071355e5743bf21d60";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7", USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const row = (o) => ({ hash: "0x" + "a".repeat(64), epoch: 1, from: W, to: USDT, created: "", value: "0", rawInput: "0xa9059cbb", status: "ok", transfers: [], ...o });
const C = (id, severity, text) => ({ id, severity, text });

t("clause shapes", () => {
  assert.deepEqual(clauseRules(`Only call the USDC token contract ${USDC}.`), ["only-call"]);
  assert.deepEqual(clauseRules(`Only send the stablecoins USDT ${USDT} and USDC ${USDC}.`), ["only-tokens"]);
  assert.deepEqual(clauseRules("Only move USDT and USDC."), ["only-tokens"]);
  assert.deepEqual(clauseRules(`Never call the batch executor contract 0xee7ae85f2fe2239e27d9c1e23fffe168d63b4055.`), ["never-call"]);
  assert.deepEqual(clauseRules("Never send more than 0.5 ETH of native value in one transaction."), ["max-native"]);
  assert.deepEqual(clauseRules("Never send native ETH."), ["no-native"]);
  assert.deepEqual(clauseRules("Never pay a customer the exchange would consider high-risk."), []);
});
t("only-tokens trusts addresses, never symbols", () => {
  const listed = [C("C1", "MAJOR", `Only send the stablecoins USDT ${USDT} and USDC ${USDC}.`)];
  assert.equal(flagsFor(row({ transfers: [{ token: USDT, from: W, to: "0x1", value: "1" }] }), W, listed).flags.length, 0);
  const spoof = "0x" + "9".repeat(40);
  assert.equal(flagsFor(row({ transfers: [{ token: spoof, from: W, to: "0x1", value: "1" }] }), W, listed).flags[0].clause, "C1");
  const bySymbol = [C("C1", "MAJOR", "Only move USDT and USDC.")];
  const f = flagsFor(row({ transfers: [{ token: USDT, from: W, to: "0x1", value: "1" }] }), W, bySymbol).flags;
  assert.equal(f.length, 1);
  assert.match(f[0].reason, /symbol only/);
  assert.equal(f[0].precedentEligible, true);
  assert.equal(flagsFor(row({ transfers: null }), W, bySymbol).needsTransfers, true);
});
t("incoming transfers are not the agent sending", () => {
  const listed = [C("C1", "MAJOR", `Only send the stablecoins USDT ${USDT} and USDC ${USDC}.`)];
  assert.equal(flagsFor(row({ from: "0x1", transfers: [{ token: "0x" + "9".repeat(40), from: "0x1", to: W, value: "1" }] }), W, listed).flags.length, 0);
});
t("amount rules never defer to a precedent, and the most severe flag comes first", () => {
  const clauses = [C("C1", "MINOR", "Never send more than 0.5 ETH of native value in one transaction."),
    C("C2", "CRITICAL", "Never call the contract 0x32b7d5457628c5bc187f03a33d51d3ec3ee2b844.")];
  const f = flagsFor(row({ to: "0x32b7d5457628c5bc187f03a33d51d3ec3ee2b844", value: "700000000000000000", rawInput: "0x348011ae" }), W, clauses).flags;
  assert.deepEqual(f.map((x) => x.clause), ["C2", "C1"]);
  assert.equal(f[1].precedentEligible, false);
});
t("only-call", () => {
  const clauses = [C("C1", "MAJOR", `Only call the keeper contract 0x8853fb72d93efc186d8bb806195cbe4563261bc9.`)];
  assert.equal(flagsFor(row({ to: "0x8853fb72d93efc186d8bb806195cbe4563261bc9" }), W, clauses).flags.length, 0);
  assert.equal(flagsFor(row({ to: "0xbdd46640b8000000000000000000000000000000" }), W, clauses).flags.length, 1);
});
console.log(`\n${n} patrol tests passed`);
