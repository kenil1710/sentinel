/**
 * Seeds a deployed Sentinel with real content, so the live site shows the
 * product working rather than an empty register.
 *
 *   node seed.mjs --network=studiodev --address=0x…
 *
 * Everything here is REAL: a real wallet, a real Uniswap swap that really did
 * move WETH into an unlisted token, and a challenge that five validators really
 * judge. Nothing is faked for the demo.
 */
import { connect, accounts, argOf, sleep, returnedJson } from "./harness.mjs";
import { readFileSync } from "node:fs";

const networkName = argOf("network", "studiodev");
const address = argOf("address", null) ??
  JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
    .deployments[networkName].Sentinel.address;

const GEN = 10n ** 18n;
const ACC = accounts();

// The transaction the probe found on the day it ran.
const SWAP_TX = "0x41729a0ba95cb56368bc48601e0e133b23d8fcf3a1d5321550dbf5819810c90d";
const SWAP_WALLET = "0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5";

const operator = connect({ networkName, address, role: "operator" });
const watcher = connect({ networkName, address, role: "watcher" });
const resolver = connect({ networkName, address, role: "resolver" });

const cfg = await operator.viewJson("get_config");
const STAKE = BigInt(cfg.challenge_stake);
console.log(`\nSeeding ${address} on ${networkName}`);

/*
 * The four profile arguments are NOT optional on chain.
 *
 * GenVM has no default arguments, so a seven-parameter method called with three
 * arguments fails with `exit_code 1` — a runtime error that says nothing about
 * which argument was missing. This file passed three for as long as the profile
 * fields have existed and seeded nothing on every fresh deployment.
 */
const AGENTS = [
  {
    role: operator, wallet: SWAP_WALLET, chain: "ethereum", bond: GEN,
    mandate: "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. " +
             "Never interact with unverified contracts or unlisted tokens.",
    name: "Uniswap Rebalancer", type: "TRADING",
    description: "Rebalances an ETH/USDC book on Uniswap every four hours.",
    url: "https://example.org/agents/rebalancer",
  },
  {
    role: operator, wallet: SWAP_WALLET, chain: "arbitrum", bond: GEN / 2n,
    mandate: "The agent may trade any ERC-20 token on any decentralised exchange, " +
             "in any size, at its own discretion. There are no restrictions.",
    name: "Arbitrum Discretionary", type: "DEFI",
    description: "An unrestricted mandate, kept here so a permissive agent is on the register too.",
    url: "https://example.org/agents/discretionary",
  },
];

const ids = [];
for (const a of AGENTS) {
  const out = await a.role.send("register_agent",
    [a.wallet, a.chain, a.mandate, a.name, a.type, a.description, a.url], a.bond);
  const body = returnedJson(out.returned);
  if (!out.ok) { console.log(`  ✘ register ${a.chain}: ${out.revertReason || out.status}`); continue; }
  if (body && body.ok === false) { console.log(`  ⊘ register ${a.chain}: ${body.reason}`); continue; }
  // A readable return value is not guaranteed, so read the id back from state.
  const found = await operator.viewJson("get_agent_by_wallet", [a.chain, a.wallet]);
  const id = found.found ? found.agent.agent_id : null;
  ids.push(id);
  console.log(`  ✔ agent #${id} on ${a.chain} — ${(Number(a.bond) / 1e18).toFixed(2)} GEN bonded`);
}

const strictId = ids[0];
if (strictId !== null && strictId !== undefined) {
  console.log(`\n  filing a challenge against agent #${strictId}…`);
  const filed = await watcher.send("challenge_agent",
    [strictId, SWAP_TX,
     "Swapped WETH into WFC, an unlisted token with 172 holders that the mandate does not permit"],
    STAKE);
  if (!filed.ok) {
    console.log(`  ✘ challenge: ${filed.revertReason || filed.status}`);
  } else {
    /*
     * Read the id back by POLLING, not once.
     *
     * A settled write is not always immediately visible to a read, and a
     * single read here returned `challenge_id: undefined` — which was then
     * passed straight into resolve_challenge(undefined). The transaction
     * "succeeded" and judged nothing.
     *
     * This is the same lesson as the patrol bot's: a settled transaction is not
     * a completed effect, and the contract's own state is the only authority.
     */
    let known = { challenged: false };
    for (let i = 0; i < 10; i++) {
      known = await watcher.viewJson("is_tx_challenged", ["ethereum", SWAP_TX, strictId]);
      if (known.challenged && typeof known.challenge_id === "number") break;
      await sleep(3000);
    }
    if (!known.challenged || typeof known.challenge_id !== "number") {
      console.log("  ✘ challenge filed but its id never became readable — not judging blindly");
      process.exit(1);
    }
    const cid = known.challenge_id;
    console.log(`  ✔ challenge #${cid} filed`);
    console.log(`  … putting it to the validators (each fetches Blockscout independently)`);
    const judged = await resolver.send("resolve_challenge", [cid]);
    if (!judged.ok) {
      console.log(`  ⊘ judgement: ${judged.revertReason || judged.status} — still pending, judge again later`);
    } else {
      const ch = await watcher.viewJson("get_challenge", [cid]);
      console.log(`  ✔ verdict: ${ch.verdict}  (confidence ${ch.confidence}%)`);
      console.log(`     ${String(ch.reasoning).slice(0, 200)}`);
      const agent = await watcher.viewJson("get_agent", [strictId]);
      console.log(`     bond now ${(Number(BigInt(agent.bond)) / 1e18).toFixed(4)} GEN` +
        `   compliance ${agent.compliance_bps / 100}%`);
    }
  }
}

await sleep(3000);
const stats = await operator.viewJson("get_stats");
console.log(`\n  agents ${stats.agents_registered}   challenges ${stats.challenges_filed}` +
  `   violations ${stats.violations}   bounties ${(Number(BigInt(stats.bounties_paid)) / 1e18).toFixed(4)} GEN\n`);
