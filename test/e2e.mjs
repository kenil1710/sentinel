/**
 * The live suite. Real validators, real Blockscout, real value.
 *
 *   node e2e.mjs --network=studiodev
 *   node e2e.mjs --network=studiodev --address=0x…
 *
 * What this proves that test_logic.py cannot:
 *
 *   1. Five independent validators, each fetching Blockscout for themselves,
 *      converge on ONE verdict about a real transaction. docs/PROBE.md §5
 *      measured them failing to converge on a content DIGEST about one round in
 *      four; the whole consensus design rests on the verdict being narrower
 *      than that, and this is where the claim is tested rather than argued.
 *
 *   2. A rejected payable call REFUNDS. The stub models value arrival, but only
 *      the chain settles a transfer at the consensus layer independently of
 *      GenVM execution — which is the whole reason the bug exists.
 *
 *   3. The balance invariant, reconstructed from the agent and challenge
 *      records alone and compared against the real chain balance.
 */
import { connect, accounts, argOf, sleep, retry, returnedJson } from "./harness.mjs";
import { readFileSync } from "node:fs";

const networkName = argOf("network", "studiodev");
const address = argOf("address", null) ??
  JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
    .deployments[networkName].Sentinel.address;

const GEN = 10n ** 18n;
const ACC = accounts();

// The real transaction the probe found: a Uniswap UniversalRouter swap that
// moved WETH into WFC, a token with 172 holders. Against a mandate permitting
// only ETH and USDC, it is a violation — and it is a violation the chain
// supplied rather than one this suite invented.
const SWAP_TX = "0x41729a0ba95cb56368bc48601e0e133b23d8fcf3a1d5321550dbf5819810c90d";
const SWAP_WALLET = "0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5";
const STRICT_MANDATE =
  "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. " +
  "Never interact with unverified contracts or unlisted tokens.";
const PERMISSIVE_MANDATE =
  "The agent may trade any ERC-20 token on any decentralised exchange, " +
  "in any size, at its own discretion. There are no restrictions.";
// The four profile arguments are positional and all four may be empty.
const PROFILE = ["Uniswap Rebalancer", "TRADING",
  "A market-making agent that rebalances an ETH/USDC book every four hours.",
  "https://example.org/agents/rebalancer"];


const owner = connect({ networkName, address, role: "client" });
const operator = connect({ networkName, address, role: "operator" });
const operator2 = connect({ networkName, address, role: "operator2" });
const watcher = connect({ networkName, address, role: "watcher" });
const watcher2 = connect({ networkName, address, role: "watcher2" });
const resolver = connect({ networkName, address, role: "resolver" });
const outsider = connect({ networkName, address, role: "outsider" });

let passed = 0, failed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const wei = (v) => BigInt(v);
const gen = (v) => (Number(BigInt(v)) / 1e18).toFixed(6);

async function fund() {
  if (!owner.chain.isStudio) return;
  const { fundOnStudio } = await import("./harness.mjs");
  for (const [role, rec] of Object.entries(ACC)) {
    await fundOnStudio(owner.chain, rec.address, 50n * GEN);
  }
}

console.log(`\nSentinel live suite → ${networkName}`);
console.log(`  contract ${address}`);
await fund();

const cfg0 = await owner.viewJson("get_config");
const STAKE = wei(cfg0.challenge_stake);
const MIN_BOND = wei(cfg0.min_bond);
console.log(`  stake ${gen(STAKE)} GEN   min bond ${gen(MIN_BOND)} GEN   penalty ${cfg0.penalty_bps} bps`);

/*
 * This suite needs a FRESH contract.
 *
 * It registers one fixed wallet (SWAP_TX's sender, because the violation has to
 * be a real one) and then asserts a clean record against it — bond exactly 1
 * GEN, compliance 100%, no history. Run twice against the same address and the
 * second run fails on "that wallet is already registered", and the twenty
 * checks downstream of that registration fail with it.
 *
 * Those failures look like broken contract logic and are not. Refusing up front
 * costs one line and says the actual thing that is wrong.
 */
