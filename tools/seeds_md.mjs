/**
 * docs/SEEDS.md and the README's seeded-register table, from the seed state
 * (docs/seed-canonical.json, docs/seed-demo.json) and the chain as it is now.
 *   node tools/seeds_md.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("..", import.meta.url).pathname;
const require = createRequire(root + "test/package.json");
const { createClient } = require("genlayer-js");
const { studioDevnet } = require("genlayer-js/chains");
const client = createClient({ chain: studioDevnet });
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const CAN = dep.contracts.Sentinel.address, DEMO = dep.contracts.SentinelDemo.address;
const EX = "https://explorer-studio-dev.genlayer.com";
const BS = { ethereum: "eth.blockscout.com", base: "base.blockscout.com", arbitrum: "arbitrum.blockscout.com", polygon: "polygon.blockscout.com", robinhood: "robinhoodchain.blockscout.com" };
async function view(address, fn, args = []) {
  for (let i = 0; i < 8; i++) {
    try { const r = await client.readContract({ address, functionName: fn, args }); return typeof r === "string" ? JSON.parse(r) : r; }
    catch { await new Promise((r) => setTimeout(r, 4000 * (i + 1))); }
  }
  throw new Error(fn);
}
const g = (wei) => { const v = BigInt(wei || "0"); const w = v / 10n ** 18n, f = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, ""); return f ? `${w}.${f}` : `${w}`; };
const short = (h) => `${h.slice(0, 8)}…${h.slice(-4)}`;

const seed = JSON.parse(readFileSync(root + "docs/seed-canonical.json", "utf8"));
if (seed.contract.toLowerCase() !== CAN.toLowerCase()) throw new Error("seed state is not for the canonical contract in deployments.json");
const stats = await view(CAN, "get_stats");
const ledger = await view(CAN, "get_ledger");
const all = (await view(CAN, "get_challenges", [0, 100])).challenges.sort((a, b) => a.challenge_id - b.challenge_id);
const agents = (await view(CAN, "get_agents", [0, 100])).agents.sort((a, b) => a.agent_id - b.agent_id);
const caseOf = (id) => Object.entries(seed.cases).find(([, c]) => c.challenge_id === id)?.[0] ?? "";
const NOTE = {
  e1_major: "operator appealed with an argument about customer withdrawals; a fresh panel rejected it (appeal lost)",
  e1_minor: "filed after #4 was final, so the repeat multiplier was ×1.5",
  e1_incoming: "an open challenger misread a deposit the agent received as the agent sending it; the panel saw the agent was only the recipient (open-challenger loss)",
  e2_compliant: "the agent's ordinary USDT payout; unappealed, so it became the precedent the patrol now skips on",
  e2_symbol: "same kind of USDT payout; the challenger appealed that a symbol-only clause cannot identify Tether's USDT",
  e3_xaut: "a payout of Tether Gold under \"Only send stablecoins\": a clause careful readers can read either way, so the losing side appealed",
  e3_vague: "the linter had flagged C3 (a customer's risk is not in the transaction data), so no breach can rest on it",
  arb_critical: "open challenger (watcher2) proved a CRITICAL breach",
  poly_other: "the keeper called a contract its Polygon mandate does not allow",
  base_window: "mined while mandate v2 was queued: judged under v1, which has no amount limit; a filing alleging v2's C3 on it was refused (v1 has no C3)",
  base_v2: "mined after v2 took effect: judged under v2's 10 USDC limit",
  rh_call: "Robinhood Chain, read by validators through a real browser (Cloudflare)",
};
const rows = all.map((c) => {
  const a = agents.find((x) => x.agent_id === c.agent_id);
  const verdict = c.status === "FINAL" ? c.final.verdict : c.status;
  const sev = c.final.severity || c.ruling.severity;
  const appeal = c.appeal.outcome ? `${c.appeal.role.toLowerCase()} → ${c.appeal.outcome.toLowerCase()}` : "—";
  return `| [#${c.challenge_id}](https://sentinel-tau-ashen.vercel.app/challenge/${c.challenge_id}) | #${c.agent_id} ${a?.name ?? ""} (${c.chain}) | [${short(c.tx_hash)}](https://${BS[c.chain]}/tx/${c.tx_hash}) | ${c.alleged_clause} | ${short(c.challenger)} | ${c.ruling.verdict || "—"}${c.ruling.code ? " `" + c.ruling.code + "`" : ""} | ${appeal} | **${verdict}**${sev ? " " + sev : ""} | ${c.final.slash !== "0" ? g(c.final.slash) : "—"} | ${NOTE[caseOf(c.challenge_id)] ?? ""} |`;
});
const ev = seed.events;
const undetermined = ev.filter((e) => e.kind === "resolve" && e.tx_status === "UNDETERMINED");
const extra = [
  seed.withdraw_blocked && `- **Withdrawal blocked while a challenge was open:** operator of agent #${seed.agents.e1.agent_id} called \`request_withdrawal\` while challenge #4 was pending; the contract refused it — [tx](${EX}/tx/${seed.withdraw_blocked.hash}): “${String(seed.withdraw_blocked.revert ?? "").slice(0, 120)}”.`,
  seed.unregister && `- **Unregister:** agent #${seed.agents.rh.agent_id} (Robinhood keeper) stopped transacting after registration; its operator unregistered it ([tx](${EX}/tx/${seed.unregister.hash}))${seed.unregister.final ? ` and, after the 1 h timelock, anyone finalized it ([tx](${EX}/tx/${seed.unregister.final.hash})): status ${seed.unregister.final.status}, bond moved to the operator's claimable balance` : "; finalizing is due after the 1 h timelock"}.`,
  seed.edit_base && `- **Mandate edit not applied retroactively:** agent #${seed.agents.base.agent_id} published v2 ([tx](${EX}/tx/${seed.edit_base.tx})), effective ${new Date(seed.edit_base.effective_from * 1000).toISOString()}. ${seed.cases.base_window?.try_first ? `A filing alleging v2's C3 on a transaction mined before that was refused by the contract ("${String(seed.cases.base_window.try_first.ret?.reason ?? seed.cases.base_window.try_first.revert ?? "").slice(0, 90)}")` : ""}.`,
  undetermined.length && `- **Validator disagreement on chain:** ${undetermined.map((e) => `challenge #${e.challenge_id} (\`resolve_challenge\` ended UNDETERMINED, nothing written, status stayed ${e.after})`).join("; ")}.`,
].filter(Boolean);
const lint = Object.entries(seed.agents).map(([k, a]) => {
  const v = a.lint?.["1"];
  return `#${a.agent_id} ${v?.status ?? "?"}${v?.flags?.length ? ` (${v.flags.map((f) => f.clause ?? f).join(", ")} not judgeable)` : ""}`;
}).join(" · ");

const table = `Canonical contract [\`${CAN}\`](${EX}/address/${CAN}), read ${new Date().toISOString()}.

**${stats.agents_registered} agents on 5 chains, ${stats.challenges_filed} challenges: ${stats.final.BREACH} BREACH, ${stats.final.COMPLIANT} COMPLIANT, ${stats.final.INCONCLUSIVE} INCONCLUSIVE final, ${stats.challenges_open} open; ${stats.appeals.filed} appeals (${stats.appeals.upheld} upheld, ${stats.appeals.rejected} rejected); ${stats.precedents} precedent(s); ${g(stats.total_slashed)} GEN slashed, ${g(stats.total_bounties)} GEN in bounties.** Ledger: received ${g(ledger.received)} = bonds ${g(ledger.bonds)} + open stakes ${g(ledger.open_stakes)} + claimable ${g(ledger.claimable)} + claimed ${g(ledger.claimed)} (${ledger.invariant_holds && ledger.views_match_storage ? "holds, recomputed from records" : "DOES NOT HOLD"}).

Every agent is a live bot we do not operate; every mandate is ours, written for that bot's observable behaviour; every challenge names a real transaction mined after the agent registered; the validators decided each one. Linter: ${lint}.

| Challenge | Agent | Transaction | Clause | Challenger | First ruling | Appeal | Final | Slash (GEN) | What happened |
|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

${extra.join("\n")}
`;
let readme = readFileSync(root + "README.md", "utf8");
readme = readme.replace(/<!--SEED-->[\s\S]*<!--\/SEED-->/, `<!--SEED-->\n${table}\n<!--/SEED-->`);
writeFileSync(root + "README.md", readme);

let demoMd = "";
if (existsSync(root + "docs/seed-demo.json")) {
  const d = JSON.parse(readFileSync(root + "docs/seed-demo.json", "utf8"));
  const dl = await view(DEMO, "get_ledger");
  demoMd = `\n## Demo contract — every path, drained to zero\n\n[\`${DEMO}\`](${EX}/address/${DEMO}), same code, 90 s windows. Every step below is a transaction on Studio Dev; a refusal is a successful transaction that returned \`ok: false\` (payable) or a revert with the contract's reason.\n\n| Step | Tx | Status | Result |\n|---|---|---|---|\n` +
    d.steps.map((s) => {
      const h = s.hash ?? s.request?.hash;
      const res = s.returned ? JSON.stringify(s.returned).slice(0, 140) : (s.revert ? `revert: ${String(s.revert).slice(0, 120)}` : (s.skipped ?? ""));
      return `| ${s.name} | ${h ? `[${short(h)}](${EX}/tx/${h})` : "—"} | ${s.status ?? ""} | ${res.split("|").join("/")} |`;
    }).join("\n") +
    `\n\nFinal demo ledger: received ${g(dl.received)}, bonds ${g(dl.bonds)}, open stakes ${g(dl.open_stakes)}, claimable ${g(dl.claimable)}, claimed ${g(dl.claimed)} — ${dl.bonds === "0" && dl.open_stakes === "0" && dl.claimable === "0" ? "**drained to exactly 0**" : "not yet drained"}; on-chain balance ${g(dl.on_chain_balance)} GEN = the claimed total, because Studio Dev does not deliver value transfers.\n`;
}
writeFileSync(root + "docs/SEEDS.md", `# Seeds\n\n## Canonical register\n\n${table}${demoMd}`);
console.log(table);
