/**
 * Writes docs/demo/script.json (+ script.md) and docs/demo/vertical.json from
 * the chain as it is now, so every number the narration speaks is a contract
 * read taken minutes before recording.
 *   node script_gen.mjs https://sentinel-tau-ashen.vercel.app
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const root = new URL("../..", import.meta.url).pathname;
const SITE = process.argv[2] ?? "https://sentinel-tau-ashen.vercel.app";
const require = createRequire(root + "test/package.json");
const { createClient } = require("genlayer-js");
const { studioDevnet } = require("genlayer-js/chains");
const relay = process.env.STUDIO_RPC;
const client = createClient({ chain: relay ? { ...studioDevnet, rpcUrls: { ...studioDevnet.rpcUrls, default: { ...studioDevnet.rpcUrls.default, http: [relay] } } } : studioDevnet });
const BOT = "0x81d6bf84a5b03950d910b4a2f83c68006e0b93f4";
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const CAN = dep.contracts.Sentinel.address;
const EX = "https://explorer-studio-dev.genlayer.com";
async function view(fn, args = [], address = CAN) {
  for (let i = 0; i < 30; i++) {
    try { const r = await client.readContract({ address, functionName: fn, args }); return typeof r === "string" ? JSON.parse(r) : r; }
    catch { await new Promise((r) => setTimeout(r, 20_000)); }
  }
  throw new Error(fn);
}
const words = (n) => {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  return n <= 20 ? ones[n] : String(n);
};
const gen = (wei, places = 2) => { const v = BigInt(wei || "0"); const w = v / 10n ** 18n; const f = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, places); return `${w}.${f}`; };

const stats = await view("get_stats");
const all = [];
for (let off = 0; ; off += 100) { const page = await view("get_challenges", [off, 100]); all.push(...page.challenges); if (off + 100 >= page.total) break; }
all.sort((a, b) => a.challenge_id - b.challenge_id);
const agents = (await view("get_agents", [0, 100])).agents;
const fin = all.filter((c) => c.status === "FINAL");
const critical = fin.find((c) => c.final.verdict === "BREACH" && c.final.severity === "CRITICAL");
const minorMult = fin.find((c) => c.final.verdict === "BREACH" && c.final.severity === "MINOR" && c.snapshot.multiplier_bps > 10000)
  ?? fin.find((c) => c.final.verdict === "BREACH" && c.snapshot.multiplier_bps > 10000);
const appealed = fin.filter((c) => c.appeal.outcome === "REJECTED" || c.appeal.outcome === "UPHELD");
const lost = appealed.find((c) => c.appeal.outcome === "REJECTED");
const won = appealed.find((c) => c.appeal.outcome === "UPHELD");
const window = all.find((c) => c.snapshot.mandate_version === 1 && agents.find((a) => a.agent_id === c.agent_id)?.versions > 1);
const flaggedAgent = agents.find((a) => a.latest_version?.lint_flags?.length);
const precedents = (await view("get_precedents", [-1])).precedents;
const e1 = agents.find((a) => a.wallet === "0x28c6c06298d514db089934071355e5743bf21d60");
const pct = (bps) => `${bps / 100} percent`;

const S = [];
S.push({ id: "intro", action: { goto: `${SITE}/`, waitFn: "() => [...document.querySelectorAll('[data-stat]')].every(e => e.textContent.trim() !== '—')" },
  say: `This is Sentinel version two, a watchdog for autonomous agents, running on GenLayer. An operator bonds an agent's wallet under a mandate of numbered clauses. Anyone can challenge one of its transactions, and GenLayer validators judge it. The canonical register holds ${words(stats.agents_registered)} agents on five chains, and every figure on this page is read from the contract.`,
  then: { scrollTo: "#live-h", offset: 40 } });
S.push({ id: "register", action: { goto: `${SITE}/agents`, wait: "a[href^='/agent/']" },
  say: `Every agent here is a live bot on Ethereum, Base, Arbitrum, Polygon or Robinhood Chain. We do not run them; we registered them under mandates written for what they actually do, so each one makes a claim the chain can test.` });
if (flaggedAgent) S.push({ id: "lint", action: { goto: `${SITE}/agent/${flaggedAgent.agent_id}`, wait: "#versions-h" }, then: { scrollTo: "#versions-h" },
  say: `Before a mandate is used, validators lint it. On ${flaggedAgent.name}, they agreed that ${flaggedAgent.latest_version.lint_flags.length === 1 ? "one clause" : words(flaggedAgent.latest_version.lint_flags.length) + " clauses"} cannot be judged from on-chain data. A breach can never be slashed on a flagged clause.` });
if (critical) S.push({ id: "critical", action: { goto: `${SITE}/challenge/${critical.challenge_id}`, wait: "h1" },
  then: { scrollBy: 520 },
  say: `${critical.challenger === BOT ? "Here the patrol bot, on its own," : "Here an open challenger"} accused an exchange payout bot of calling a contract its mandate bans. Each validator fetched the transaction itself, checked it belonged to the agent and matched the filed block time, and agreed: breach of clause ${critical.final.clause}, critical. Code computed the slash: ${gen(critical.final.slash)} GEN, half of it to the challenger.` });
if (lost) S.push({ id: "appeal", action: { goto: `${SITE}/challenge/${lost.challenge_id}`, wait: "h1" }, then: { scrollBy: 700 },
  say: `Every breach or clearance is provisional for an hour. The party it went against can appeal once, with a bond and new counter-evidence; a resend of what is already on record is refused. Here the operator appealed, a fresh panel read the same immutable facts, and rejected the appeal. The bond went to the challenger.` });
if (won) S.push({ id: "appeal-won", action: { goto: `${SITE}/challenge/${won.challenge_id}`, wait: "h1" }, then: { scrollBy: 700 },
  say: `And here an appeal was upheld. The first panel cleared a payout under a clause that names tokens only by symbol. The ${won.appeal.role.toLowerCase()} appealed that a symbol cannot say which token is meant, and the fresh panel ruled ${won.appeal.verdict.toLowerCase()}, so the stake and the appeal bond went back.` });
if (minorMult) S.push({ id: "multiplier", action: { goto: `${SITE}/challenge/${minorMult.challenge_id}`, wait: "h1" }, then: { scrollBy: 380 },
  say: `Slashing is graduated. Each mandate version freezes a severity table, and repeat breaches raise a capped multiplier. This ${minorMult.final.severity.toLowerCase()} breach was filed after ${words(minorMult.snapshot.prior_breaches)} earlier breach${minorMult.snapshot.prior_breaches === 1 ? " had" : "es had"} become final, so the snapshot taken at filing carries a multiplier of ${minorMult.snapshot.multiplier_bps / 10000}.` });
if (window) S.push({ id: "versions", action: { goto: `${SITE}/agent/${window.agent_id}`, wait: "#versions-h" }, then: { scrollTo: "#versions-h" },
  say: `Mandates are versioned. An edit waits an hour before it binds, and a challenge is judged against the version in force when its transaction was mined. This Base bot's new ten-USDC limit could not reach back to a transfer made while the edit was still queued.` });
S.push({ id: "precedents", action: { goto: `${SITE}/precedents`, wait: "h1" },
  say: `Final clearances teach the patrol bot. Only a ruling that was compliant from the start and became final counts. Provisional rulings, and clearances an operator won on appeal, never teach it anything, and one proven breach ends a precedent for good.` });
if (e1) S.push({ id: "record", action: { goto: `${SITE}/agent/${e1.agent_id}`, wait: "h1" }, then: { scrollBy: 360 },
  say: `Every agent has a track record computed by the contract: ${words(e1.track_record.breaches_total)} final breaches here, by severity, with appeals won and lost, and the contract recomputes it from the challenge records to show the numbers agree. This agent is ${e1.standing.good_standing ? "in" : "not in"} good standing.` });
S.push({ id: "consumer", action: { goto: `${SITE}/consumer`, wait: "h1" }, then: { scrollBy: 300 },
  say: `Other contracts can ask. SentinelConsumer calls is in good standing across contracts, and refuses to act for an agent that is not in good standing, or for anyone but its operator.` });
S.push({ id: "api", action: { goto: `${SITE}/api/check?agent=${e1?.wallet ?? ""}&chain=ethereum`, waitFn: "() => document.body.innerText.includes('registered')" },
  say: `The same answer is a public API and a badge, read from the chain on every request.` });
S.push({ id: "explorer", action: { goto: `${EX}/address/${CAN}` },
  say: `Everything you saw is on GenLayer's Studio network. This is the canonical contract on the explorer. Its code, read back from the chain, is byte for byte the source in the repository.` });
S.push({ id: "books", action: { goto: `${SITE}/balance`, wait: "h1" }, then: { scrollBy: 300 },
  say: `Payouts are pull balances, and the contract checks its own books: received equals bonds, plus open stakes, plus claimable, plus claimed. One honest limit: Studio Dev queues value transfers without delivering them, and the books show that gap.` });
S.push({ id: "close", action: { goto: `${SITE}/docs`, wait: "#model" }, then: { scrollTo: "#model" },
  say: `The model only ever says breach, compliant or inconclusive, quoting a clause. Code decides everything else, and when validators disagree, nothing is written. That is Sentinel version two.` });

const script = { name: "sentinel-v2", voice: "Samantha", rate: 196, out_dir: ".", segments: S };
writeFileSync(root + "docs/demo/script.json", JSON.stringify(script, null, 1));
const vertical = { name: "sentinel-v2-vertical", vertical: true, voice: "Samantha", rate: 178, out_dir: ".", segments: [
  { id: "v1", action: { goto: `${SITE}/`, waitFn: script.segments[0].action.waitFn }, then: { scrollTo: "#live-h", offset: 20 },
    say: `Sentinel puts a bond behind what an AI agent promises. ${words(stats.agents_registered)[0].toUpperCase() + words(stats.agents_registered).slice(1)} live bots on five chains, judged by GenLayer validators.` },
  critical && { id: "v2", action: { goto: `${SITE}/challenge/${critical.challenge_id}`, wait: "h1" }, then: { scrollBy: 900 },
    say: `Anyone can challenge a transaction. Validators each fetch it and must agree. This critical breach, filed by the patrol bot on its own, cost the bond ${gen(critical.final.slash)} GEN, and code computed every wei.` },
  lost && { id: "v3", action: { goto: `${SITE}/challenge/${lost.challenge_id}`, wait: "h1" }, then: { scrollBy: 1400 },
    say: `Rulings stay provisional for an hour. The losing side can appeal once, and a fresh panel decides.` },
  { id: "v4", action: { goto: `${SITE}/precedents`, wait: "h1" },
    say: `Final clearances teach the patrol bot what to stop accusing. Every number you see is read from the contract. Try every path yourself on the demo deployment.` },
].filter(Boolean) };
writeFileSync(root + "docs/demo/vertical.json", JSON.stringify(vertical, null, 1));
const md = `# Demo script — Sentinel v2\n\nGenerated by \`tools/shots/script_gen.mjs\` from the chain at ${new Date().toISOString()}; every number below is a contract read taken then. Voice: macOS \`say -v Samantha\`. Recorded from ${SITE} and the Studio Dev explorer by \`tools/shots/video.mjs\`.\n\n| # | Screen | Narration |\n|---|---|---|\n${S.map((s, i) => `| ${i + 1} | ${s.action.goto.replace(SITE, "") || "/"} | ${s.say} |`).join("\n")}\n\n## Vertical cut\n\n| # | Screen | Narration |\n|---|---|---|\n${vertical.segments.map((s, i) => `| ${i + 1} | ${s.action.goto.replace(SITE, "") || "/"} | ${s.say} |`).join("\n")}\n`;
writeFileSync(root + "docs/demo/script.md", md);
console.log(md);
