/**
 * docs/SEEDS.md and the README's seeded-register section, from the seed state
 * (docs/seed-canonical.json, docs/seed-demo.json) and the chain as it is now.
 *   STUDIO_RPC=<relay> node tools/seeds_md.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("..", import.meta.url).pathname;
const require = createRequire(root + "test/package.json");
const { createClient } = require("genlayer-js");
const { studioDevnet } = require("genlayer-js/chains");
const relay = process.env.STUDIO_RPC;
const client = createClient({ chain: relay ? { ...studioDevnet, rpcUrls: { ...studioDevnet.rpcUrls, default: { ...studioDevnet.rpcUrls.default, http: [relay] } } } : studioDevnet });
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const CAN = dep.contracts.Sentinel.address, DEMO = dep.contracts.SentinelDemo.address, CONS = dep.contracts.SentinelConsumer.address;
const EX = "https://explorer-studio-dev.genlayer.com";
const SITE = "https://sentinel-tau-ashen.vercel.app";
const BOT = "0x81d6bf84a5b03950d910b4a2f83c68006e0b93f4";
const BS = { ethereum: "eth.blockscout.com", base: "base.blockscout.com", arbitrum: "arbitrum.blockscout.com", polygon: "polygon.blockscout.com", robinhood: "robinhoodchain.blockscout.com" };
async function view(address, fn, args = []) {
  for (let i = 0; i < 30; i++) {
    try { const r = await client.readContract({ address, functionName: fn, args }); return typeof r === "string" ? JSON.parse(r) : r; }
    catch { await new Promise((r) => setTimeout(r, 20_000)); }
  }
  throw new Error(fn);
}
const g = (wei) => { const v = BigInt(wei || "0"); const w = v / 10n ** 18n, f = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, ""); return f ? `${w}.${f}` : `${w}`; };
const short = (h) => `${h.slice(0, 8)}…${h.slice(-4)}`;

const seed = JSON.parse(readFileSync(root + "docs/seed-canonical.json", "utf8"));
if (seed.contract.toLowerCase() !== CAN.toLowerCase()) throw new Error("seed state is not for the canonical contract");
const stats = await view(CAN, "get_stats");
const ledger = await view(CAN, "get_ledger");
const all = [];
for (let off = 0; ; off += 100) { const p = await view(CAN, "get_challenges", [off, 100]); all.push(...p.challenges); if (off + 100 >= p.total) break; }
all.sort((a, b) => a.challenge_id - b.challenge_id);
const agents = (await view(CAN, "get_agents", [0, 100])).agents.sort((a, b) => a.agent_id - b.agent_id);
const consumer = await view(CONS, "get_requests", [20]);
const name = (id) => agents.find((a) => a.agent_id === id)?.name ?? `#${id}`;
const caseOf = (id) => Object.entries(seed.cases).find(([, c]) => c.challenge_id === id)?.[0] ?? "";
const NOTE = {
  e1_major: "MAJOR breach: the payout bot sent a token that is neither USDT nor USDC. The operator appealed (customer withdrawals); a fresh panel rejected the appeal",
  e1_minor: "MINOR breach: 6.13 ETH sent in one transaction against a 0.5 ETH cap; filed after an earlier breach was final, so the multiplier was ×1.5 (no slash left: the bond was already 0)",
  e1_incoming: "an open challenger read a deposit the agent RECEIVED as the agent sending it; the panel saw the agent was only the recipient. Open-challenger loss; became a precedent (direction `in:`)",
  e2_compliant: "the panel judged a symbol-only clause too vague to decide (INCONCLUSIVE); stake refunded",
  e2_symbol: "first panel: COMPLIANT. The challenger appealed that a ticker symbol cannot say which token is meant; the fresh panel ruled INCONCLUSIVE. **Appeal upheld**: stake and appeal bond returned",
  e3_xaut: "a Tether Gold payout under \"Only send stablecoins\", a clause the linter had flagged; the panel ruled INCONCLUSIVE",
  e3_vague: "the linter had flagged C3 (a customer's risk is not in the transaction data); INCONCLUSIVE",
  base_window: "mined while mandate v2 (10 USDC limit) was queued: judged under v1, COMPLIANT. A filing alleging v2's C3 on it was refused by the contract (\"version 1 has no clause C3\")",
  base_v2: "mined after v2 took effect: 232.99 USDC in one transfer against the 10 USDC limit. MAJOR breach, filed by an open challenger",
  rh_call: "Robinhood Chain, read by validators through a real browser (Cloudflare): COMPLIANT; became a precedent",
  arb2_call: "an ordinary USDC payout on Arbitrum, read through a real browser: COMPLIANT; became a precedent",
  poly2_call: "an ordinary token payout on Polygon, read through a real browser: COMPLIANT; became a precedent",
};
const BOT_NOTE = {
  0: "the bot's first filing: payout bot A called the batch executor its C3 forbids. CRITICAL breach, 1 GEN slashed (50% of the 2 GEN bond)",
  1: "the bot flags every token named only by symbol; the panel ruled INCONCLUSIVE",
  11: "another call to the forbidden batch executor; CRITICAL, no slash left (the bond had already been taken to 0)",
  12: "the agent sent token 0x4e3fbd… (not USDT or USDC); MAJOR, no slash left",
  13: "another call to the forbidden batch executor; CRITICAL, no slash left",
  14: "another call to the forbidden batch executor; CRITICAL, no slash left",
};
const row = (c, note) => {
  const verdict = c.status === "FINAL" ? c.final.verdict : c.status;
  const sev = c.final.severity || c.ruling.severity;
  const appeal = c.appeal.outcome ? `${c.appeal.role.toLowerCase()} → ${c.appeal.outcome.toLowerCase()}` : "—";
  const by = c.challenger === BOT ? "patrol bot" : short(c.challenger);
  return `| [#${c.challenge_id}](${SITE}/challenge/${c.challenge_id}) | #${c.agent_id} ${name(c.agent_id)} (${c.chain}) | [${short(c.tx_hash)}](https://${BS[c.chain]}/tx/${c.tx_hash}) | ${c.alleged_clause} | ${by} | ${c.ruling.verdict || "—"}${c.ruling.code ? " `" + c.ruling.code + "`" : ""} | ${appeal} | **${verdict}**${sev ? " " + sev : ""} | ${c.final.slash !== "0" ? g(c.final.slash) : "—"} | ${note} |`;
};
const head = `| Challenge | Agent | Transaction | Clause | Filed by | First ruling | Appeal | Final | Slash (GEN) | What happened |\n|---|---|---|---|---|---|---|---|---|---|`;
const seeded = all.filter((c) => caseOf(c.challenge_id));
const featured = all.filter((c) => BOT_NOTE[c.challenge_id] !== undefined);
const bot = all.filter((c) => c.challenger === BOT);
const cnt = (xs, v) => xs.filter((c) => c.status === "FINAL" && c.final.verdict === v).length;
const flaggedChurn = bot.filter((c) => c.agent_id === 2 && c.alleged_clause === "C2");
const botAgents = [...new Set(bot.map((c) => c.agent_id))];
const extra = [
  seed.withdraw_blocked && `- **Withdrawal held back while a challenge was open:** with ${seed.withdraw_blocked.open_count ?? "a"} challenge(s) open against payout bot A, ${g(seed.withdraw_blocked.held_for_open ?? "0")} GEN of its ${g(seed.withdraw_blocked.bond ?? "0")} GEN bond was held for what they could slash; its operator asked for 1 wei more than the ${g(seed.withdraw_blocked.withdrawable ?? "0")} GEN that was free and the contract refused — [tx](${EX}/tx/${seed.withdraw_blocked.hash}): “${String(seed.withdraw_blocked.revert ?? "").slice(0, 140)}”.`,
  seed.unregister && `- **Unregister:** agent #${seed.agents.rh.agent_id} (Robinhood keeper A) stopped transacting after registration; its operator unregistered it ([tx](${EX}/tx/${seed.unregister.hash})) and after the 1 h timelock anyone finalized it ([tx](${EX}/tx/${seed.unregister.final?.hash})): status ${seed.unregister.final?.status}, the bond moved to the operator's claimable balance.`,
  seed.edit_base && `- **Mandate edit not applied retroactively:** the Base bot published v2 ([tx](${EX}/tx/${seed.edit_base.tx})) adding a 10 USDC limit, effective ${new Date(seed.edit_base.effective_from * 1000).toISOString()}; see #6 and #25 above.`,
  `- **Precedent skip:** ${stats.precedents} precedents exist ([/precedents](${SITE}/precedents)). The bot's accusations against the USDT payout bot's USDT transfers stopped once #17 became a final COMPLIANT precedent for that agent, clause and transaction kind; the patrol report lists each withheld transaction under "withheld by precedent".`,
  consumer.total && `- **SentinelConsumer:** ${consumer.total} requests on [${short(CONS)}](${EX}/address/${CONS}) — ${consumer.carried_out} carried out (the Base bot's operator, agent in good standing), ${consumer.refused} refused (payout bot A: "${consumer.requests.find((r) => r.agent_id === 0)?.reasons.join("; ")}"; and a caller who was not the operator).`,
  `- **Two keeper wallets went quiet** on Arbitrum and Polygon after registration (agents #3 and #4 have no challenges); two active payout bots (#8, #9) carry those chains' cases.`,
].filter(Boolean);
const lint = Object.entries(seed.agents).map(([, a]) => { const v = a.lint?.["1"]; return `#${a.agent_id} ${v?.status ?? "?"}${v?.flags?.length ? ` (${v.flags.map((f) => f.clause ?? f).join(", ")} flagged)` : ""}`; }).join(" · ");

const summary = `Canonical contract [\`${CAN}\`](${EX}/address/${CAN}), read ${new Date().toISOString()}.

**${stats.agents_registered} agents on 5 chains · ${stats.challenges_filed} challenges: ${stats.final.BREACH} BREACH, ${stats.final.COMPLIANT} COMPLIANT, ${stats.final.INCONCLUSIVE} INCONCLUSIVE final, ${stats.challenges_open} open · ${stats.appeals.filed} appeals (${stats.appeals.upheld} upheld, ${stats.appeals.rejected} rejected) · ${stats.precedents} precedents · ${g(stats.total_slashed)} GEN slashed, ${g(stats.total_bounties)} GEN in bounties.** Ledger: received ${g(ledger.received)} = bonds ${g(ledger.bonds)} + open stakes ${g(ledger.open_stakes)} + claimable ${g(ledger.claimable)} + claimed ${g(ledger.claimed)} (${ledger.invariant_holds && ledger.views_match_storage ? "holds, and every total matches its recomputation from the records" : "DOES NOT HOLD"}).

Every agent is a live bot we do not operate; every mandate is ours, written for that bot's observable behaviour; every challenge names a real transaction mined after the agent registered; the validators decided each one. Every final BREACH was re-checked by hand against the chain's own RPC: [docs/BREACHES.md](docs/BREACHES.md). Linter at registration: ${lint}.`;

const botBreach = (id) => bot.filter((c) => c.agent_id === id && c.status === "FINAL" && c.final.verdict === "BREACH").length;
const botBlock = `### The patrol bot, unattended

Between the seed runs the patrol bot (\`${BOT}\`, cron every 10 minutes) filed **${bot.length}** challenges on its own against ${botAgents.length} agents: ${cnt(bot, "BREACH")} final BREACH, ${cnt(bot, "COMPLIANT")} COMPLIANT, ${cnt(bot, "INCONCLUSIVE")} INCONCLUSIVE, ${bot.filter((c) => c.status !== "FINAL").length} still open. ${botBreach(0)} of its BREACHes are against payout bot A (#0), which kept calling the batch executor its C3 forbids and sending tokens its C1 does not list, until its bond reached 0 and it was paused${botBreach(2) ? `; ${botBreach(2)} are against payout bot B (#2), each a single transaction sending more than the 5 ETH its C1 allows` : ""}. ${flaggedChurn.length} of its filings were the same accusation against payout bot B's clause C2 ("Only send stablecoins"), which the linter had flagged: a breach there can never be slashed, so each came back INCONCLUSIVE and the stake was refunded. That was a flaw in the bot, not the contract; the patrol now never stakes on a flagged clause, and defers instead of filing when the precedent check cannot be read (commit be2e44f).

${head}
${featured.map((c) => row(c, BOT_NOTE[c.challenge_id])).join("\n")}

Every one of the bot's filings, with its ruling: [docs/SEEDS.md](docs/SEEDS.md#every-challenge).`;

const table = `${summary}

### Seeded cases

${head}
${seeded.map((c) => row(c, NOTE[caseOf(c.challenge_id)] ?? "")).join("\n")}

${extra.join("\n")}

${botBlock}
`;
let readme = readFileSync(root + "README.md", "utf8");
readme = readme.replace(/<!--SEED-->[\s\S]*<!--\/SEED-->/, `<!--SEED-->\n${table}\n<!--/SEED-->`);
writeFileSync(root + "README.md", readme);

let demoMd = "";
if (existsSync(root + "docs/seed-demo.json")) {
  const d = JSON.parse(readFileSync(root + "docs/seed-demo.json", "utf8"));
  const dl = await view(DEMO, "get_ledger");
  demoMd = `\n## Demo contract — every path, drained to zero\n\n[\`${DEMO}\`](${EX}/address/${DEMO}), same code, 90 s windows. Every step is a transaction on Studio Dev; a refusal is a successful transaction that returned \`ok: false\` (payable methods) or a revert with the contract's reason.\n\n| Step | Tx | Status | Result |\n|---|---|---|---|\n` +
    d.steps.map((s) => {
      const h = s.hash ?? s.request?.hash;
      const res = s.returned ? JSON.stringify(s.returned).slice(0, 150) : (s.revert ? `revert: ${String(s.revert).slice(0, 120)}` : (s.skipped ?? ""));
      return `| ${s.name} | ${h ? `[${short(h)}](${EX}/tx/${h})` : "—"} | ${s.status ?? ""} | ${res.split("|").join("/")} |`;
    }).join("\n") +
    `\n\nFinal demo ledger, read from chain: received ${g(dl.received)}, bonds ${g(dl.bonds)}, open stakes ${g(dl.open_stakes)}, claimable ${g(dl.claimable)}, claimed ${g(dl.claimed)} — ${dl.bonds === "0" && dl.open_stakes === "0" && dl.claimable === "0" ? "**drained to exactly 0**" : "not yet drained"}; on-chain balance ${g(dl.on_chain_balance)} GEN = the claimed total, because Studio Dev does not deliver value transfers.\n`;
}
const every = `\n## Every challenge\n\n${head}\n${all.map((c) => row(c, caseOf(c.challenge_id) ? NOTE[caseOf(c.challenge_id)] ?? "seeded" : BOT_NOTE[c.challenge_id] ?? (c.challenger === BOT ? "patrol bot" : ""))).join("\n")}\n`;
writeFileSync(root + "docs/SEEDS.md", `# Seeds\n\n## Canonical register\n\n${table}${demoMd}${every}`);
console.log(summary);
