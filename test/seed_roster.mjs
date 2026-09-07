/**
 * Populates a deployed Sentinel with a diverse register of REAL wallets.
 *
 *   node seed_roster.mjs --network=bradbury --address=0x…
 *
 * Every wallet below was taken from the live transaction list of a well-known
 * protocol contract on the day this ran — Uniswap's UniversalRouter on three
 * chains, and Aave v3's Pool. They are externally-owned accounts that really
 * transact; none is invented, and none is a contract.
 *
 * The three Robinhood Chain entries were captured on 2026-09-07 from that
 * chain's own DEX router (`0x6e2A35A7AD…`, tagged "OKX Labs: DexRouter") and
 * from its liquidity PositionManager, and each was checked two ways before it
 * was written down: its address-transaction list must ANSWER — four of the nine
 * wallets tried return a repeated 500 and the patrol could never read them
 * (docs/PROBE.md §10) — and its recent history must contain the thing its
 * mandate forbids, so the register makes a claim that can actually be tested.
 *
 * The mandates are written to be plausible for what each wallet actually does,
 * which matters: a register full of mandates nobody could breach would prove
 * nothing, and one full of mandates everybody breaches would be noise.
 */
import { connect, accounts, argOf, sleep, returnedJson } from "./harness.mjs";
import { readFileSync } from "node:fs";

const networkName = argOf("network", "bradbury");
const address = argOf("address", null) ??
  JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
    .deployments[networkName].Sentinel.address;
const GEN = 10n ** 18n;
const ACC = accounts();

const operator = connect({ networkName, address, role: "operator" });
const operator2 = connect({ networkName, address, role: "operator2" });

/**
 * The roster. `wallet` values are real and were captured from live chain data;
 * see scratchpad/real_wallets.json for provenance.
 */
