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
const dry = existsSync(root + "docs/patrol-dry-run.json") ? JSON.parse(readFileSync(root + "docs/patrol-dry-run.json", "utf8")) : null;
const name = (id) => agents.find((a) => a.agent_id === id)?.name ?? `#${id}`;
const caseOf = (id) => Object.entries(seed.cases).find(([, c]) => c.challenge_id === id)?.[0] ?? "";
// What happened, in plain words, from this run's records. The validators' own reasoning is quoted where it decides.
const usdc = (raw) => (Number(raw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const firstSentence = (t) => { const x = String(t ?? "").split(/(?<=\.)\s/)[0]; return x.length > 220 ? x.slice(0, 217) + "…" : x; };
const NOTE = {
  e1_major: (c) => `the payout bot sent a token that is neither USDT nor USDC: ${c.final.severity || c.ruling.severity} breach. The operator appealed (customer withdrawals); a fresh panel ${c.appeal.outcome === "REJECTED" ? "rejected the appeal, so the appeal bond went to the challenger" : c.appeal.outcome.toLowerCase()}`,
  e1_minor: (c) => `${firstSentence(c.ruling.reasoning)} Filed after ${c.snapshot.prior_breaches} earlier final breach(es), so the snapshot multiplier was ×${c.snapshot.multiplier_bps / 10000}${c.final.slash === "0" ? "; no slash left: the bond had already been taken to 0 by earlier breaches" : ""}`,
  e1_incoming: () => "an open challenger read a token the agent RECEIVED as the agent sending it; the panel saw the agent was only the recipient. Open-challenger loss; the stake went to the operator, and the ruling became a precedent (direction `in:`)",
  e2_compliant: (c) => `an ordinary USDT payout under a clause that names tokens by symbol: ${c.final.verdict}${c.final.precedent_key ? "; became a precedent" : ""}`,
  e2_symbol: (c) => `the same symbol-only clause, filed to test an appeal: the panel's answers could not be used (quote or label did not match the clause), so code recorded ${c.final.verdict} at once and there was nothing to appeal`,
  e2_symbol2: (c) => `a second try at the same question: again ${c.final.verdict} (\`${c.ruling.code}\`), so no appeal`,
  e3_xaut: (c) => `a Tether Gold payout under "Only send stablecoins", a clause the linter had flagged: ${c.final.verdict} (\`${c.ruling.code}\`); stake refunded`,
  e3_vague: (c) => `the linter had flagged C3 (a customer's risk is not in the transaction data): ${c.final.verdict}; stake refunded`,
  base_window: () => "mined while mandate v2 (10 USDC limit) was still queued: judged under v1, COMPLIANT. A filing alleging v2's C3 on it was refused by the contract (\"version 1 has no clause C3\")",
  base_v2: (c) => `mined after v2 took effect: ${firstSentence(c.ruling.reasoning)} ${c.final.verdict || c.ruling.verdict} ${c.final.severity || c.ruling.severity}, filed by an open challenger`,
  rh_call: () => "Robinhood Chain, read by validators through a real browser (Cloudflare): COMPLIANT; became a precedent",
  arb2_call: () => "an ordinary USDC payout on Arbitrum, read through a real browser: COMPLIANT; became a precedent",
  poly2_call: () => "an ordinary token payout on Polygon, read through a real browser: COMPLIANT; became a precedent",
};
const BOT_NOTE = {};
const row = (c, noteIn) => {
  const note = typeof noteIn === "function" ? noteIn(c) : noteIn;
  const verdict = c.status === "FINAL" ? c.final.verdict : c.status;
  const sev = c.final.severity || c.ruling.severity;
  const appeal = c.appeal.outcome ? `${c.appeal.role.toLowerCase()} → ${c.appeal.outcome.toLowerCase()}` : "—";
  const by = c.challenger === BOT ? "patrol bot" : short(c.challenger);
  return `| [#${c.challenge_id}](${SITE}/challenge/${c.challenge_id}) | #${c.agent_id} ${name(c.agent_id)} (${c.chain}) | [${short(c.tx_hash)}](https://${BS[c.chain]}/tx/${c.tx_hash}) | ${c.alleged_clause} | ${by} | ${c.ruling.verdict || "—"}${c.ruling.code ? " `" + c.ruling.code + "`" : ""} | ${appeal} | **${verdict}**${sev ? " " + sev : ""} | ${c.final.slash !== "0" ? g(c.final.slash) : "—"} | ${note} |`;
};
const head = `| Challenge | Agent | Transaction | Clause | Filed by | First ruling | Appeal | Final | Slash (GEN) | What happened |\n|---|---|---|---|---|---|---|---|---|---|`;
const seeded = all.filter((c) => caseOf(c.challenge_id));
const featuredIds = new Set();
for (const want of ["CRITICAL", "MAJOR", "MINOR"]) { const f = all.find((c) => c.challenger === BOT && c.status === "FINAL" && c.final.verdict === "BREACH" && c.final.severity === want); if (f) featuredIds.add(f.challenge_id); }
for (const v of ["COMPLIANT", "INCONCLUSIVE"]) { const f = all.find((c) => c.challenger === BOT && c.status === "FINAL" && c.final.verdict === v); if (f) featuredIds.add(f.challenge_id); }
const featured = all.filter((c) => featuredIds.has(c.challenge_id));
for (const c of featured) BOT_NOTE[c.challenge_id] = `the panel: “${firstSentence(c.ruling.reasoning)}”${c.final.verdict === "BREACH" && c.final.slash === "0" ? " No slash: the bond was already 0." : ""}`;
const bot = all.filter((c) => c.challenger === BOT);
const cnt = (xs, v) => xs.filter((c) => c.status === "FINAL" && c.final.verdict === v).length;
const flaggedChurn = bot.filter((c) => c.agent_id === 2 && c.alleged_clause === "C2");
const botAgents = [...new Set(bot.map((c) => c.agent_id))];
const extra = [
  seed.withdraw_blocked && `- **Withdrawal held back while challenges were open:** with ${seed.withdraw_blocked.open_count} challenges open against payout bot A (#${seed.cases.e1_major?.challenge_id} under appeal, the rest filed by the patrol bot), all ${g(seed.withdraw_blocked.held_for_open)} GEN of its ${g(seed.withdraw_blocked.bond)} GEN bond was held for what they could slash; its operator asked for 1 wei and the contract refused — [tx](${EX}/tx/${seed.withdraw_blocked.hash}): “${seed.withdraw_blocked.revert}”. The partial case is in the demo run below: one open challenge held 0.5 GEN of a 1 GEN bond, and 1 wei over the free 0.5 GEN was refused.`,
  seed.unregister && `- **Unregister:** its operator unregistered agent #${seed.agents.rh.agent_id} (Robinhood keeper A; on the v2.0 deployment this keeper had stopped transacting) to exercise the exit ([tx](${EX}/tx/${seed.unregister.hash})); after the 1 h timelock anyone could finalize it, and it was ([tx](${EX}/tx/${seed.unregister.final?.hash})): status ${seed.unregister.final?.status ?? "?"}, the bond moved to the operator's claimable balance.`,
  seed.edit_base && `- **Mandate edit not applied retroactively:** the Base bot published v2 ([tx](${EX}/tx/${seed.edit_base.tx})) adding a 10 USDC limit, effective ${new Date(seed.edit_base.effective_from * 1000).toISOString()}; see #${seed.cases.base_window?.challenge_id} (mined while it was queued) and #${seed.cases.base_v2?.challenge_id} (mined after) above.`,
  dry && `- **Precedent skip:** ${stats.precedents} precedents exist ([/precedents](${SITE}/precedents)). A live dry run of the patrol ([docs/patrol-dry-run.json](docs/patrol-dry-run.json), ${dry.started_at}) withheld ${dry.skipped_by_precedent} flag(s) because a final COMPLIANT precedent covers that agent, clause and transaction kind${dry.rows?.flatMap((r) => r.skipped_precedent ?? []).length ? ` (for example ${dry.rows.flatMap((r) => r.skipped_precedent)[0].tx_hash.slice(0, 12)}… under ${dry.rows.flatMap((r) => r.skipped_precedent)[0].clause}, covered by #${dry.rows.flatMap((r) => r.skipped_precedent)[0].challenge_id})` : ""}.`,
  consumer.total && `- **SentinelConsumer:** ${consumer.total} requests on [${short(CONS)}](${EX}/address/${CONS}) — ${consumer.carried_out} carried out (the Base bot's operator, agent in good standing), ${consumer.refused} refused (payout bot A: "${consumer.requests.find((r) => r.agent_id === 0)?.reasons.join("; ")}"; and a caller who was not the operator).`,
  `- **No appeal was upheld on this deployment.** The operator's appeal on #${seed.cases.e1_major?.challenge_id} was rejected; both tries at the symbol-only clause (#${seed.cases.e2_symbol?.challenge_id}, #${seed.cases.e2_symbol2?.challenge_id}) came back INCONCLUSIVE at once, which cannot be appealed. Nothing was forced. An upheld appeal is on chain in the v2.0 live history (challenge #10 on [\`0x1d4B73BD…6a90\`](${EX}/address/0x1d4B73BD37785F113a599505D80Bc9BDA3D96a90), [docs/superseded/v2.0.2/SEEDS.md](docs/superseded/v2.0.2/SEEDS.md)), and the path is covered offline (\`test_sentinel.Appeals\`).`,
  `- **Two cases found no transaction:** the cross-chain keeper (agents #${seed.agents.arb?.agent_id} on Arbitrum and #${seed.agents.poly?.agent_id} on Polygon) never called the contracts those cases need; the active payout bots #${seed.agents.arb2?.agent_id} and #${seed.agents.poly2?.agent_id} carry those chains' cases.`,
].filter(Boolean);
const lint = Object.entries(seed.agents).map(([, a]) => { const v = a.lint?.["1"]; return `#${a.agent_id} ${v?.status ?? "?"}${v?.flags?.length ? ` (${v.flags.map((f) => f.clause ?? f).join(", ")} flagged)` : ""}`; }).join(" · ");

const summary = `Canonical contract [\`${CAN}\`](${EX}/address/${CAN}), read ${new Date().toISOString()}.

**${stats.agents_registered} agents on 5 chains · ${stats.challenges_filed} challenges: ${stats.final.BREACH} BREACH, ${stats.final.COMPLIANT} COMPLIANT, ${stats.final.INCONCLUSIVE} INCONCLUSIVE final, ${stats.challenges_open} open · ${stats.appeals.filed} appeals (${stats.appeals.upheld} upheld, ${stats.appeals.rejected} rejected) · ${stats.precedents} precedents · ${g(stats.total_slashed)} GEN slashed, ${g(stats.total_bounties)} GEN in bounties.** Ledger: received ${g(ledger.received)} = bonds ${g(ledger.bonds)} + open stakes ${g(ledger.open_stakes)} + claimable ${g(ledger.claimable)} + claimed ${g(ledger.claimed)} (${ledger.invariant_holds && ledger.views_match_storage ? "holds, and every total matches its recomputation from the records" : "DOES NOT HOLD"}).

Every agent is a live bot we do not operate; every mandate is ours, written for that bot's observable behaviour; every challenge names a real transaction mined after the agent registered; the validators decided each one. Every final BREACH was re-checked by hand against the chain's own RPC: [docs/BREACHES.md](docs/BREACHES.md). Linter at registration: ${lint}.`;

const botBreach = (id) => bot.filter((c) => c.agent_id === id && c.status === "FINAL" && c.final.verdict === "BREACH").length;
const botBlock = `### The patrol bot, unattended

Between the seed runs the patrol bot (\`${BOT}\`, cron every 10 minutes) filed **${bot.length}** challenges on its own against ${botAgents.length} agents: ${cnt(bot, "BREACH")} final BREACH, ${cnt(bot, "COMPLIANT")} COMPLIANT, ${cnt(bot, "INCONCLUSIVE")} INCONCLUSIVE, ${bot.filter((c) => c.status !== "FINAL").length} still open. ${botAgents.map((id) => { const mine = bot.filter((c) => c.agent_id === id); const b = cnt(mine, "BREACH"); return `${mine.length} against ${name(id)} (#${id})${b ? `, ${b} of them final BREACH` : ""}`; }).join("; ")}. ${flaggedChurn.length ? `${flaggedChurn.length} accused a clause the linter had flagged, which can only come back INCONCLUSIVE.` : "None accused a linter-flagged clause: since the v2.0 fix (commit be2e44f) the bot never stakes on one, and it defers instead of filing when the precedent check cannot be read."} Every one of its filings is in the full list below; the first of each kind of outcome:

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
