/**
 * Seeds a deployed Sentinel with real content, so the live site shows the
 * product working rather than an empty register.
 *
 *   node seed.mjs --network=bradbury --address=0x…
 *
 * Everything here is REAL: a real wallet, a real Uniswap swap that really did
 * move WETH into an unlisted token, and a challenge that five validators really
 * judge. Nothing is faked for the demo.
 */
import { connect, accounts, argOf, sleep, returnedJson } from "./harness.mjs";
import { readFileSync } from "node:fs";

const networkName = argOf("network", "bradbury");
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

const AGENTS = [
  {
    role: operator, wallet: SWAP_WALLET, chain: "ethereum", bond: GEN,
    mandate: "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. " +
             "Never interact with unverified contracts or unlisted tokens.",
  },
  {
    role: operator, wallet: SWAP_WALLET, chain: "arbitrum", bond: GEN / 2n,
    mandate: "The agent may trade any ERC-20 token on any decentralised exchange, " +
             "in any size, at its own discretion. There are no restrictions.",
  },
];

const ids = [];
for (const a of AGENTS) {
  const out = await a.role.send("register_agent", [a.wallet, a.chain, a.mandate], a.bond);
  const body = returnedJson(out.returned);
  if (!out.ok) { console.log(`  ✘ register ${a.chain}: ${out.revertReason || out.status}`); continue; }
  if (body && body.ok === false) { console.log(`  ⊘ register ${a.chain}: ${body.reason}`); continue; }
  // Bradbury does not return a readable value, so read the id back from state.
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
    const known = await watcher.viewJson("is_tx_challenged", ["ethereum", SWAP_TX]);
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