const ROSTER = [
  {
    // The one the probe found: this wallet really did swap WETH into WFC.
    role: operator, wallet: "0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5", chain: "ethereum",
    name: "ETH/USDC Rebalancer", type: "TRADING", bond: GEN,
    mandate: "Only trade ETH and USDC on Uniswap. Maximum 0.5 ETH per trade. " +
             "Never interact with unverified contracts or unlisted tokens.",
    description: "Maintains a two-sided ETH/USDC book through Uniswap's UniversalRouter, " +
                 "rebalancing whenever the ratio drifts more than two percent.",
    url: "https://docs.uniswap.org/contracts/v3/overview",
  },
  {
    role: operator, wallet: "0xaA3Ab5Ed0758717138aCF345e2563D7588E1A3f9", chain: "ethereum",
    name: "Uniswap Swap Bot", type: "TRADING", bond: GEN,
    mandate: "Only trade on Uniswap. Maximum 1 ETH per swap. No unverified contracts.",
    description: "A high-frequency swap agent routing exclusively through Uniswap. " +
                 "Funded by a single LP and capped at one ETH of exposure per transaction.",
    url: "https://app.uniswap.org",
  },
  {
    role: operator, wallet: "0xD1231C3B4317E4E616EdfbfD37c6e49D3CdE5D73", chain: "ethereum",
    name: "Stablecoin Treasury", type: "TRADING", bond: GEN / 2n,
    mandate: "Only hold USDC and USDT. Never acquire any other token. " +
             "No interactions with unverified contracts.",
    description: "A conservative treasury wallet that is only ever supposed to hold " +
                 "dollar stablecoins. Any other token appearing in its balance is a breach.",
    url: "",
  },
  {
    role: operator2, wallet: "0xfAD4e457673516FA016D60dfF67493Ae0c6C1B71", chain: "ethereum",
    name: "Aave Yield Farmer", type: "DEFI", bond: GEN,
    mandate: "Only interact with Aave and Compound. Never use a decentralised exchange. " +
             "Never interact with unverified contracts.",
    description: "Supplies and withdraws collateral across Aave v3 and Compound, " +
                 "harvesting supply-side yield. It should never touch a DEX.",
    url: "https://app.aave.com",
  },
  {
    role: operator2, wallet: "0xC860dA38f56C171f16f699FA0AE698488AF855e9", chain: "ethereum",
    name: "Conservative Custodian", type: "CUSTOM", bond: GEN / 2n,
    mandate: "No interactions with unverified contracts. No unlisted tokens. " +
             "Never send funds to an address flagged as a scam.",
    description: "A cautious wallet with one rule: it may only ever touch contracts " +
                 "whose source is verified on the block explorer.",
    url: "",
  },
  {
    role: operator2, wallet: "0x6A034E0339352840A9eCe7f062438a8948599101", chain: "ethereum",
    name: "Compound Lender", type: "DEFI", bond: GEN / 2n,
    mandate: "Only interact with Aave and Compound. Maximum 2 ETH per transaction.",
    description: "Lends idle stablecoin reserves into money markets and withdraws on demand.",
    url: "https://compound.finance",
  },
  {
    role: operator, wallet: "0xD3D6Cd81E8425142CAC2DB07fEd5a4D63E1ff6F0", chain: "arbitrum",
    name: "Arbitrum Router", type: "TRADING", bond: GEN / 2n,
    mandate: "Only trade ETH and USDC on Uniswap. Maximum 1 ETH per swap. " +
             "No unlisted tokens, ever.",
    description: "The same strategy as the mainnet rebalancer, run on Arbitrum where " +
                 "the fees make tighter rebalancing worthwhile.",
    url: "",
  },
  {
    role: operator, wallet: "0x9153b92183e8404d96edfC5809F9178Cc7094DD1", chain: "polygon",
    name: "Polygon Market Maker", type: "TRADING", bond: GEN / 2n,
    mandate: "Only trade MATIC and USDC on Uniswap. Maximum 500 MATIC per swap. " +
             "Never interact with unverified contracts.",
    description: "Quotes both sides of a MATIC/USDC pair on Polygon.",
    url: "",
  },
  {
    /*
     * Base. Added after the probe's finding was re-measured: PROBE §6 recorded
     * base.blockscout.com answering 500 to every /api/v2 endpoint for a whole
     * day, so the register originally spanned three chains rather than the four
     * the contract configures. The outage was transient — the host now serves
     * this wallet's history — and a chain claimed in `get_config` but absent
     * from the register is a claim nobody can check.
     *
     * This wallet really does route through Uniswap V4's Universal Router on
     * Base, and the tokens it actually moves (BLUE, METAC) are neither of the
     * two its mandate names.
     */
    role: operator, wallet: "0xFEfd6cD016A45D03ADdE794995C76eE51E0E9016", chain: "base",
    name: "Base Swap Router", type: "TRADING", bond: GEN / 2n,
    mandate: "Only trade ETH and USDC on Uniswap. Never acquire an unlisted token, " +
             "and never interact with an unverified contract.",
    description: "Routes swaps through Uniswap's Universal Router on Base, where the " +
                 "fees make small rebalances worthwhile.",
    url: "https://app.uniswap.org",
  },
  // ── the multi-chain agent: ONE wallet, THREE chains, three mandates ──────
  // The contract allows this deliberately: a wallet is only unique per chain,
  // because the same key running on two chains is two different risk surfaces
  // and deserves two different rules.
  {
    role: operator2, wallet: "0x688B875C11B5648E807dDE8FfeB29828dbAc4C62", chain: "arbitrum",
    name: "Omni Agent (Arbitrum leg)", type: "DEFI", bond: GEN / 2n,
    mandate: "On Arbitrum this agent may only trade ETH and USDC on Uniswap. " +
             "Maximum 2 ETH per swap.",
    description: "One key, three chains, three different mandates — the Arbitrum leg " +
                 "is the permissive one because liquidity there is deepest.",
    url: "https://example.org/omni-agent",
  },
  {
    role: operator2, wallet: "0x688B875C11B5648E807dDE8FfeB29828dbAc4C62", chain: "ethereum",
    name: "Omni Agent (Ethereum leg)", type: "DEFI", bond: GEN / 2n,
    mandate: "On Ethereum this agent may only interact with Aave. No swaps of any kind. " +
             "No unverified contracts.",
    description: "The mainnet leg of the same key, restricted to lending only because " +
                 "mainnet gas makes active trading uneconomic.",
    url: "https://example.org/omni-agent",
  },
  {
    role: operator2, wallet: "0x688B875C11B5648E807dDE8FfeB29828dbAc4C62", chain: "polygon",
    name: "Omni Agent (Polygon leg)", type: "DEFI", bond: GEN / 2n,
    mandate: "On Polygon this agent may only hold USDC. It may not trade at all.",
    description: "The Polygon leg is a pure settlement account: it holds dollars and " +
                 "does nothing else.",
    url: "https://example.org/omni-agent",
  },

  /*
   * Robinhood Chain. Read through a browser rather than a plain GET, because
   * the explorer sits behind a bot check — contracts/NOTES.md 12.
   *
   * The mandates are strict on purpose, and each one is strict about something
   * this wallet was OBSERVED doing in the fifty rows above its registration:
   * an unverified counterparty, a freshly launched token, an approval to
   * something that is not the pair being traded. A mandate nobody could breach
   * proves nothing.
   */
  {
    // 50 rows: PositionManager/modifyLiquidities, OKX DexRouter swaps — and
    // repeated calls to 0x86B417a08B…, which the explorer reports unverified.
    role: operator, wallet: "0xc7455906fB8b53970405aC135e904db1850Bb71E", chain: "robinhood",
    name: "Robinhood LP Manager", type: "DEFI", bond: GEN,
    mandate: "Only manage liquidity positions through verified contracts. " +
             "Never call an unverified contract. Never trade a token that is " +
             "not ETH or a listed stablecoin.",
    description: "Runs concentrated liquidity positions through the chain's " +
                 "PositionManager and rebalances them through the DEX router.",
    url: "",
  },
  {
    // 50 rows: 32 DexRouter/dagSwapTo, seven unverified counterparties, and
    // approvals to GatedMaxToken and PonsV2LauncherToken.
    role: operator, wallet: "0xbB91136e0ec8cb675F49c65D62D237BCdDAaB74d", chain: "robinhood",
    name: "Robinhood Swap Desk", type: "TRADING", bond: GEN,
    mandate: "Only trade ETH and USDC. Never acquire or approve a newly " +
             "launched token. Never interact with an unverified contract. " +
             "Maximum 1 ETH per swap.",
    description: "A high-frequency swap desk routing through the chain's DEX " +
                 "router, mandated to stay in the two most liquid assets.",
    url: "",
  },
  {
    // 50 rows: 43 DexRouter/dagSwapTo plus seven approvals, six of them to
    // PonsV2LauncherToken — a launchpad token, not a pair it is allowed to hold.
    role: operator2, wallet: "0xABc94D1a928E0c747517045E8208448aE460946f", chain: "robinhood",
    name: "Robinhood Momentum Bot", type: "TRADING", bond: GEN / 2n,
    mandate: "Only trade ETH and USDC through the DEX router. Never grant a " +
             "token approval to any contract other than the router itself. " +
             "No unlisted or newly launched tokens, ever.",
    description: "A momentum trader that is only supposed to move between ETH " +
                 "and dollars, and only through the one router it names.",
    url: "",
  },
];

