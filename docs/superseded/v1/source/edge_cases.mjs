/**
 * Adversarial edge cases, on a live network.
 *
 *   node edge_cases.mjs --network=studiodev
 *
 * e2e.mjs proves the happy paths and the headline rejections. This suite goes
 * after the states nobody reaches by accident: the rejections that must refund
 * rather than confiscate, the exits a pause must never close, the counters that
 * must not move when a call is turned down, and the two questions a reader can
 * only answer by watching money move twice — whether a second slash compounds
 * on the reduced bond, and whose terms apply when the owner moves a dial
 * between the filing and the judgement.
 *
 * Every agent is registered on a wallet and a transaction that REALLY EXIST on
 * a public chain and that Sentinel's own patrol flagged, so the validators are
 * judging real conduct rather than a fixture.
 */
import { createAccount, createClient } from "genlayer-js";
import { CHAINS, connect, accounts, argOf, sleep, outcomeOf, contractAddressOf,
         fundOnStudio, retry, returnedJson } from "./harness.mjs";
import { readFileSync } from "node:fs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
const GEN = 10n ** 18n;
const ACC = accounts();

// Real wallets and real transactions, taken from a live patrol dry run.
const VIOLATOR = {
  wallet: "0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5",
  chain: "ethereum",
  mandate: "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. "
    + "Never interact with unverified contracts or unlisted tokens.",
  txs: [
    "0x41729a0ba95cb56368bc48601e0e133b23d8fcf3a1d5321550dbf5819810c90d",
    "0xb283ff078fddde996c0ab62b2ce516c1be995c663b8717e1e20e38107d59cb92",
    "0xf4ea44f3dbfa87a120ef27514b7222c289e89781d837a129d901b730bd862cb8",
    "0xaeeb9e0280c59e8788095952d9d69b360423731e2f6bba8db354decad6155f63",
    "0xc1414aa9b1103332d04197ba887bcfaa82aef7cf21f7024b4780dbd42ef4f29a",
    "0x2c8696b78a24127d9d8f18be3ea4efc8e54275230f908fc8a3d3a19eb3d8fbd5",
  ],
};
const SECOND = {
  wallet: "0xaa3ab5ed0758717138acf345e2563d7588e1a3f9",
  chain: "ethereum",
  mandate: "Only hold and trade ETH and WETH. Never acquire any other token, "
    + "and never interact with an unverified contract.",
  tx: "0x588fc50f0626d28203539424080c735cd8d5cdf25a545e4c0ef45ea7522a98d5",
};
const PROFILE = ["Edge Case Agent", "TRADING", "Registered by the edge-case suite.", "https://example.org/e"];

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  \x1b[32m✔\x1b[0m ${name}${detail ? `  — ${detail}` : ""}`); }
  else { fail++; failures.push(name); console.log(`  \x1b[31m✘\x1b[0m ${name}${detail ? `  — ${detail}` : ""}`); }
}
const sec = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ── deploy ─────────────────────────────────────────────────────────────────
console.log(`\nEdge cases → ${networkName}`);
const code = readFileSync(new URL("../build/Sentinel.min.py", import.meta.url));
const deployer = createAccount(ACC.client.key);
const deployWallet = createClient({ chain, account: deployer });
const read = createClient({ chain });
if (chain.isStudio) for (const r of Object.values(ACC)) await fundOnStudio(chain, r.address, 80n * GEN);

const dhash = await retry(() => deployWallet.deployContract({ code, args: [2000], leaderOnly: false }), { label: "deploy" });
let address = null;
for (let i = 0; i < 200; i++) {
  await sleep(2000);
  const tx = await read.getTransaction({ hash: dhash }).catch(() => null);
  const out = outcomeOf(tx);
  if (out.settled) { address = contractAddressOf(tx); break; }
}
if (!address) { console.error("deploy never settled"); process.exit(1); }
console.log(`  contract ${address}\n`);

const owner    = connect({ networkName, address, role: "client" });
const operator = connect({ networkName, address, role: "operator" });
const other    = connect({ networkName, address, role: "operator2" });
const watcher  = connect({ networkName, address, role: "watcher" });
const watcher2 = connect({ networkName, address, role: "watcher2" });
const stranger = connect({ networkName, address, role: "outsider" });

const balanceOf = (a) => read.getBalance({ address: a });
const rejected = (out) => {
  const body = returnedJson(out);
  return { isRejection: out.ok && body?.ok === false, reason: body?.reason ?? "", refunded: body?.refunded ?? null, body };
};

/**
 * Submit a payable call and, if the TRANSPORT lost it, submit it again.
 *
 * Studionet intermittently answers `eth_sendRawTransaction` and
 * `eth_getTransactionCount` with a fetch failure. `harness.send` retries the
 * submission and then gives up with an UNSETTLED outcome rather than throwing,
 * which reaches an assertion here as "the contract did not reject this" — a red
 * check for a call the contract never saw. Retrying the whole call is the only
 * honest response: the suite is measuring the contract, not the endpoint.
 */
async function sendPayable(role, fn, args, value, attempts = 3) {
  let out = null;
  for (let i = 0; i < attempts; i++) {
    out = await role.send(fn, args, value);
    if (out.status !== "UNSETTLED" && (out.ok || out.reverted)) return out;
    console.log(`  … ${fn} was lost in transport (${out.failure ?? out.status}); resubmitting`);
    await sleep(5000);
  }
  return out;
}

// No cooldown and a 60s stall window, so the suite can exercise both without
// waiting out production defaults.
await owner.send("set_params", [5000, 7000, 0, 2, 60]);
const cfg0 = await owner.viewJson("get_config");
const STAKE = BigInt(cfg0.challenge_stake);

// ═══ 1. register_agent — every rejection refunds ═══════════════════════════
sec("1. register_agent rejections refund rather than confiscate");
{
  const cases = [
    ["a malformed wallet address", ["0xnothexatall", "ethereum", VIOLATOR.mandate, ...PROFILE], 1n * GEN],
    ["the zero address",           [ "0x0000000000000000000000000000000000000000", "ethereum", VIOLATOR.mandate, ...PROFILE], 1n * GEN],
    ["an empty mandate",           [VIOLATOR.wallet, "ethereum", "", ...PROFILE], 1n * GEN],
    ["a mandate under 20 chars",   [VIOLATOR.wallet, "ethereum", "too short", ...PROFILE], 1n * GEN],
    ["an unknown chain",           [VIOLATOR.wallet, "solana", VIOLATOR.mandate, ...PROFILE], 1n * GEN],
    ["a bond below the floor",     [VIOLATOR.wallet, "ethereum", VIOLATOR.mandate, ...PROFILE], 1n * GEN / 100n],
    ["a javascript: operator URL", [VIOLATOR.wallet, "ethereum", VIOLATOR.mandate, PROFILE[0], PROFILE[1], PROFILE[2], "javascript:alert(1)"], 1n * GEN],
  ];
  for (const [label, args, value] of cases) {
    const out = await sendPayable(operator, "register_agent", args, value);
    const r = rejected(out);
    check(`register_agent refuses ${label}`, r.isRejection, r.reason.slice(0, 68));
    check(`  …and refunds the full ${value} wei`, r.refunded === String(value), `refunded ${r.refunded}`);
  }
  const stats = await owner.viewJson("get_stats");
  check("no rejected registration created an agent", stats.agents_registered === 0,
    `agents_registered=${stats.agents_registered}`);
  const t = await owner.viewJson("get_treasury");
  check("the contract kept none of the rejected bonds", t.locked_bonds === "0" && t.total_bonded === "0");
  // Refunds apply on FINALIZATION, which lags the receipt, so this is polled.
  let held = -1n;
  for (let i = 0; i < 25; i++) { held = await balanceOf(address); if (held === 0n) break; await sleep(4000); }
  check("the contract's own balance is zero after seven refunded rejections", held === 0n,
    `${held} wei still held`);
}

// ═══ 2. a real registration, then the duplicate rule ═══════════════════════
sec("2. one registration per wallet per chain");
let AGENT = null;
{
  const out = await sendPayable(operator,"register_agent",
    [VIOLATOR.wallet, VIOLATOR.chain, VIOLATOR.mandate, ...PROFILE], 1n * GEN);
  const body = returnedJson(out);
  AGENT = body?.agent_id ?? 0;
  check("register_agent accepted a valid registration", out.ok && body?.ok === true, `agent #${AGENT}`);

  const dup = await sendPayable(other,"register_agent",
    [VIOLATOR.wallet, VIOLATOR.chain, VIOLATOR.mandate, ...PROFILE], 1n * GEN);
  const r = rejected(dup);
  check("the same wallet cannot be registered twice on one chain", r.isRejection, r.reason.slice(0, 60));
  check("  …and the duplicate's bond came back", r.refunded === String(1n * GEN));

  const cross = await sendPayable(other,"register_agent",
    [VIOLATOR.wallet, "arbitrum", VIOLATOR.mandate, ...PROFILE], 1n * GEN);
  check("the same wallet MAY be registered on a different chain", returnedJson(cross)?.ok === true);
}

// ═══ 3. challenge_agent — every rejection refunds ══════════════════════════
sec("3. challenge_agent rejections refund rather than confiscate");
{
  const cases = [
    ["a malformed transaction hash", [AGENT, "0xnope", "this hash is not a hash at all"], STAKE],
    ["an agent that does not exist", [9999, VIOLATOR.txs[0], "no such agent is registered here"], STAKE],
    ["a reason under 10 characters", [AGENT, VIOLATOR.txs[0], "short"], STAKE],
    ["a stake below the required amount", [AGENT, VIOLATOR.txs[0], "the stake here is far too small"], STAKE / 2n],
    ["a stake above the required amount", [AGENT, VIOLATOR.txs[0], "the stake here is far too large"], STAKE * 2n],
  ];
  for (const [label, args, value] of cases) {
    const out = await sendPayable(watcher, "challenge_agent", args, value);
    const r = rejected(out);
    check(`challenge_agent refuses ${label}`, r.isRejection, r.reason.slice(0, 62));
    check(`  …and refunds the full ${value} wei`, r.refunded === String(value));
  }
  const self = await sendPayable(operator,"challenge_agent",
    [AGENT, VIOLATOR.txs[0], "I am challenging my own agent to see what happens"], STAKE);
  const rs = rejected(self);
  check("an operator cannot challenge their own agent", rs.isRejection, rs.reason.slice(0, 60));
  check("  …and the self-challenge stake came back", rs.refunded === String(STAKE));

  // The PackageGuard failure mode: a counter that moves on a call that was
  // turned down. Six rejections above; none of them may be visible anywhere.
  const stats = await owner.viewJson("get_stats");
  const agent = await owner.viewJson("get_agent", [AGENT]);
  check("no rejected challenge was recorded", stats.challenges_filed === 0, `challenges_filed=${stats.challenges_filed}`);
  check("no rejected challenge moved the agent's counters",
    agent.challenge_count === 0 && agent.pending_count === 0);
  const t = await owner.viewJson("get_treasury");
  check("no rejected stake is locked in the contract", t.locked_stakes === "0");
}

// ═══ 4. the pending-challenge locks ════════════════════════════════════════
sec("4. what a pending challenge freezes");
let CH1 = null;
{
  const filed = await sendPayable(watcher,"challenge_agent",
    [AGENT, VIOLATOR.txs[0], "Swapped WETH into WFC, an unlisted token the mandate forbids"], STAKE);
  CH1 = returnedJson(filed)?.challenge_id ?? 0;
  check("a valid challenge was filed", returnedJson(filed)?.ok === true, `challenge #${CH1}`);

  const upd = await operator.send("update_mandate", [AGENT, "The agent may now do absolutely anything it likes."]);
  check("update_mandate is REFUSED while a challenge is pending", upd.reverted,
    upd.revertReason.slice(0, 74));

  const wd = await operator.send("withdraw_bond", [AGENT]);
  check("withdraw_bond is REFUSED while a challenge is pending", wd.reverted,
    wd.revertReason.slice(0, 74));

  const a = await owner.viewJson("get_agent", [AGENT]);
  check("the mandate is unchanged after the refused edit", a.mandate === VIOLATOR.mandate);
  check("the bond is unchanged after the refused withdrawal", a.bond === String(1n * GEN));

  // max_pending_per_agent was set to 2 above, so the second fills the quota and
  // the third must be refused and refunded.
  const second = await sendPayable(watcher2,"challenge_agent",
    [AGENT, VIOLATOR.txs[1], "A second unlisted-token swap by the same agent wallet"], STAKE);
  check("a second challenge fits the quota", returnedJson(second)?.ok === true);
  const third = await sendPayable(watcher,"challenge_agent",
    [AGENT, VIOLATOR.txs[2], "A third unlisted-token swap, over the pending quota"], STAKE);
  const r3 = rejected(third);
  check("the pending-challenge quota is enforced", r3.isRejection, r3.reason.slice(0, 62));
  check("  …and the over-quota stake came back", r3.refunded === String(STAKE));
}

// ═══ 5. settle_stalled, and the exits a pause must never close ═════════════
sec("5. the exits a pause must never close");
{
  await owner.send("set_paused", [true]);
  const cfg = await owner.viewJson("get_config");
  check("the contract is paused", cfg.paused === true);

  const reg = await sendPayable(other,"register_agent",
    [SECOND.wallet, SECOND.chain, SECOND.mandate, ...PROFILE], 1n * GEN);
  const rr = rejected(reg);
  check("registration is refused while paused, and refunded", rr.isRejection && rr.refunded === String(1n * GEN));

  const chl = await sendPayable(watcher,"challenge_agent",
    [AGENT, VIOLATOR.txs[5], "A challenge filed while the contract is paused"], STAKE);
  const rc = rejected(chl);
  check("challenging is refused while paused, and refunded", rc.isRejection && rc.refunded === String(STAKE));

  const top = await sendPayable(other, "top_up_bond", [AGENT], 1n * GEN / 10n);
  check("top_up_bond SURVIVES a pause", returnedJson(top)?.ok === true);

  // The stall window was set to 60s; wait it out and force a refund WHILE PAUSED.
  console.log("  … waiting out the 60s resolution window");
  await sleep(66_000);
  const before = await balanceOf(watcher2.account.address);
  const CH2 = CH1 + 1;
  const st = await stranger.send("settle_stalled", [CH2]);
  check("settle_stalled SURVIVES a pause, called by a stranger", st.ok && returnedJson(st)?.ok === true,
    st.revertReason.slice(0, 70));
  // An outbound transfer applies on FINALIZATION, which is later than the
  // receipt this read follows — so poll rather than read once.
  let after = before;
  for (let i = 0; i < 25; i++) { after = await balanceOf(watcher2.account.address); if (after > before) break; await sleep(4000); }
  check("  …and the stake went back to the challenger", after - before === STAKE,
    `+${after - before} wei`);
  const c2 = await owner.viewJson("get_challenge", [CH2]);
  check("  …the challenge is REFUNDED and marked stalled", c2.status === "REFUNDED" && c2.stalled === true);
  const aS = await owner.viewJson("get_agent", [AGENT]);
  check("  …and a stalled challenge left the bond alone", aS.violation_count === 0 && aS.compliant_count === 0);

  /*
   * DOCUMENTED, not asserted as desirable: a transaction stays claimed for
   * good, whatever the outcome. `tx_claimed` is written when a challenge is
   * FILED and is never released — not on a stall, not on an INCONCLUSIVE.
   * The rule stops an accuser re-filing the same transaction until a round
   * happens to land VIOLATION; the cost is that a stalled challenge retires
   * that transaction from scrutiny. See contracts/NOTES.md §9.
   */


  // resolve_challenge must also work while paused — it is the only exit a
  // pending challenge has, and a pause that closed it would freeze the bond.
  const res = await stranger.send("resolve_challenge", [CH1]);
  const rj = returnedJson(res);
  check("resolve_challenge SURVIVES a pause", res.ok && rj?.ok === true,
    rj ? `verdict ${rj.verdict}` : res.revertReason.slice(0, 70));
  check("  …and the validators returned a real verdict", ["VIOLATION", "COMPLIANT", "INCONCLUSIVE"].includes(rj?.verdict),
    rj?.verdict ?? "none");

  await owner.send("set_paused", [false]);
  check("the contract is unpaused again", (await owner.viewJson("get_config")).paused === false);

  /*
   * DOCUMENTED, not asserted as desirable — and probed UNPAUSED, so the answer
   * comes from the rule rather than from the pause. `tx_claimed` is written when
   * a challenge is FILED and is never released: not on a stall, not on an
   * INCONCLUSIVE. The rule stops an accuser re-filing the same transaction until
   * a round happens to land VIOLATION; the cost is that a stalled challenge
   * retires that transaction from scrutiny. See contracts/NOTES.md §11.
   */
  const reFile = await sendPayable(watcher,"challenge_agent",
    [AGENT, VIOLATOR.txs[1], "Re-filing the transaction whose challenge stalled out"], STAKE);
  const rf = rejected(reFile);
  check("DOCUMENTED: a stalled challenge retires its transaction permanently",
    rf.isRejection && rf.reason.includes("already been challenged"), rf.reason.slice(0, 66));
  check("  …and that re-filing attempt was refunded in full", rf.refunded === String(STAKE));
}

// ═══ 6. compounding slashes, and SLASHED_OUT ═══════════════════════════════
sec("6. a second violation compounds on the REDUCED bond");
let firstBond = null, secondBond = null;
{
  const a = await owner.viewJson("get_agent", [AGENT]);
  const c1 = await owner.viewJson("get_challenge", [CH1]);
  firstBond = BigInt(a.bond);
  if (c1.verdict === "VIOLATION") {
    // bond was 1.0 + 0.1 top-up = 1.1; a 20% slash leaves 0.88.
    const expected = BigInt(c1.settlement.bond_before) - BigInt(c1.settlement.penalty);
    check("the first slash is 20% of the bond it found", BigInt(c1.settlement.penalty) * 5n === BigInt(c1.settlement.bond_before),
      `${c1.settlement.penalty} of ${c1.settlement.bond_before}`);
    check("  …and the agent's bond is exactly what is left", firstBond === expected,
      `${firstBond} wei`);

    // Raise the floor so the NEXT slash drops the agent under it.
    await owner.send("set_min_bond", [String(firstBond)]);
    const filed = await sendPayable(watcher2,"challenge_agent",
      [AGENT, VIOLATOR.txs[3], "A further unlisted-token swap by the same agent wallet"], STAKE);
    const CH3 = returnedJson(filed)?.challenge_id;
    if (returnedJson(filed)?.ok === true) {
      const res = await watcher2.send("resolve_challenge", [CH3]);
      const rj = returnedJson(res);
      const c3 = await owner.viewJson("get_challenge", [CH3]);
      const a3 = await owner.viewJson("get_agent", [AGENT]);
      secondBond = BigInt(a3.bond);
      if (c3.verdict === "VIOLATION") {
        check("the second slash is computed on the REDUCED bond, not the original",
          BigInt(c3.settlement.bond_before) === firstBond
            && BigInt(c3.settlement.penalty) * 5n === firstBond,
          `${c3.settlement.penalty} of ${c3.settlement.bond_before}`);
        check("  …so the bond compounds downward", secondBond === firstBond - BigInt(c3.settlement.penalty),
          `${firstBond} → ${secondBond}`);
        check("a bond that falls under the floor deactivates the agent",
          a3.status === "SLASHED_OUT", `status ${a3.status}, bond ${a3.bond}`);
        check("  …and a SLASHED_OUT agent is no longer challengeable", a3.challengeable === false);

        const late = await sendPayable(watcher,"challenge_agent",
          [AGENT, VIOLATOR.txs[4], "Challenging an agent whose bond is already gone"], STAKE);
        const rl = rejected(late);
        check("challenge_agent refuses a SLASHED_OUT agent", rl.isRejection, rl.reason.slice(0, 62));
        check("  …and refunds that stake too", rl.refunded === String(STAKE));

        const top = await sendPayable(operator, "top_up_bond", [AGENT], 1n * GEN);
        const tj = returnedJson(top);
        check("top_up_bond brings a SLASHED_OUT agent back to ACTIVE", tj?.reactivated === true,
          `status ${tj?.status}`);
      } else {
        check(`second judgement returned ${c3.verdict}, not VIOLATION — compounding not measured`, false,
          "re-run: the validators judged this transaction differently");
      }
    } else {
      check("second challenge could not be filed", false, rejected(filed).reason.slice(0, 70));
    }
  } else {
    check(`first judgement returned ${c1.verdict}, not VIOLATION — compounding not measured`, false,
      "re-run: the validators judged this transaction differently");
  }
}

// ═══ 7. owner powers, and their limits ═════════════════════════════════════
sec("7. owner-only is enforced on every dial");
{
  const calls = [
    ["set_min_bond", [String(GEN)]],
    ["set_challenge_stake", [String(GEN / 10n)]],
    ["set_penalty_bps", [3000]],
    ["set_params", [5000, 7000, 0, 5, 3600]],
    ["set_paused", [true]],
    ["transfer_ownership", [stranger.account.address]],
    ["withdraw_protocol", [stranger.account.address, "1"]],
  ];
  for (const [fn, args] of calls) {
    const out = await stranger.send(fn, args);
    check(`a stranger cannot call ${fn}`, out.reverted, out.revertReason.slice(0, 56));
  }
  const cfg = await owner.viewJson("get_config");
  check("no stranger's call changed anything", cfg.paused === false && cfg.owner === owner.account.address);

  const over = await owner.send("withdraw_protocol", [owner.account.address, String(1000n * GEN)]);
  check("withdraw_protocol cannot exceed the accrued balance", over.reverted, over.revertReason.slice(0, 60));
  const bad = await owner.send("set_penalty_bps", [99999]);
  check("set_penalty_bps refuses an out-of-range value", bad.reverted, bad.revertReason.slice(0, 56));
}

// ═══ 8. state consistency across every view ════════════════════════════════
sec("8. every view tells the same story");
{
  const stats = await owner.viewJson("get_stats");
  const treasury = await owner.viewJson("get_treasury");
  const challenges = (await owner.viewJson("get_challenges", [100])).challenges;
  const board = (await owner.viewJson("get_leaderboard", [50])).watchers;

  let violations = 0, compliant = 0, inconclusive = 0, settled = 0, bounties = 0n, slashed = 0n;
  for (const c of challenges) {
    if (c.verdict === "VIOLATION") violations++;
    if (c.verdict === "COMPLIANT") compliant++;
    if (c.verdict === "INCONCLUSIVE") inconclusive++;
    if (c.status !== "PENDING" && !c.stalled) settled++;
    bounties += BigInt(c.settlement.bounty);
    slashed += BigInt(c.settlement.penalty);
  }
  check("get_stats' violation count equals the challenge records", stats.violations === violations,
    `${stats.violations} vs ${violations}`);
  check("get_stats' compliant count equals the challenge records", stats.compliant === compliant);
  check("get_stats' inconclusive count equals the challenge records", stats.inconclusive === inconclusive);
  check("get_stats' bounties equal the sum of every settlement", BigInt(stats.bounties_paid) === bounties,
    `${stats.bounties_paid} vs ${bounties}`);
  check("get_stats' slashed total equals the sum of every penalty", BigInt(stats.total_slashed) === slashed);
  check("get_stats' filed count equals the number of challenge records",
    stats.challenges_filed === challenges.length);

  const earned = board.reduce((n, w) => n + BigInt(w.earned), 0n);
  check("the leaderboard's earnings equal the bounties paid", earned === bounties,
    `${earned} vs ${bounties}`);
  for (const w of board) {
    const solo = await owner.viewJson("get_watcher", [w.watcher]);
    check(`get_watcher agrees with the board for ${w.watcher.slice(0, 10)}…`,
      solo.upheld === w.upheld && solo.refuted === w.refuted && solo.earned === w.earned);
  }

  const nAgents = stats.agents_registered;
  let impossible = [];
  let historyTotal = 0;
  for (let i = 0; i < nAgents; i++) {
    const a = await owner.viewJson("get_agent", [i]);
    const score = await owner.viewJson("get_compliance_score", [i]);
    const hist = (await owner.viewJson("get_agent_history", [i, 100])).challenges;
    historyTotal += hist.length;
    if (a.status === "ACTIVE" && BigInt(a.bond) === 0n) impossible.push(`agent ${i} ACTIVE with a zero bond`);
    if (a.status === "SLASHED_OUT" && BigInt(a.bond) >= BigInt((await owner.viewJson("get_config")).min_bond))
      impossible.push(`agent ${i} SLASHED_OUT with a bond at or above the floor`);
    if (a.pending_count > hist.filter((c) => c.status === "PENDING").length)
      impossible.push(`agent ${i} claims more pending than its history shows`);
    check(`agent ${i}: compliance score matches its own counters`,
      score.compliant === a.compliant_count && score.violations === a.violation_count
      && score.compliance_bps === a.compliance_bps,
      `${score.compliance_bps} bps over ${score.decided} decided`);
    check(`agent ${i}: history length matches challenge_count`, hist.length === a.challenge_count,
      `${hist.length} vs ${a.challenge_count}`);
  }
  check("no agent is in an impossible state", impossible.length === 0, impossible.join("; ") || "none found");
  check("every challenge appears in exactly one agent's history", historyTotal === challenges.length,
    `${historyTotal} vs ${challenges.length}`);

  // Verify every settled challenge re-derives.
  for (const c of challenges) {
    if (c.status === "PENDING") continue;
    const v = await owner.viewJson("verify_challenge", [c.challenge_id]);
    check(`challenge #${c.challenge_id} (${c.verdict}) re-derives from stored evidence`,
      v.all_ok === true && v.conservation.balanced === true,
      `in ${v.conservation.in} = out ${v.conservation.out}`);
  }

  // The balance invariant, reconstructed from records alone.
  let owed = 0n;
  for (let i = 0; i < nAgents; i++) owed += BigInt((await owner.viewJson("get_agent", [i])).bond);
  for (const c of challenges) if (c.status === "PENDING") owed += BigInt(c.stake);
  owed += BigInt(treasury.protocol_balance);
  let bal = 0n;
  for (let i = 0; i < 20; i++) { bal = await balanceOf(address); if (bal === owed) break; await sleep(4000); }
  check("the chain balance equals what the records say is owed", bal === owed, `${bal} vs ${owed}`);
  check("the treasury view agrees with the reconstruction",
    BigInt(treasury.locked_bonds) + BigInt(treasury.locked_stakes) + BigInt(treasury.protocol_balance) === owed,
    `owed_total ${treasury.owed_total}`);
}

// ═══ 9. the terms question ═════════════════════════════════════════════════
sec("9. whose terms apply when a dial moves mid-challenge");
{
  await owner.send("set_min_bond", [String(GEN / 10n)]);
  const reg = await sendPayable(other,"register_agent",
    [SECOND.wallet, SECOND.chain, SECOND.mandate, ...PROFILE], 1n * GEN);
  const B = returnedJson(reg)?.agent_id;
  if (returnedJson(reg)?.ok !== true) {
    check("could not register the terms-test agent", false, rejected(reg).reason.slice(0, 70));
  } else {
    await owner.send("set_penalty_bps", [2000]);
    const filed = await sendPayable(watcher,"challenge_agent",
      [B, SECOND.tx, "Acquired WFC, a token this mandate does not permit at all"], STAKE);
    const CH = returnedJson(filed)?.challenge_id;
    check("a challenge was filed under a 2000 bps penalty", returnedJson(filed)?.ok === true, `challenge #${CH}`);

    // Move the dial AFTER filing but BEFORE judgement.
    await owner.send("set_penalty_bps", [4000]);
    const res = await watcher.send("resolve_challenge", [CH]);
    const rj = returnedJson(res);
    const c = await owner.viewJson("get_challenge", [CH]);
    if (c.verdict === "VIOLATION") {
      const bondBefore = BigInt(c.settlement.bond_before);
      const applied = (BigInt(c.settlement.penalty) * 10000n) / bondBefore;
      check("DOCUMENTED: the penalty in force at SETTLEMENT is the one applied, not the one at filing",
        applied === 4000n,
        `${applied} bps applied (2000 at filing, 4000 at settlement)`);
      const v = await owner.viewJson("verify_challenge", [CH]);
      check("  …and verify_challenge re-derives against the same current terms",
        v.all_ok === true && v.conservation.balanced === true);
    } else {
      console.log(`  \x1b[33m○\x1b[0m terms test: validators returned ${c.verdict}; the dial question needs a VIOLATION`);
    }
    await owner.send("set_penalty_bps", [2000]);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(70)}`);
console.log(`  ${pass} passed, ${fail} failed  —  ${networkName} ${address}`);
if (failures.length) { console.log("\nFAILED:"); for (const f of failures) console.log(`  ✘ ${f}`); }
console.log("");
process.exit(fail ? 1 : 0);
