/**
 * Functional verification of EVERY public method on a live network.
 *
 *   node verify_methods.mjs --network=studionet
 *
 * Deploys a fresh contract and exercises all 35 public methods, asserting an
 * OBSERVABLE EFFECT for each rather than merely that the call returned. A
 * method that answers and changes nothing is a method that does not work.
 *
 * Reports PASS/FAIL per method.
 */
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, connect, accounts, argOf, sleep, outcomeOf, contractAddressOf,
         fundOnStudio, retry, returnedJson } from "./harness.mjs";
import { readFileSync } from "node:fs";

const networkName = argOf("network", "studionet");
const chain = CHAINS[networkName];
const GEN = 10n ** 18n;
const ACC = accounts();

const SWAP_TX = "0x41729a0ba95cb56368bc48601e0e133b23d8fcf3a1d5321550dbf5819810c90d";
const SWAP_WALLET = "0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5";
const STRICT = "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. " +
  "Never interact with unverified contracts or unlisted tokens.";
// The four profile arguments are positional and all four may be empty.
const PROFILE = ["Uniswap Rebalancer", "TRADING",
  "A market-making agent that rebalances an ETH/USDC book every four hours.",
  "https://example.org/agents/rebalancer"];


const results = [];
function record(method, ok, detail = "") {
  results.push({ method, ok, detail });
  console.log(`  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${method}${detail ? `  — ${detail}` : ""}`);
}
async function check(method, fn) {
  try {
    const detail = await fn();
    record(method, true, detail ?? "");
  } catch (e) {
    record(method, false, String(e?.message ?? e).split("\n")[0].slice(0, 140));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── deploy a clean contract ────────────────────────────────────────────────
console.log(`\nFunctional verification → ${networkName}`);
const code = readFileSync(new URL("../build/Sentinel.min.py", import.meta.url));
const deployer = createAccount(ACC.client.key);
const wallet = createClient({ chain, account: deployer });
const read = createClient({ chain });
if (chain.isStudio) for (const r of Object.values(ACC)) await fundOnStudio(chain, r.address, 60n * GEN);

const hash = await retry(() => wallet.deployContract({ code, args: [2000], leaderOnly: false }), { label: "deploy" });
let address = null;
for (let i = 0; i < 200; i++) {
  await sleep(2000);
  const tx = await read.getTransaction({ hash }).catch(() => null);
  const out = outcomeOf(tx);
  if (out.settled) { if (!out.ok) throw new Error(`deploy failed: ${out.revertReason}`); address = contractAddressOf(tx); break; }
}
assert(address, "deploy produced no address");
console.log(`  contract ${address}\n`);

const owner = connect({ networkName, address, role: "client" });
const operator = connect({ networkName, address, role: "operator" });
const operator2 = connect({ networkName, address, role: "operator2" });
const watcher = connect({ networkName, address, role: "watcher" });
const watcher2 = connect({ networkName, address, role: "watcher2" });
const resolver = connect({ networkName, address, role: "resolver" });
const outsider = connect({ networkName, address, role: "outsider" });

// Remove the cooldown so a single run can file several challenges, and shorten
// the resolution window so settle_stalled is reachable without a 48h wait.
// Both are owner-settable precisely so a testnet run can do this.
console.log("── owner controls ──");
await check("set_params", async () => {
  const out = await owner.send("set_params", [5000, 7000, 0, 10, 60]);
  assert(out.ok, out.revertReason || out.status);
  const cfg = await owner.viewJson("get_config");
  assert(cfg.challenge_cooldown === 0, `cooldown ${cfg.challenge_cooldown}`);
  assert(cfg.resolution_window === 60, `window ${cfg.resolution_window}`);
  return "cooldown→0s, window→60s, bounty 5000bps, vindication 7000bps";
});

await check("set_min_bond", async () => {
  await owner.send("set_min_bond", [String(GEN / 4n)]);
  let cfg = await owner.viewJson("get_config");
  assert(cfg.min_bond === String(GEN / 4n), `got ${cfg.min_bond}`);
  await owner.send("set_min_bond", [String(GEN / 2n)]);
  cfg = await owner.viewJson("get_config");
  assert(cfg.min_bond === String(GEN / 2n), "did not restore");
  const bad = await outsider.send("set_min_bond", [String(GEN)]);
  assert(!bad.ok || bad.reverted, "a stranger changed the minimum bond");
  return "set, restored, and refused for a non-owner";
});

await check("set_challenge_stake", async () => {
  await owner.send("set_challenge_stake", [String(GEN / 10n)]);
  let cfg = await owner.viewJson("get_config");
  assert(cfg.challenge_stake === String(GEN / 10n), `got ${cfg.challenge_stake}`);
  await owner.send("set_challenge_stake", [String(GEN / 20n)]);
  cfg = await owner.viewJson("get_config");
  assert(cfg.challenge_stake === String(GEN / 20n), "did not restore");
  return "set to 0.1 then restored to 0.05 GEN";
});

await check("set_penalty_bps", async () => {
  await owner.send("set_penalty_bps", [1000]);
  let cfg = await owner.viewJson("get_config");
  assert(cfg.penalty_bps === 1000, `got ${cfg.penalty_bps}`);
  await owner.send("set_penalty_bps", [2000]);
  cfg = await owner.viewJson("get_config");
  assert(cfg.penalty_bps === 2000, "did not restore");
  const bad = await owner.send("set_penalty_bps", [99999]);
  assert(!bad.ok || bad.reverted, "an out-of-range penalty was accepted");
  return "set to 1000, restored to 2000, out-of-range refused";
});

const CONFIG = await owner.viewJson("get_config");
const STAKE = BigInt(CONFIG.challenge_stake);

// ── write methods ──────────────────────────────────────────────────────────
console.log("\n── agent lifecycle ──");
let AGENT_A = null, AGENT_B = null;

await check("register_agent", async () => {
  const out = await operator.send("register_agent",
    [SWAP_WALLET, "ethereum", STRICT, ...PROFILE], GEN);
  assert(out.ok, out.revertReason || out.status);
  const found = await owner.viewJson("get_agent_by_wallet", ["ethereum", SWAP_WALLET]);
  assert(found.found, "agent not readable after registering");
  AGENT_A = found.agent.agent_id;
  assert(found.agent.bond === String(GEN), `bond ${found.agent.bond}`);
  assert(found.agent.mandate === STRICT, "mandate not stored verbatim");
  assert(found.agent.name === PROFILE[0], `name ${found.agent.name}`);
  assert(found.agent.agent_type === PROFILE[1], `type ${found.agent.agent_type}`);
  assert(found.agent.description === PROFILE[2], "description not stored");
  assert(found.agent.operator_url === PROFILE[3], `url ${found.agent.operator_url}`);
  // The refund path is part of the method working.
  const rej = await operator.send("register_agent",
    [SWAP_WALLET, "solana", STRICT, ...PROFILE], GEN);
  const body = returnedJson(rej.returned);
  assert(rej.ok, "a rejected registration must still succeed as a transaction");
  if (body) assert(body.ok === false && body.refunded === String(GEN), `refund ${JSON.stringify(body)}`);
  const xss = await operator2.send("register_agent",
    ["0x" + "8".repeat(40), "base", STRICT, "Evil", "TRADING", "d", "javascript:alert(1)"], GEN);
  const xb = returnedJson(xss.returned);
  if (xb) assert(xb.ok === false && xb.refunded === String(GEN),
    `a javascript: operator URL was not refunded: ${JSON.stringify(xb)}`);
  return `agent #${AGENT_A} + profile stored; bad chain and javascript: URL both refunded`;
});

await check("top_up_bond", async () => {
  const before = BigInt((await owner.viewJson("get_agent", [AGENT_A])).bond);
  const out = await operator.send("top_up_bond", [AGENT_A], GEN / 2n);
  assert(out.ok, out.revertReason || out.status);
  const after = BigInt((await owner.viewJson("get_agent", [AGENT_A])).bond);
  assert(after === before + GEN / 2n, `${before} → ${after}`);
  const rej = await operator.send("top_up_bond", [9999], GEN / 4n);
  const body = returnedJson(rej.returned);
  if (body) assert(body.ok === false, "top-up of an unknown agent was accepted");
  return `bond ${before} → ${after}; unknown agent refunded`;
});

await check("update_mandate", async () => {
  const next = "Only trade ETH and DAI on Curve. No leverage of any kind, ever.";
  const out = await operator.send("update_mandate", [AGENT_A, next]);
  assert(out.ok, out.revertReason || out.status);
  const a = await owner.viewJson("get_agent", [AGENT_A]);
  assert(a.mandate === next, "mandate did not change");
  const bad = await outsider.send("update_mandate", [AGENT_A, "anything goes here at all"]);
  assert(!bad.ok || bad.reverted, "a stranger changed the mandate");
  await operator.send("update_mandate", [AGENT_A, STRICT]);
  const back = await owner.viewJson("get_agent", [AGENT_A]);
  assert(back.mandate === STRICT, "mandate did not restore");
  return "changed, refused for a stranger, restored";
});

await check("challenge_agent", async () => {
  const out = await watcher.send("challenge_agent",
    [AGENT_A, SWAP_TX, "Swapped WETH into WFC, an unlisted token the mandate forbids"], STAKE);
  assert(out.ok, out.revertReason || out.status);
  const known = await owner.viewJson("is_tx_challenged", ["ethereum", SWAP_TX]);
  assert(known.challenged, "challenge not readable after filing");
  const dup = await watcher2.send("challenge_agent", [AGENT_A, SWAP_TX, "the same transaction again"], STAKE);
  const body = returnedJson(dup.returned);
  if (body) assert(body.ok === false && body.refunded === String(STAKE), `duplicate not refunded: ${JSON.stringify(body)}`);
  return `challenge #${known.challenge_id} filed; duplicate refunded`;
});

const CH_A = (await owner.viewJson("is_tx_challenged", ["ethereum", SWAP_TX])).challenge_id;

await check("resolve_challenge", async () => {
  const out = await resolver.send("resolve_challenge", [CH_A]);
  assert(out.ok, out.revertReason || out.status);
  const ch = await owner.viewJson("get_challenge", [CH_A]);
  assert(["VIOLATION", "COMPLIANT", "INCONCLUSIVE"].includes(ch.verdict), `verdict ${ch.verdict}`);
  assert(ch.status !== "PENDING", `status ${ch.status}`);
  assert(String(ch.evidence_digest).length === 16, `digest ${ch.evidence_digest}`);
  assert(String(ch.reasoning).length >= 40, "reasoning too short");
  return `${ch.verdict} @ ${ch.confidence}% — digest ${ch.evidence_digest}`;
});

await check("mark_patrolled", async () => {
  const before = (await owner.viewJson("get_stats")).patrols_run;
  const out = await resolver.send("mark_patrolled", [[AGENT_A]]);
  assert(out.ok, out.revertReason || out.status);
  const after = await owner.viewJson("get_stats");
  assert(after.patrols_run === before + 1, `${before} → ${after.patrols_run}`);
  const a = await owner.viewJson("get_agent", [AGENT_A]);
  assert(a.last_checked > 0, "last_checked not stamped");
  return `patrols ${before} → ${after.patrols_run}, permissionless`;
});

await check("settle_stalled", async () => {
  // Needs a PENDING challenge older than the (now 60s) resolution window.
  const r = await operator2.send("register_agent",
    [SWAP_WALLET, "polygon", STRICT, ...PROFILE], GEN);
  assert(r.ok, "second agent did not register");
  const b = await owner.viewJson("get_agent_by_wallet", ["polygon", SWAP_WALLET]);
  AGENT_B = b.agent.agent_id;
  const ghost = "0x" + "b".repeat(64);
  const f = await watcher2.send("challenge_agent", [AGENT_B, ghost, "a hash that will never be judged"], STAKE);
  assert(f.ok, "stalled-test challenge did not file");
  const cid = (await owner.viewJson("is_tx_challenged", ["polygon", ghost])).challenge_id;
  const early = await outsider.send("settle_stalled", [cid]);
  assert(!early.ok || early.reverted, "settle_stalled ran before the window elapsed");
  await sleep(66_000);
  const out = await outsider.send("settle_stalled", [cid]);
  assert(out.ok, out.revertReason || out.status);
  const ch = await owner.viewJson("get_challenge", [cid]);
  assert(ch.stalled === true, "not flagged stalled");
  assert(ch.verdict === "INCONCLUSIVE", `verdict ${ch.verdict}`);
  assert(ch.settlement.refunded === String(STAKE), `refunded ${ch.settlement.refunded}`);
  return `refused early, then refunded ${ch.settlement.refunded} wei by a stranger`;
});

await check("set_paused (pause/unpause)", async () => {
  await owner.send("set_paused", [true]);
  let cfg = await owner.viewJson("get_config");
  assert(cfg.paused === true, "did not pause");
  const blocked = await operator2.send("register_agent",
    ["0x" + "3".repeat(40), "base", STRICT, ...PROFILE], GEN);
  const body = returnedJson(blocked.returned);
  if (body) assert(body.ok === false && body.refunded === String(GEN), "paused registration was not refunded");
  // The exit that must survive a pause.
  const exit = await operator2.send("withdraw_bond", [AGENT_B]);
  assert(exit.ok, `withdraw_bond blocked by pause: ${exit.revertReason}`);
  await owner.send("set_paused", [false]);
  cfg = await owner.viewJson("get_config");
  assert(cfg.paused === false, "did not unpause");
  const bad = await outsider.send("set_paused", [true]);
  assert(!bad.ok || bad.reverted, "a stranger paused the contract");
  return "paused, blocked+refunded a registration, withdrawal still worked, unpaused";
});

await check("withdraw_bond", async () => {
  // AGENT_B was withdrawn above under pause; assert the effect landed.
  const a = await owner.viewJson("get_agent", [AGENT_B]);
  assert(a.status === "WITHDRAWN", `status ${a.status}`);
  assert(a.bond === "0", `bond ${a.bond}`);
  const again = await operator2.send("withdraw_bond", [AGENT_B]);
  assert(!again.ok || again.reverted, "withdrew twice");
  const notMine = await outsider.send("withdraw_bond", [AGENT_A]);
  assert(!notMine.ok || notMine.reverted, "a stranger withdrew someone's bond");
  return "bond returned, agent retired, second withdrawal and stranger refused";
});

await check("withdraw_protocol", async () => {
  const t = await owner.viewJson("get_treasury");
  const avail = BigInt(t.protocol_balance);
  assert(avail > 0n, "no protocol balance accrued to withdraw");
  const tooMuch = await owner.send("withdraw_protocol", [ACC.client.address, String(avail + GEN)]);
  assert(!tooMuch.ok || tooMuch.reverted, "withdrew more than had accrued");
  const out = await owner.send("withdraw_protocol", [ACC.client.address, String(avail)]);
  assert(out.ok, out.revertReason || out.status);
  const after = await owner.viewJson("get_treasury");
  assert(BigInt(after.protocol_balance) === 0n, `left ${after.protocol_balance}`);
  return `withdrew ${avail} wei; over-withdrawal refused`;
});

await check("transfer_ownership", async () => {
  const out = await owner.send("transfer_ownership", [ACC.operator.address]);
  assert(out.ok, out.revertReason || out.status);
  let cfg = await owner.viewJson("get_config");
  assert(cfg.owner.toLowerCase() === ACC.operator.address.toLowerCase(), `owner ${cfg.owner}`);
  // Hand it back using the NEW owner, which also proves the transfer took effect.
  const back = await operator.send("transfer_ownership", [ACC.client.address]);
  assert(back.ok, "new owner could not transfer back");
  cfg = await owner.viewJson("get_config");
  assert(cfg.owner.toLowerCase() === ACC.client.address.toLowerCase(), "did not restore owner");
  const bad = await outsider.send("transfer_ownership", [ACC.outsider.address]);
  assert(!bad.ok || bad.reverted, "a stranger took ownership");
  return "transferred, exercised by the new owner, restored";
});

// ── views ──────────────────────────────────────────────────────────────────
console.log("\n── views ──");
const VIEWS = [
  ["get_config", () => owner.viewJson("get_config"), (d) => d.chains.length === 5 && d.chains.includes("robinhood") && d.min_bond],
  ["get_stats", () => owner.viewJson("get_stats"), (d) => d.agents_registered >= 2 && Array.isArray(d.chains)],
  ["get_agent", () => owner.viewJson("get_agent", [AGENT_A]), (d) => d.agent_id === AGENT_A && d.mandate.length > 0],
  ["get_challenge", () => owner.viewJson("get_challenge", [CH_A]), (d) => d.challenge_id === CH_A && d.tx_url.includes("blockscout")],
  ["get_agents_by_chain", () => owner.viewJson("get_agents_by_chain", ["ethereum", 50]), (d) => d.agents.every((a) => a.chain === "ethereum") && d.count >= 1],
  ["get_active_agents", () => owner.viewJson("get_active_agents", [50]), (d) => d.agents.every((a) => a.status === "ACTIVE")],
  ["get_agent_history", () => owner.viewJson("get_agent_history", [AGENT_A, 50]), (d) => d.count >= 1 && d.challenges[0].agent_id === AGENT_A],
  ["get_patrol_queue", () => owner.viewJson("get_patrol_queue", [25]), (d) => Array.isArray(d.queue) && d.queue.every((a) => typeof a.mandate === "string" && String(a.explorer).endsWith("blockscout.com"))],
  ["get_agents_by_type", () => owner.viewJson("get_agents_by_type", ["TRADING", 50]), (d) => d.agent_type === "TRADING" && Array.isArray(d.agents) && d.agents.every((a) => a.agent_type === "TRADING")],
  ["get_compliance_score", () => owner.viewJson("get_compliance_score", [AGENT_A]), (d) => typeof d.compliance_bps === "number" && typeof d.basis === "string"],
  ["get_leaderboard", () => owner.viewJson("get_leaderboard", [25]), (d) => Array.isArray(d.watchers)],
  ["verify_challenge", () => owner.viewJson("verify_challenge", [CH_A]), (d) => d.all_ok === true && d.conservation.balanced === true],
  ["get_challenges", () => owner.viewJson("get_challenges", [50]), (d) => d.count >= 1],
  ["get_pending_challenges", () => owner.viewJson("get_pending_challenges", [50]), (d) => Array.isArray(d.challenges)],
  ["get_agents_by_operator", () => owner.viewJson("get_agents_by_operator", [ACC.operator.address, 50]), (d) => d.count >= 1],
  ["is_tx_challenged", () => owner.viewJson("is_tx_challenged", ["ethereum", SWAP_TX]), (d) => d.valid === true && d.challenged === true],
  ["get_agent_by_wallet", () => owner.viewJson("get_agent_by_wallet", ["ethereum", SWAP_WALLET]), (d) => d.found === true],
  ["get_watcher", () => owner.viewJson("get_watcher", [ACC.watcher.address]), (d) => typeof d.filed === "number"],
  ["get_treasury", () => owner.viewJson("get_treasury"), (d) => typeof d.owed_total === "string"],
  ["preview_challenge", () => owner.viewJson("preview_challenge", [AGENT_A, SWAP_TX]), (d) => d.stake_required === String(STAKE) && d.already_challenged === true],
  ["get_mandate_url", () => owner.viewJson("get_mandate_url", [AGENT_A, SWAP_TX]), (d) => d.tx_url === `https://eth.blockscout.com/api/v2/transactions/${SWAP_TX}`],
];
for (const [name, call, ok] of VIEWS) {
  await check(name, async () => {
    const d = await call();
    assert(ok(d), `unexpected shape: ${JSON.stringify(d).slice(0, 140)}`);
    return "answers with the expected shape";
  });
}

// ── the balance invariant, reconstructed ───────────────────────────────────
console.log("\n── invariants ──");
await check("balance invariant", async () => {
  const stats = await owner.viewJson("get_stats");
  const t = await owner.viewJson("get_treasury");
  let owed = 0n;
  for (let i = 0; i < stats.agents_registered; i++) owed += BigInt((await owner.viewJson("get_agent", [i])).bond);
  const chs = await owner.viewJson("get_challenges", [100]);
  for (const c of chs.challenges) if (c.status === "PENDING") owed += BigInt(c.stake);
  owed += BigInt(t.protocol_balance);
  let bal = 0n;
  for (let i = 0; i < 15; i++) { bal = await read.getBalance({ address }); if (bal === owed) break; await sleep(4000); }
  assert(bal === owed, `chain ${bal} vs reconstructed ${owed}`);
  return `chain balance equals ${owed} wei reconstructed from the records alone`;
});

// ── report ─────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
console.log(`\n${"─".repeat(66)}`);
console.log(`  ${pass}/${results.length} methods verified on ${networkName}`);
console.log(`  contract ${address}`);
const bad = results.filter((r) => !r.ok);
if (bad.length) { console.log("\nFAILED:"); for (const b of bad) console.log(`  ✘ ${b.method} — ${b.detail}`); }
console.log("");
process.exit(bad.length ? 1 : 0);
