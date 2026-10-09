/**
 * Seeds the CANONICAL Sentinel with real agents and real transactions on all
 * five chains, and drives every case to a final ruling.
 *
 *   node seed_canonical.mjs            advance every case as far as it can, then exit
 *   node seed_canonical.mjs --status   print the state and exit
 *
 * Resumable: state lives in docs/seed-canonical.json and each run takes the next
 * step of every case that is ready (registration, lint, waiting for the wallet's
 * next real transaction, filing, resolving, appealing, finalizing, unbonding).
 * Canonical windows are an hour, so a full seed is several runs over a few hours.
 *
 * Nothing is forced. Each mandate is ours and is written for the wallet's real,
 * observable behaviour; the wallets are live bots we do not control; each
 * challenge names a real transaction mined AFTER the agent registered; the
 * validators decide. Whatever they decide is recorded, including outcomes the
 * plan did not hope for.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { sentinel } from "./sent.mjs";
import { sentSince, head, rpc, receipt } from "./chainscan.mjs";
import { sleep } from "./harness.mjs";

const root = new URL("..", import.meta.url).pathname;
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const ADDRESS = process.env.SENTINEL ?? dep.contracts.Sentinel.address;
const STATE = root + "docs/seed-canonical.json";
const GEN = 10n ** 18n;
const STAKE = 5n * 10n ** 16n;
const BUDGET_MS = Number(process.env.BUDGET_MS ?? 540_000);
const started = Date.now();

const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const BATCH = "0xee7ae85f2fe2239e27d9c1e23fffe168d63b4055";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ARB_MAIN = "0x8853fb72d93efc186d8bb806195cbe4563261bc9";
const ARB_BANNED = "0x32b7d5457628c5bc187f03a33d51d3ec3ee2b844";
const POLY_MAIN = "0xe15c952a70cc202fc8f19b2ca33fcc5a03d6c296";
const RH_TARGET = "0x4203c5a0b23572f6025e20177c79f455d85b74b2";
const RH2_TARGET = "0xd703ec4a9839b5a3f4dbba95210509fa74c19f6f";
const XAUT = "0x68749665ff8d2d112fa859aa293f07a622782f38";

const AGENTS = {
  e1: { role: "operator", chain: "ethereum", wallet: "0x28c6c06298d514db089934071355e5743bf21d60", bond: 2n * GEN,
    name: "Exchange payout bot A", type: "CUSTOM",
    description: "A high-volume exchange hot wallet that pays out customer withdrawals around the clock.",
    mandate: [
      `C1 [MAJOR] Only send the stablecoins USDT ${USDT} and USDC ${USDC}.`,
      "C2 [MINOR] Never send more than 0.5 ETH of native value in one transaction.",
      `C3 [CRITICAL] Never call the batch executor contract ${BATCH}.`,
    ] },
  e2: { role: "operator2", chain: "ethereum", wallet: "0x559432e18b281731c054cd703d4b49872be4ed53", bond: GEN,
    name: "USDT payout bot", type: "CUSTOM",
    description: "Sends USDT to customers, one transfer per transaction, all day.",
    mandate: ["C1 [MAJOR] Only move USDT and USDC.", "C2 [MINOR] Never send native ETH."] },
  e3: { role: "operator", chain: "ethereum", wallet: "0x21a31ee1afc51d94c2efccaa2092ad1028285549", bond: GEN,
    name: "Exchange payout bot B", type: "CUSTOM",
    description: "A second exchange hot wallet paying out tokens and ETH.",
    mandate: [
      "C1 [MINOR] Never send more than 5 ETH of native value in one transaction.",
      "C2 [MAJOR] Only send stablecoins.",
      "C3 [MAJOR] Never pay a customer the exchange would consider high-risk.",
    ] },
  arb: { role: "operator2", chain: "arbitrum", wallet: "0xcbd8eae56e5d51c82e9b901ff535906077c5ab32", bond: GEN,
    name: "Cross-chain keeper (Arbitrum)", type: "DEFI",
    description: "A keeper that runs the same key on Arbitrum and Polygon and calls one keeper contract per chain.",
    mandate: [`C1 [MAJOR] Only call the keeper contract ${ARB_MAIN}.`,
      `C2 [CRITICAL] Never call the contract ${ARB_BANNED}.`] },
  poly: { role: "operator2", chain: "polygon", wallet: "0xcbd8eae56e5d51c82e9b901ff535906077c5ab32", bond: GEN,
    name: "Cross-chain keeper (Polygon)", type: "DEFI",
    description: "The same keeper key on Polygon, under a different mandate.",
    mandate: [`C1 [MAJOR] Only call the keeper contract ${POLY_MAIN}.`, "C2 [MINOR] Never send native POL."] },
  base: { role: "operator", chain: "base", wallet: "0x1d7f97d26ae2c01f9b01fc252b73cf0db3397e95", bond: GEN,
    name: "Base USDC payout bot", type: "CUSTOM",
    description: "Moves USDC on Base for an exchange, many times a minute.",
    mandate: [`C1 [MAJOR] Only call the USDC token contract ${BASE_USDC}.`, "C2 [MINOR] Never send native ETH."],
    v2: [`C1 [MAJOR] Only call the USDC token contract ${BASE_USDC}.`, "C2 [MINOR] Never send native ETH.",
      "C3 [MAJOR] Never move more than 10 USDC in one transaction."] },
  rh: { role: "operator", chain: "robinhood", wallet: "0x119a94d53df9cc78b4167f30756b64aa62505baf", bond: GEN,
    name: "Robinhood Chain keeper", type: "DEFI",
    description: "Calls one contract on Robinhood Chain every few seconds.",
    mandate: [`C1 [MAJOR] Only call the contract ${RH_TARGET}.`, "C2 [MINOR] Never send native ETH."] },
  arb2: { role: "operator2", chain: "arbitrum", wallet: "0xe1acc9d6d65b24be793aff96fc6caa95ffb34ab3", bond: GEN,
    name: "Arbitrum USDC payout bot", type: "CUSTOM",
    description: "Sends USDC on Arbitrum many times a minute.",
    mandate: ["C1 [MAJOR] Only call the USDC token contract 0xaf88d065e77c8cc2239327c5edb3a432268e5831.", "C2 [MINOR] Never send native ETH."] },
  poly2: { role: "operator2", chain: "polygon", wallet: "0x6dd23e950878b1142772335cd122e92d47876c3e", bond: GEN,
    name: "Polygon token payout bot", type: "CUSTOM",
    description: "Pays out one token on Polygon several times a minute.",
    mandate: ["C1 [MAJOR] Only call the token contract 0xe979926c0bf5af833a98a0c2e9818e8b637f6d0a.", "C2 [MINOR] Never send native POL."] },
  rh2: { role: "operator2", chain: "robinhood", wallet: "0x1ef9d9240d83a1cf120c6fa7658ca47d005532d0", bond: GEN,
    name: "Robinhood Chain keeper B", type: "DEFI",
    description: "Calls one contract on Robinhood Chain several times a minute.",
    mandate: [`C1 [MAJOR] Only call the contract ${RH2_TARGET}.`, "C2 [MINOR] Never send native ETH."] },
};

const amountOf = (t) => (t.selector === "0xa9059cbb" ? BigInt("0x" + t.input.slice(74, 138)) : 0n);

/** Each case: the agent, which of its new transactions qualifies, the clause alleged, who files it, and why. */
const CASES = {
  e1_major: { agent: "e1", clause: "C1", by: "watcher", after: null,
    pick: (t) => t.selector === "0xa9059cbb" && ![USDT, USDC, BATCH].includes(t.to),
    reason: (t) => `Sends a token whose contract ${t.to} is neither USDT nor USDC.`,
    appeal: { by: "operator", text: "Operator response: this is a customer withdrawal the exchange must honour. The payout bot forwards whatever asset a customer withdraws; the stablecoin-only rule was written for the bot's own treasury movements, not for customer withdrawals, which is how the bot has always been run." } },
  e1_minor: { agent: "e1", clause: "C2", by: "watcher", after: "e1_major",
    pick: (t) => t.selector === "plain" && t.value > 5n * 10n ** 17n,
    reason: (t) => `Sends ${Number(t.value) / 1e18} ETH of native value in one transaction, above the 0.5 ETH limit.` },
  e1_incoming: { agent: "e1", clause: "C1", by: "watcher2", after: null,
    find: async (lo) => {
      // Tokens swept INTO the payout wallet by deposit forwarders: the agent is only the recipient.
      const r = await fetch("https://eth.blockscout.com/api/v2/addresses/0x28c6c06298d514db089934071355e5743bf21d60/token-transfers?filter=to",
        { signal: AbortSignal.timeout(30_000) }).then((x) => x.json()).catch(() => ({ items: [] }));
      for (const t of r.items ?? []) {
        const ts = Math.floor(Date.parse(t.timestamp) / 1000);
        const tok = String(t.token?.address_hash ?? "").toLowerCase();
        if (ts >= lo && ![USDT, USDC].includes(tok) && t.token?.type === "ERC-20") {
          return { hash: t.transaction_hash.toLowerCase(), block: t.block_number, ts, to: tok, selector: "0xa9059cbb", value: 0n,
            input: "", symbol: t.token.symbol, sender: String(t.from?.hash ?? "").toLowerCase() };
        }
      }
      return null;
    },
    reason: (t) => `The agent's wallet took part in a transfer of ${t.symbol} (${t.to}), which is neither USDT nor USDC.`,
    appealIfBreach: { by: "operator", text: async (t) => `Counter-evidence: the agent did not send anything in this transaction. Its sender is ${t.sender}, a deposit forwarder, and the only token transfer moves ${t.symbol} from that address INTO the agent's wallet. Clause C1 restricts what the agent sends; a token that others send to it is not the agent sending.` } },
  e2_compliant: { agent: "e2", clause: "C1", by: "watcher2", after: null,
    pick: (t) => t.to === USDT && t.selector === "0xa9059cbb",
    reason: () => "The bot moves a token contract it has not listed by address; check that this is really USDT or USDC." },
  e3_xaut: { agent: "e3", clause: "C2", by: "watcher2", after: null,
    pick: (t) => t.to === XAUT && t.selector === "0xa9059cbb",
    reason: () => "Sends Tether Gold (XAUT), a token pegged to the price of gold rather than to a currency.",
    appealIfBreach: { by: "operator", text: async () => "Counter-evidence: XAUt is issued by Tether and presented by it as a gold-backed stablecoin: every token is redeemable for one troy ounce of physical gold held in reserve, so its value is stable against that gold. Clause C2 says stablecoins without naming a currency, and a gold-pegged stablecoin is a stablecoin." },
    appealIfCompliant: { by: "watcher2", text: async () => "Counter-evidence: XAUt follows the price of gold, which moves by double-digit percentages against every currency in a year. In the ordinary sense the mandate uses, a stablecoin holds a stable value against a currency; a token that tracks a commodity is a commodity token, so paying it out is outside only stablecoins." } },
  e3_vague: { agent: "e3", clause: "C3", by: "watcher2", after: null,
    pick: (t) => t.selector === "0xa9059cbb" && t.to !== USDT,
    reason: () => "This payout may have gone to a high-risk customer of the exchange." },
  arb_critical: { agent: "arb", clause: "C2", by: "watcher2", after: null,
    pick: (t) => t.to === ARB_BANNED,
    reason: () => `The keeper called the contract ${ARB_BANNED} that its mandate bans.` },
  poly_other: { agent: "poly", clause: "C1", by: "watcher", after: null,
    pick: (t) => t.selector !== "plain" && t.to !== POLY_MAIN,
    reason: (t) => `The keeper called ${t.to}, which is not its keeper contract on Polygon.` },
  base_window: { agent: "base", clause: "C1", by: "watcher", after: "edit_base", window: true,
    pick: (t) => t.to === BASE_USDC && t.selector === "0xa9059cbb" && amountOf(t) > 10n * 10n ** 6n,
    tryFirst: "C3",
    reason: (t) => `Moves ${Number(amountOf(t)) / 1e6} USDC in one transaction, more than 10 USDC.` },
  base_v2: { agent: "base", clause: "C3", by: "watcher2", after: "edit_base", effective: true,
    pick: (t) => t.to === BASE_USDC && t.selector === "0xa9059cbb" && amountOf(t) > 10n * 10n ** 6n,
    reason: (t) => `Moves ${Number(amountOf(t)) / 1e6} USDC in one transaction, more than 10 USDC.` },
  rh_call: { agent: "rh2", clause: "C1", by: "watcher", after: null,
    pick: (t) => t.selector !== "plain",
    reason: (t) => `Checking that the keeper only called ${RH2_TARGET}; this transaction called ${t.to}.` },
  arb2_call: { agent: "arb2", clause: "C1", by: "watcher", after: null, pick: () => false,
    reason: (t) => `Checking that this Arbitrum payout only called the USDC contract; it called ${t.to}.` },
  poly2_call: { agent: "poly2", clause: "C1", by: "watcher2", after: null, pick: () => false,
    reason: (t) => `Checking that this Polygon payout only called its token contract; it called ${t.to}.` },
  e2_symbol: { agent: "e2", clause: "C1", by: "watcher", after: "e2_compliant",
    pick: (t) => t.to === USDT && t.selector === "0xa9059cbb",
    reason: () => "C1 names its tokens only by symbol; this transfer's token is identified by a self-declared symbol.",
    appealIfCompliant: { by: "watcher", text: async () => "Counter-evidence: clause C1 lists tokens only by ticker symbol and gives no contract address. A token's symbol is chosen by whoever deploys it, and many contracts call themselves USDT. The record identifies the token by its symbol and contract address, but the mandate gives nothing to compare the address with, so it cannot establish which USDT the operator meant." } },
};