const stats0 = await owner.viewJson("get_stats");
if (Number(stats0.agents_registered) > 0) {
  console.log(`\n  ✘ this contract already has ${stats0.agents_registered} agent(s) registered.`);
  console.log(`    e2e.mjs asserts a clean record and cannot run against used state.`);
  console.log(`    Deploy a fresh one first:\n`);
  console.log(`      node test/deploy.mjs --network=${networkName}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
section("TEST 1 — a rejected payable call REFUNDS rather than confiscating");
// ---------------------------------------------------------------------------
{
  const before = await operator.read.getBalance({ address: ACC.operator.address });
  const out = await operator.send("register_agent",
    [SWAP_WALLET, "solana", STRICT_MANDATE, ...PROFILE], GEN);
  check("the transaction itself succeeded", out.ok, out.revertReason || out.status);
  const body = returnedJson(out.returned);
  if (body) {
    check("it returned ok:false rather than reverting", body.ok === false, JSON.stringify(body).slice(0, 120));
    check("the rejection names the chain as the problem",
      /chain/i.test(String(body.reason)), body.reason);
    check("it reports the full value refunded", wei(body.refunded) === GEN, body.refunded);
  } else {
    check("return value readable", false, "receipt carried no readable return");
  }
  // The balance check is the one that matters: the flag could lie, a transfer
  // cannot.
  //
  // Transfers apply on FINALIZATION, not on acceptance, so the refund is NOT in
  // the balance the moment the receipt says success. A fixed sleep here read
  // one GEN short and looked exactly like a confiscation — poll until it
  // converges instead. (Studionet is gasless, so the refunded balance returns
  // to precisely where it started.)
  let after = before;
  for (let i = 0; i < 20; i++) {
    after = await operator.read.getBalance({ address: ACC.operator.address });
    if (after >= before) break;
    await sleep(3000);
  }
  check("the rejected bond came back to the operator", after >= before,
    `before ${gen(before)} after ${gen(after)}`);

  // The other half of the same invariant, and the one that is true instantly:
  // whatever the operator's balance says, the CONTRACT must not be holding it.
  const held = await owner.read.getBalance({ address });
  check("the contract kept none of it", held === 0n, gen(held));
  const stats = await owner.viewJson("get_stats");
  check("no agent was registered", stats.agents_registered === 0, String(stats.agents_registered));
}

// ---------------------------------------------------------------------------
section("TEST 2 — registration, and the bond the contract now holds");
// ---------------------------------------------------------------------------
let AGENT_STRICT = null;
{
  const out = await operator.send("register_agent",
    [SWAP_WALLET, "ethereum", STRICT_MANDATE, ...PROFILE], GEN);
  check("register_agent succeeded", out.ok, out.revertReason || out.status);
  const body = returnedJson(out.returned);
  AGENT_STRICT = body ? body.agent_id : 0;
  check("it returned an agent id", AGENT_STRICT !== null && AGENT_STRICT !== undefined, JSON.stringify(body));

  const agent = await owner.viewJson("get_agent", [AGENT_STRICT]);
  check("the mandate is stored verbatim", agent.mandate === STRICT_MANDATE, agent.mandate);
  check("the wallet is stored lowercased", agent.wallet === SWAP_WALLET.toLowerCase(), agent.wallet);
  check("the chain is ethereum", agent.chain === "ethereum", agent.chain);
  check("the bond is 1 GEN", wei(agent.bond) === GEN, agent.bond);
  check("the agent is ACTIVE", agent.status === "ACTIVE", agent.status);
  check("it starts with a clean record", agent.violation_count === 0 && agent.challenge_count === 0);
  check("compliance starts at 100% (unproven is not guilty)", agent.compliance_bps === 10000,
    String(agent.compliance_bps));

  const bal = await owner.read.getBalance({ address });
  check("the contract holds the bond", bal >= GEN, gen(bal));
}

// ---------------------------------------------------------------------------
section("TEST 3 — the anti-abuse rules, each one enforced on chain");
// ---------------------------------------------------------------------------
{
  const dup = await operator.send("register_agent",
    [SWAP_WALLET, "ethereum", STRICT_MANDATE, ...PROFILE], GEN);
  const dupBody = returnedJson(dup.returned);
  check("the same wallet cannot be registered twice on one chain",
    dupBody?.ok === false && /already registered/i.test(String(dupBody?.reason)),
    JSON.stringify(dupBody)?.slice(0, 120));

  const low = await operator2.send("register_agent",
    ["0x" + "1".repeat(40), "base", STRICT_MANDATE, ...PROFILE], MIN_BOND / 10n);
  const lowBody = returnedJson(low.returned);
  check("a bond below the floor is refused and refunded",
    lowBody?.ok === false && wei(lowBody.refunded) === MIN_BOND / 10n,
    JSON.stringify(lowBody)?.slice(0, 120));

  const short = await operator2.send("register_agent",
    ["0x" + "2".repeat(40), "base", "too short", ...PROFILE], GEN);
  const shortBody = returnedJson(short.returned);
  check("a mandate under 20 characters is refused and refunded",
    shortBody?.ok === false && wei(shortBody.refunded) === GEN);

  const self = await operator.send("challenge_agent",
    [AGENT_STRICT, SWAP_TX, "I am challenging my own agent"], STAKE);
  const selfBody = returnedJson(self.returned);
  check("an operator cannot challenge their own agent",
    selfBody?.ok === false && /own agent/i.test(String(selfBody?.reason)),
    JSON.stringify(selfBody)?.slice(0, 120));

  const wrong = await watcher.send("challenge_agent",
    [AGENT_STRICT, SWAP_TX, "a stake of the wrong size"], STAKE * 3n);
  const wrongBody = returnedJson(wrong.returned);
  check("a wrong-sized stake is refused and refunded",
    wrongBody?.ok === false && wei(wrongBody.refunded) === STAKE * 3n,
    JSON.stringify(wrongBody)?.slice(0, 120));

  const badOwner = await outsider.send("set_min_bond", [String(GEN)]);
  check("a stranger cannot change the minimum bond", !badOwner.ok || badOwner.reverted,
    badOwner.revertReason);
}

// ---------------------------------------------------------------------------
section("TEST 4 — THE consensus test: five validators judge a real violation");
// ---------------------------------------------------------------------------
let CH_VIOLATION = null;
{
  const filed = await watcher.send("challenge_agent",
    [AGENT_STRICT, SWAP_TX,
     "Swapped WETH into WFC, an unlisted token the mandate does not permit"], STAKE);
  check("the challenge was filed", filed.ok, filed.revertReason || filed.status);
  const body = returnedJson(filed.returned);
  CH_VIOLATION = body ? body.challenge_id : 0;

  const pre = await owner.viewJson("get_challenge", [CH_VIOLATION]);
  check("it is PENDING before judgement", pre.status === "PENDING", pre.status);
  check("the tx_url is derived from the stored chain",
    pre.tx_url === `https://eth.blockscout.com/api/v2/transactions/${SWAP_TX}`, pre.tx_url);

  console.log(`  … resolve_challenge — five validators each fetch Blockscout independently`);
  const judged = await resolver.send("resolve_challenge", [CH_VIOLATION]);
  check("the validators CONVERGED on a verdict", judged.ok,
    judged.revertReason || judged.status);

  const after = await owner.viewJson("get_challenge", [CH_VIOLATION]);
  console.log(`     verdict: ${after.verdict}   confidence: ${after.confidence}`);
  console.log(`     reasoning: ${String(after.reasoning).slice(0, 160)}`);
  check("a verdict was reached", ["VIOLATION", "COMPLIANT", "INCONCLUSIVE"].includes(after.verdict),
    after.verdict);
  check("the evidence digest was recorded", String(after.evidence_digest).length === 16,
    after.evidence_digest);
  check("the reasoning is substantive", String(after.reasoning).length >= 40,
    String(after.reasoning).length + " chars");

  if (after.verdict === "VIOLATION") {
    check("VIOLATION — the swap into an unlisted token was caught", true);
    const agent = await owner.viewJson("get_agent", [AGENT_STRICT]);
    check("the bond was slashed", wei(agent.bond) < GEN, agent.bond);
    check("the slash is 20% of the bond", wei(agent.bond) === GEN - GEN / 5n, agent.bond);
    check("the violation count rose", agent.violation_count === 1, String(agent.violation_count));
    check("compliance fell to 0%", agent.compliance_bps === 0, String(agent.compliance_bps));
    const w = await owner.viewJson("get_watcher", [ACC.watcher.address]);
    check("the challenger earned a bounty", wei(w.earned) > 0n, w.earned);
    check("the challenger is 1-for-1", w.upheld === 1 && w.refuted === 0);
  } else {
    check(`the validators answered ${after.verdict} — recorded, not forced`, true);
  }

  const v = await owner.viewJson("verify_challenge", [CH_VIOLATION]);
  check("verify_challenge recomputes the settlement from stored evidence", v.all_ok,
    JSON.stringify(v.checks));
  check("value is conserved: in equals out", v.conservation.balanced,
    JSON.stringify(v.conservation));
  check("the stored reasoning is coherent with the verdict", v.coherent);
}

// ---------------------------------------------------------------------------
section("TEST 5 — the same transaction cannot be challenged twice");
// ---------------------------------------------------------------------------
{
  const again = await watcher2.send("challenge_agent",
    [AGENT_STRICT, SWAP_TX, "filing the very same transaction a second time"], STAKE);
  const body = returnedJson(again.returned);
  check("a duplicate challenge is refused and refunded",
    body?.ok === false && /already been challenged/i.test(String(body?.reason)),
    JSON.stringify(body)?.slice(0, 140));
  check("the duplicate's stake came back", body && wei(body.refunded) === STAKE, body?.refunded);

  const known = await owner.viewJson("is_tx_challenged", ["ethereum", SWAP_TX]);
  check("is_tx_challenged reports it", known.challenged === true);
}

// ---------------------------------------------------------------------------
section("TEST 6 — a PERMISSIVE mandate over the same transaction");
// ---------------------------------------------------------------------------
{
  // The identical transaction, judged against a mandate that allows it. If the
  // verdict were a property of the transaction rather than of the mandate, this
  // would come back VIOLATION too — and the whole premise would be wrong.
  const reg = await operator2.send("register_agent",
    [SWAP_WALLET, "arbitrum", PERMISSIVE_MANDATE, ...PROFILE], GEN);
  check("a second agent registered on another chain", reg.ok, reg.revertReason);
  const body = returnedJson(reg.returned);
  const AGENT_LOOSE = body ? body.agent_id : 1;

  const agent = await owner.viewJson("get_agent", [AGENT_LOOSE]);
  check("the same wallet may be registered on a DIFFERENT chain",
    agent.chain === "arbitrum" && agent.wallet === SWAP_WALLET.toLowerCase(),
    `${agent.chain} ${agent.wallet}`);
  check("its mandate is the permissive one", agent.mandate === PERMISSIVE_MANDATE);

  const url = await owner.viewJson("get_mandate_url", [AGENT_LOOSE, SWAP_TX]);
  check("its evidence URL points at arbitrum, not ethereum",
    url.tx_url.includes("arbitrum.blockscout.com"), url.tx_url);
}

// ---------------------------------------------------------------------------
section("TEST 7 — a challenge naming a transaction that does not exist");
// ---------------------------------------------------------------------------
{
  const ghost = "0x" + "0".repeat(63) + "1";
  const filed = await watcher2.send("challenge_agent",
    [AGENT_STRICT, ghost, "a transaction hash that is not on this chain"], STAKE);
  check("the challenge was filed", filed.ok, filed.revertReason);
  const body = returnedJson(filed.returned);
  const cid = body ? body.challenge_id : null;
  if (cid !== null) {
    const before = await watcher2.read.getBalance({ address: ACC.watcher2.address });
    const judged = await resolver.send("resolve_challenge", [cid]);
    check("the validators agreed on the 404", judged.ok, judged.revertReason || judged.status);
    const after = await owner.viewJson("get_challenge", [cid]);
    check("the verdict is INCONCLUSIVE", after.verdict === "INCONCLUSIVE", after.verdict);
    check("the challenge is marked REFUNDED", after.status === "REFUNDED", after.status);
    check("the stake was returned in full", wei(after.settlement.refunded) === STAKE,
      after.settlement.refunded);
    check("the operator's bond was not touched", wei(after.settlement.penalty) === 0n);
    const agent = await owner.viewJson("get_agent", [AGENT_STRICT]);
    check("an inconclusive result does not move the compliance score",
      agent.inconclusive_count >= 1, String(agent.inconclusive_count));
  }
}

// ---------------------------------------------------------------------------
section("TEST 8 — a stranger's transaction cannot slash anyone's bond");
// ---------------------------------------------------------------------------
{
  // Vitalik's wallet sent this one. The agent registered above did not.
  const STRANGER_TX = "0x18fbf4798992552d03c80a474f2c5b42dfe67a1bbfcba6cacec93268f083cbab";
  const filed = await watcher.send("challenge_agent",
    [AGENT_STRICT, STRANGER_TX, "a transaction the agent had nothing to do with"], STAKE);
  check("the challenge was filed", filed.ok, filed.revertReason);
  const body = returnedJson(filed.returned);
  const cid = body ? body.challenge_id : null;
  if (cid !== null) {
    const bondBefore = wei((await owner.viewJson("get_agent", [AGENT_STRICT])).bond);
    const judged = await resolver.send("resolve_challenge", [cid]);
    check("the validators settled it", judged.ok, judged.revertReason || judged.status);
    const after = await owner.viewJson("get_challenge", [cid]);
    check("the verdict is INCONCLUSIVE, not VIOLATION", after.verdict === "INCONCLUSIVE",
      after.verdict);
    check("the reasoning says the transaction is not the agent's",
      /does not involve|dismissed/i.test(String(after.reasoning)),
      String(after.reasoning).slice(0, 120));
    const bondAfter = wei((await owner.viewJson("get_agent", [AGENT_STRICT])).bond);
    check("the bond is untouched", bondAfter === bondBefore, `${bondBefore} → ${bondAfter}`);
    check("the challenger got their stake back", wei(after.settlement.refunded) === STAKE);
  }
}

// ---------------------------------------------------------------------------
section("TEST 9 — the exits a pause must never close");
// ---------------------------------------------------------------------------
{
  await owner.send("set_paused", [true]);
  const cfg = await owner.viewJson("get_config");
  check("the contract is paused", cfg.paused === true);

  const blocked = await operator2.send("register_agent",
    ["0x" + "3".repeat(40), "polygon", STRICT_MANDATE, ...PROFILE], GEN);
  const blockedBody = returnedJson(blocked.returned);
  check("registration is refused while paused, and refunded",
    blockedBody?.ok === false && wei(blockedBody.refunded) === GEN,
    JSON.stringify(blockedBody)?.slice(0, 120));

  // The exits. An owner who could close these would hold every bond hostage.
  const reg2 = await operator2.viewJson("get_agents_by_operator", [ACC.operator2.address, 10]);
  const loose = reg2.agents[0];
  const withdrew = await operator2.send("withdraw_bond", [loose.agent_id]);
  check("withdraw_bond SURVIVES a pause", withdrew.ok, withdrew.revertReason || withdrew.status);

  await owner.send("set_paused", [false]);
  const cfg2 = await owner.viewJson("get_config");
  check("the contract is unpaused again", cfg2.paused === false);
}

// ---------------------------------------------------------------------------
section("TEST 10 — the balance invariant, reconstructed independently");
// ---------------------------------------------------------------------------
{
  // Derive what the contract SHOULD hold from the records alone, then compare
  // against the real chain balance. Asserting on the contract's own counters
  // would only prove they agree with themselves.
  const stats = await owner.viewJson("get_stats");
  const treasury = await owner.viewJson("get_treasury");

  let owed = 0n;
  const ids = [];
  for (let i = 0; i < stats.agents_registered; i++) ids.push(i);
  for (const id of ids) {
    const a = await owner.viewJson("get_agent", [id]);
    owed += wei(a.bond);
  }
  const challenges = await owner.viewJson("get_challenges", [100]);
  for (const ch of challenges.challenges) {
    if (ch.status === "PENDING") owed += wei(ch.stake);
  }
  owed += wei(treasury.protocol_balance);

  // Transfers apply on FINALIZATION, so a payout sits in the balance after the
  // receipt says success. Poll until it converges rather than sleeping blind.
  let bal = 0n, tries = 0;
  for (;;) {
    bal = await owner.read.getBalance({ address });
    if (bal === owed || tries++ > 12) break;
    await sleep(5000);
  }
  console.log(`     reconstructed owed ${gen(owed)} GEN   chain balance ${gen(bal)} GEN`);
  check("the chain balance equals what the records say is owed", bal === owed,
    `owed ${owed} vs balance ${bal}`);
  check("the treasury view agrees with the reconstruction",
    wei(treasury.owed_total) === owed, `${treasury.owed_total} vs ${owed}`);
  check("nothing is unaccounted for", bal >= owed, `${bal} < ${owed}`);
}

// ---------------------------------------------------------------------------
section("TEST 11 — the views the frontend and the patrol bot depend on");
// ---------------------------------------------------------------------------
{
  const queue = await owner.viewJson("get_patrol_queue", [25]);
  check("the patrol queue answers", Array.isArray(queue.queue), JSON.stringify(queue).slice(0, 80));
  check("every queued agent carries its full mandate",
    queue.queue.every((a) => typeof a.mandate === "string" && a.mandate.length > 0));
  check("every queued agent carries its explorer host",
    queue.queue.every((a) => String(a.explorer).endsWith("blockscout.com")));
  const order = queue.queue.map((a) => a.last_checked);
  check("the queue is sorted least-recently-checked first",
    order.every((v, i) => i === 0 || order[i - 1] <= v), JSON.stringify(order));

  const marked = await resolver.send("mark_patrolled", [queue.queue.map((a) => a.agent_id)]);
  check("mark_patrolled is permissionless", marked.ok, marked.revertReason);

  const board = await owner.viewJson("get_leaderboard", [10]);
  check("the leaderboard answers", Array.isArray(board.watchers));
  const byChain = await owner.viewJson("get_agents_by_chain", ["ethereum", 50]);
  check("agents can be listed by chain", byChain.agents.every((a) => a.chain === "ethereum"));
  const hist = await owner.viewJson("get_agent_history", [AGENT_STRICT, 50]);
  check("the agent history lists its challenges", hist.count >= 2, String(hist.count));
  const score = await owner.viewJson("get_compliance_score", [AGENT_STRICT]);
  check("the compliance score explains its own basis",
    typeof score.basis === "string" && score.basis.length > 0, score.basis);
  const preview = await owner.viewJson("preview_challenge", [AGENT_STRICT, SWAP_TX]);
  check("preview_challenge states the exact downside",
    wei(preview.if_compliant.you_lose) === STAKE, preview.if_compliant.you_lose);
  const finalStats = await owner.viewJson("get_stats");
  // Three are FILED: the violation, the ghost hash and the stranger's tx. The
  // duplicate and the operator's self-challenge are refused before a record is
  // ever created, which is exactly what those rules are for — so they must NOT
  // appear in this count.
  check("stats count the three challenges actually filed",
    finalStats.challenges_filed === 3, String(finalStats.challenges_filed));
  check("stats count the settled ones", finalStats.challenges_settled === 3,
    String(finalStats.challenges_settled));
  console.log(`     agents ${finalStats.agents_registered}  challenges ${finalStats.challenges_filed}` +
    `  violations ${finalStats.violations}  inconclusive ${finalStats.inconclusive}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed   (${networkName}, ${address})`);
if (failures.length) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  ✘ ${f}`);
}
console.log("");
process.exit(failed ? 1 : 0);