/*
 * `--chain=base` seeds only that chain's entries. Re-running the whole roster
 * against a populated register is harmless — a duplicate is refused and
 * refunded — but it is eleven pointless transactions to add a twelfth agent.
 */
const onlyChain = argOf("chain", null);
const SELECTED = onlyChain ? ROSTER.filter((a) => a.chain === onlyChain) : ROSTER;

console.log(`\nSeeding the register → ${address} on ${networkName}`);
if (onlyChain) console.log(`  filtered to chain=${onlyChain} (${SELECTED.length} of ${ROSTER.length})`);
const cfg = await operator.viewJson("get_config");
console.log(`  min bond ${cfg.min_bond_text} GEN   types ${cfg.agent_types.join(", ")}\n`);

let ok = 0, skipped = 0, failed = 0;
for (const a of SELECTED) {
  const label = `${a.name} (${a.chain})`;
  const out = await a.role.send("register_agent",
    [a.wallet, a.chain, a.mandate, a.name, a.type, a.description, a.url], a.bond);
  if (!out.ok) { failed++; console.log(`  ✘ ${label} — ${out.revertReason || out.status}`); continue; }

  // A settled transaction is not a registered agent: the contract refunds
  // rather than reverting when it turns something down. Read the state back.
  let found = { found: false };
  for (let i = 0; i < 8; i++) {
    found = await operator.viewJson("get_agent_by_wallet", [a.chain, a.wallet.toLowerCase()]);
    if (found.found) break;
    await sleep(2500);
  }
  if (!found.found) {
    const body = returnedJson(out.returned);
    skipped++;
    console.log(`  ⊘ ${label} — refused${body?.reason ? `: ${body.reason}` : " (refunded)"}`);
    continue;
  }
  ok++;
  console.log(`  ✔ #${String(found.agent.agent_id).padStart(2)} ${label.padEnd(34)} ${a.type.padEnd(8)} ${(Number(a.bond) / 1e18).toFixed(2)} GEN`);
}

await sleep(3000);
const stats = await operator.viewJson("get_stats");
console.log(`\n  registered ${ok}, refused ${skipped}, failed ${failed}`);
console.log(`  register now holds ${stats.agents_registered} agents (${stats.agents_active} active), ` +
  `${stats.bond_under_watch_text} GEN under watch`);
for (const t of cfg.agent_types) {
  const r = await operator.viewJson("get_agents_by_type", [t, 50]);
  if (r.count) console.log(`    ${t.padEnd(9)} ${r.count}`);
}
console.log("");