const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { contract: ADDRESS, started_at: new Date().toISOString(), agents: {}, cases: {}, events: [] };
if (st.contract !== ADDRESS) { console.error(`state is for ${st.contract}, not ${ADDRESS}; move ${STATE} aside to reseed`); process.exit(1); }
const save = () => writeFileSync(STATE, JSON.stringify(st, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
const clients = {};
const as = (role) => (clients[role] ??= sentinel(ADDRESS, role));
const reader = as("resolver");
const nowS = () => Math.floor(Date.now() / 1000);
function event(kind, data) {
  const e = { at: new Date().toISOString(), kind, ...data };
  st.events.push(e);
  save();
  console.log(`• ${kind} ${JSON.stringify(data).slice(0, 300)}`);
}
const rec = (out) => ({ hash: out.hash, status: out.status, ok: out.ok, ret: out.ret ?? null, revert: out.reverted ? out.revertReason || null : null });

if (process.argv.includes("--status")) {
  console.log(JSON.stringify({ agents: st.agents, cases: Object.fromEntries(Object.entries(st.cases).map(([k, v]) => [k, { state: v.state, cid: v.challenge_id, tx: v.tx?.hash }])) }, null, 1));
  process.exit(0);
}

async function challengeView(cid) { return reader.view("get_challenge", [cid]); }

async function registerAll() {
  for (const [key, a] of Object.entries(AGENTS)) {
    if (st.agents[key]?.agent_id !== undefined) continue;
    const startBlock = await head(a.chain);
    const op = as(a.role);
    const out = await op.write("register_agent", [a.wallet, a.chain, a.mandate.join("\n"), "", a.name, a.type, a.description, ""], a.bond);
    const found = await reader.view("get_agent_by_wallet", [a.chain, a.wallet]);
    if (!found.found) { event("register_failed", { key, ...rec(out) }); continue; }
    st.agents[key] = { agent_id: found.agent.agent_id, chain: a.chain, wallet: a.wallet, start_block: startBlock,
      registered_at: found.agent.registered_at, register_tx: out.hash, lint: {} };
    event("registered", { key, agent_id: found.agent.agent_id, tx: out.hash });
  }
}

async function lintAll() {
  for (const [key, ag] of Object.entries(st.agents)) {
    const versions = (await reader.view("get_mandate_versions", [ag.agent_id])).versions;
    for (const v of versions) {
      if (v.lint_status !== "PENDING") { ag.lint[v.version] = { status: v.lint_status, flags: v.lint_flags }; continue; }
      const out = await as("resolver").write("lint_mandate", [ag.agent_id, v.version]);
      const after = (await reader.view("get_mandate_versions", [ag.agent_id])).versions.find((x) => x.version === v.version);
      ag.lint[v.version] = { status: after.lint_status, flags: after.lint_flags, tx: out.hash, tx_status: out.status };
      event("lint", { key, version: v.version, status: after.lint_status, flags: after.lint_flags.map((f) => f.clause), tx: out.hash, tx_status: out.status });
    }
  }
}

async function editBase() {
  const ag = st.agents.base;
  if (!ag || st.edit_base) return;
  const out = await as(AGENTS.base.role).write("update_mandate", [ag.agent_id, AGENTS.base.v2.join("\n"), ""]);
  const v = (await reader.view("get_mandate_versions", [ag.agent_id])).versions;
  if (v.length < 2) { event("edit_failed", rec(out)); return; }
  st.edit_base = { tx: out.hash, created_at: v[1].created_at, effective_from: v[1].effective_from, block: await head("base") };
  event("mandate_edited", { agent: "base", version: 2, effective_from: v[1].effective_from, tx: out.hash });
}

async function findTx(name, c) {
  const ag = st.agents[c.agent];
  const cs = (st.cases[name] ??= { state: "WAITING_TX", seen: [] });
  let from = cs.cursor ?? ag.start_block;
  let lo = ag.registered_at;
  let hi = Infinity;
  if (c.window) { lo = st.edit_base.created_at; hi = st.edit_base.effective_from; from = Math.max(from, st.edit_base.block - 5); }
  if (c.effective) { lo = st.edit_base.effective_from; if (nowS() < lo + 15) return null; }
  if (c.find) {
    const t = await c.find(lo);
    if (t && !Object.values(st.cases).some((o) => o.tx?.hash === t.hash)) return t;
    return null;
  }
  const txs = await sentSince(ag.chain, ag.wallet, from, 40);
  for (const t of txs) {
    cs.cursor = Math.max(cs.cursor ?? 0, t.block - 1);
    if (t.ts < lo || t.ts >= hi) continue;
    const used = Object.values(st.cases).some((o) => o.tx?.hash === t.hash);
    if (!used && c.pick(t)) return t;
  }
  if (txs.length) cs.cursor = Math.max(cs.cursor, txs[txs.length - 1].block - 1);
  if (c.window && cs.cursor && (await head(ag.chain)) > 0 && nowS() > hi) cs.state = "WINDOW_MISSED";
  save();
  return null;
}

async function step(name, c) {
  const cs = (st.cases[name] ??= { state: "WAITING_TX" });
  const ag = st.agents[c.agent];
  if (!ag || cs.state === "DROPPED") return false;
  if (c.after === "edit_base" && !st.edit_base) return false;
  if (c.after && c.after !== "edit_base" && st.cases[c.after]?.state !== "FINAL") return false;
  if (cs.state === "WAITING_TX") {
    const t = await findTx(name, c);
    if (!t) return false;
    cs.tx = { hash: t.hash, block: t.block, ts: t.ts, to: t.to, selector: t.selector, value: t.value.toString(), input: String(t.input ?? "").slice(0, 200),
      ...(t.symbol ? { symbol: t.symbol, sender: t.sender } : {}) };
    cs.state = "FOUND";
    event("tx_found", { case: name, chain: ag.chain, hash: t.hash, block: t.block, ts: t.ts, to: t.to, selector: t.selector });
  }
  if (cs.state === "FOUND") {
    const challenger = as(c.by);
    if (c.tryFirst && !cs.try_first) {
      const out = await challenger.write("challenge_agent", [ag.agent_id, cs.tx.hash, cs.tx.ts, c.tryFirst, c.reason(cs.tx)], STAKE);
      cs.try_first = rec(out);
      event("filing_refused_expected", { case: name, clause: c.tryFirst, ...cs.try_first });
    }
    const out = await challenger.write("challenge_agent", [ag.agent_id, cs.tx.hash, cs.tx.ts, c.clause, c.reason(cs.tx)], STAKE);
    const known = await reader.view("is_tx_challenged", [ag.chain, cs.tx.hash, ag.agent_id]);
    if (!known.challenged) { event("filing_failed", { case: name, ...rec(out) }); cs.state = "WAITING_TX"; save(); return true; }
    cs.challenge_id = known.challenge_id;
    cs.filed = rec(out);
    cs.state = "PENDING";
    event("filed", { case: name, challenge_id: cs.challenge_id, by: c.by, clause: c.clause, tx: out.hash });
    return true;
  }
  const ch = await challengeView(cs.challenge_id);
  if (name === "e1_major" && !st.withdraw_blocked && ["PENDING", "CONTESTABLE", "APPEALED"].includes(ch.status)) {
    {
      // v2.1.0: an open challenge holds back what it could slash; one wei more than what is free is refused.
      const a = await reader.view("get_agent", [ag.agent_id]);
      const out = await as(AGENTS.e1.role).write("request_withdrawal", [ag.agent_id, (BigInt(a.withdrawable) + 1n).toString()]);
      st.withdraw_blocked = { ...rec(out), bond: a.bond, held_for_open: a.held_for_open, withdrawable: a.withdrawable };
      st.withdraw_blocked.open_count = a.open_count;
      event("withdrawal_blocked", { agent: "e1", challenge_id: cs.challenge_id, ...st.withdraw_blocked });
    }
  }
  if (ch.status === "PENDING") {
    const out = await as("resolver").write("resolve_challenge", [cs.challenge_id]);
    const after = await challengeView(cs.challenge_id);
    (cs.resolves ??= []).push({ ...rec(out), status_after: after.status });
    event("resolve", { case: name, challenge_id: cs.challenge_id, tx_status: out.status, after: after.status, verdict: after.ruling.verdict, clause: after.ruling.clause, code: after.ruling.code });
    cs.state = after.status;
    save();
    return true;
  }
  if (ch.status === "CONTESTABLE") {
    cs.state = "CONTESTABLE";
    const plan = c.appeal ?? (c.appealIfBreach && ch.ruling.verdict === "BREACH" ? c.appealIfBreach
      : c.appealIfCompliant && ch.ruling.verdict === "COMPLIANT" ? c.appealIfCompliant : null);
    if (plan && !cs.appeal) {
      const text = typeof plan.text === "function" ? await plan.text(cs.tx) : plan.text;
      const out = await as(plan.by).write("appeal", [cs.challenge_id, text], 5n * 10n ** 16n);
      const after = await challengeView(cs.challenge_id);
      cs.appeal = { ...rec(out), text, status_after: after.status };
      event("appeal", { case: name, challenge_id: cs.challenge_id, by: plan.by, after: after.status, tx: out.hash });
      return true;
    }
    if (nowS() > ch.ruling.contest_deadline + 5) {
      const out = await as("resolver").write("finalize", [cs.challenge_id]);
      const after = await challengeView(cs.challenge_id);
      cs.finalize = rec(out);
      cs.state = after.status;
      event("finalize", { case: name, challenge_id: cs.challenge_id, after: after.status, final: after.final.verdict, slash: after.final.slash, precedent: after.final.precedent_key });
      return true;
    }
    return false;
  }
  if (ch.status === "APPEALED") {
    cs.state = "APPEALED";
    const out = await as("resolver").write("resolve_appeal", [cs.challenge_id]);
    const after = await challengeView(cs.challenge_id);
    (cs.appeal_resolves ??= []).push({ ...rec(out), status_after: after.status });
    event("resolve_appeal", { case: name, challenge_id: cs.challenge_id, tx_status: out.status, after: after.status, outcome: after.appeal.outcome, final: after.final.verdict });
    cs.state = after.status;
    return true;
  }
  if (ch.status === "FINAL") {
    if (cs.state !== "FINAL") { cs.state = "FINAL"; event("final", { case: name, challenge_id: cs.challenge_id, final: ch.final.verdict, how: ch.final.how }); }
    if (c.unregisterAfter && !st.unregister) {
      const out = await as(AGENTS[c.agent].role).write("unregister", [ag.agent_id]);
      const a = await reader.view("get_agent", [ag.agent_id]);
      st.unregister = { agent: c.agent, ...rec(out), unlock_at: a.unregister_unlock_at };
      event("unregister", { agent: c.agent, status: a.status, unlock_at: a.unregister_unlock_at, tx: out.hash });
      return true;
    }
    if (c.unregisterAfter && st.unregister && !st.unregister.final && nowS() > st.unregister.unlock_at + 5) {
      const out = await as("resolver").write("finalize_unregister", [ag.agent_id]);
      const a = await reader.view("get_agent", [ag.agent_id]);
      st.unregister.final = { ...rec(out), status: a.status };
      event("finalize_unregister", { agent: c.agent, status: a.status, tx: out.hash });
      return true;
    }
    return false;
  }
  return false;
}

async function retireQuietAgent() {
  const ag = st.agents.rh;
  if (!ag) return;
  if (!st.unregister) {
    const out = await as(AGENTS.rh.role).write("unregister", [ag.agent_id]);
    const a = await reader.view("get_agent", [ag.agent_id]);
    st.unregister = { agent: "rh", why: "the bot stopped transacting after registration", ...rec(out), unlock_at: a.unregister_unlock_at };
    event("unregister", { agent: "rh", status: a.status, unlock_at: a.unregister_unlock_at, tx: out.hash });
  } else if (!st.unregister.final && nowS() > st.unregister.unlock_at + 5) {
    const out = await as("resolver").write("finalize_unregister", [ag.agent_id]);
    const a = await reader.view("get_agent", [ag.agent_id]);
    st.unregister.final = { ...rec(out), status: a.status };
    event("finalize_unregister", { agent: "rh", status: a.status, tx: out.hash });
  }
  save();
}

await registerAll();
await lintAll();
if (!st.edit_base && st.agents.base) await editBase();
await lintAll();
for (;;) {
  let moved = false;
  try { await retireQuietAgent(); } catch (e) { console.log(`  ! retire: ${String(e?.message ?? e).slice(0, 160)}`); }
  for (const [name, c] of Object.entries(CASES)) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      if (await step(name, c)) moved = true;
    } catch (e) {
      console.log(`  ! ${name}: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    save();
  }
  if (Date.now() - started > BUDGET_MS) break;
  if (!moved) await sleep(20_000);
}
save();
console.log("\n" + Object.entries(st.cases).map(([k, v]) => `${k.padEnd(14)} ${String(v.state).padEnd(12)} #${v.challenge_id ?? "-"}`).join("\n"));
