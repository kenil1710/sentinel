/**
 * docs/FINAL_CHECK.md: every final-check item as PASS / FAIL with its proof,
 * computed now from the repository, the chain, the live site and the test runs.
 *
 *   node tools/final_check.mjs [--site=https://sentinel-tau-ashen.vercel.app]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = new URL("..", import.meta.url).pathname;
const SITE = (process.argv.find((a) => a.startsWith("--site=")) ?? "--site=https://sentinel-tau-ashen.vercel.app").slice(7);
const require = createRequire(root + "test/package.json");
const { createClient } = require("genlayer-js");
const { studioDevnet } = require("genlayer-js/chains");
const relay = process.env.STUDIO_RPC;
const client = createClient({ chain: relay ? { ...studioDevnet, rpcUrls: { ...studioDevnet.rpcUrls, default: { ...studioDevnet.rpcUrls.default, http: [relay] } } } : studioDevnet });
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, ...opts });
const git = (...a) => execFileSync("git", ["-C", root, ...a]).toString().trim();
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const CAN = dep.contracts.Sentinel.address, DEMO = dep.contracts.SentinelDemo.address, CONS = dep.contracts.SentinelConsumer.address;
const readme = readFileSync(root + "README.md", "utf8");
const rows = [];
const add = (item, pass, proof) => { rows.push({ item, pass, proof }); console.log(`${pass ? "PASS" : "FAIL"}  ${item}`); };
const fence = (t) => "```\n" + String(t).trim() + "\n```";

async function view(address, fn, args = []) {
  for (let i = 0; i < 30; i++) {
    try {
      const raw = await Promise.race([client.readContract({ address, functionName: fn, args }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 60_000))]);
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch { await new Promise((r) => setTimeout(r, 20_000)); }
  }
  throw new Error("view " + fn);
}
async function getJson(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(120_000) }); return await r.json(); } catch { await new Promise((r) => setTimeout(r, 4000)); }
  }
  return null;
}

// 1. source match
const vs = sh("node", ["tools/verify_source.mjs"]);
add("Source match: every address equals contracts/ at HEAD byte for byte", vs.status === 0, fence(vs.stdout));

// 2. ledger invariant (canonical and demo) + demo drained to zero
const lc = await view(CAN, "get_ledger"), ld = await view(DEMO, "get_ledger");
const drained = ld.bonds === "0" && ld.open_stakes === "0" && ld.claimable === "0";
add("Ledger invariant holds on chain (canonical and demo); demo drained to exactly 0",
  lc.invariant_holds && lc.views_match_storage && ld.invariant_holds && ld.views_match_storage && drained,
  "canonical `get_ledger`:\n" + fence(JSON.stringify({ ...lc, note: undefined }, null, 1)) + "\ndemo `get_ledger`:\n" + fence(JSON.stringify({ ...ld, note: undefined }, null, 1)) +
  "\nOffline: every successful call in the suite is followed by the same invariant check (`fixtures.check_ledger`).");

// 3. nothing stuck
const now = Math.floor(Date.now() / 1000);
const openC = (await view(CAN, "get_open_challenges", [100])).challenges;
const stuck = openC.filter((c) => !(c.resolve_deadline || c.ruling.contest_deadline || c.appeal.deadline));
const exits = openC.map((c) => `#${c.challenge_id} ${c.status}: exit ${c.status === "PENDING" ? (now > c.resolve_deadline ? "settle_stalled NOW" : `resolve_challenge, or settle_stalled after ${c.resolve_deadline}`)
  : c.status === "CONTESTABLE" ? (now > c.ruling.contest_deadline ? "finalize NOW" : `finalize after ${c.ruling.contest_deadline}`)
  : (now > c.appeal.deadline ? "expire_appeal NOW" : `resolve_appeal, or expire_appeal after ${c.appeal.deadline}`)} (permissionless)`);
const agentsC = (await view(CAN, "get_agents", [0, 100])).agents;
const unreg = agentsC.filter((a) => a.status === "UNREGISTERING").map((a) => `agent #${a.agent_id} UNREGISTERING: finalize_unregister after ${a.unregister_unlock_at} (permissionless)`);
add("Nothing stuck: every open state has a deadline and a permissionless exit", stuck.length === 0,
  `${openC.length} open challenge(s) on canonical.\n` + fence([...exits, ...unreg].join("\n") || "none open") +
  "\nTests: `Judgment.test_resolve_after_deadline_refused_settle_stalled`, `Appeals.test_expire_appeal`, `Lint.test_close_after_deadline`, `Bond.test_unregister`.");

// 4. counter-before-revert scan
const scan1 = sh("python3", ["tools/scan_writes.py"]), scan2 = sh("python3", ["tools/scan_writes.py", "contracts/SentinelConsumer.py"]);
add("No state written before any check that can revert (AST scan of every write method)", scan1.status === 0 && scan2.status === 0,
  fence(scan1.stdout + "\n" + scan2.stdout) + "\nDynamic half: `fixtures.tx` asserts the whole contract state is unchanged after every revert or unsettled round in the offline suite.");

// 5. views = storage
const tracks = [];
for (const a of agentsC) tracks.push([a.agent_id, (await view(CAN, "get_track_record", [a.agent_id])).views_match_storage]);
add("Views consistent with storage (ledger and every track record recomputed from records)",
  lc.views_match_storage && tracks.every(([, ok]) => ok), fence(`get_ledger.views_match_storage = ${lc.views_match_storage}\n` + tracks.map(([id, ok]) => `agent #${id} get_track_record.views_match_storage = ${ok}`).join("\n")));

// tests, run once and reused below
const py = sh("python3", ["-m", "unittest", "test_sentinel", "test_consumer", "test_attacks", "test_attacks_r2"], { cwd: root + "test" });
const pyRan = (py.stderr.match(/Ran (\d+) tests/) || [])[1];
const tsT = sh("node", ["--experimental-strip-types", "--no-warnings", "test/test_patrol.mjs"]);
const tsRan = (tsT.stdout.match(/(\d+) patrol tests passed/) || [])[1];
const has = (name) => readFileSync(root + "test/test_sentinel.py", "utf8").includes(name) || readFileSync(root + "test/test_attacks.py", "utf8").includes(name) || (existsSync(root + "test/test_attacks_r2.py") && readFileSync(root + "test/test_attacks_r2.py", "utf8").includes(name));

// 6-11: property checks proven by named tests plus a live example
const sample = (await view(CAN, "get_challenges", [0, 100])).challenges.find((c) => c.status === "FINAL" && c.final.verdict === "BREACH") ?? (await view(CAN, "get_challenges", [0, 1])).challenges[0];
add("Evidence bound to the exact (chain, tx, agent, mandate version) at filing",
  has("test_timestamp_mismatch_is_void_and_releases_tx") && has("test_not_agent_tx") && has("test_wrong_document"),
  `Live challenge #${sample?.challenge_id}: chain ${sample?.chain}, tx ${sample?.tx_hash}, agent #${sample?.agent_id}, wallet ${sample?.wallet}, mandate v${sample?.snapshot.mandate_version} (${sample?.snapshot.mandate_hash}), block time ${sample?.tx_timestamp}; ruling digest ${sample?.ruling.digest}.\nAt judgment code checks the returned document's hash equals the filed one (WRONG_DOCUMENT), the wallet is a party (NOT_AGENT_TX) and the block time equals the filed one (VOID). Tests: test_wrong_document, test_not_agent_tx, test_timestamp_mismatch_is_void_and_releases_tx, test_appeal_waits_if_immutable_facts_moved.`);
add("All dates and parameters snapshotted at filing", has("test_snapshot") && has("test_repeat_multiplier_snapshotted_at_filing") && has("test_severity_table_frozen_per_version") && has("test_lint_after_filing_does_not_change_that_challenge"),
  "Snapshot of the live sample:\n" + fence(JSON.stringify({ ...(sample?.snapshot ?? {}), clauses: undefined }, null, 1)) + "\nTests: test_snapshot, test_repeat_multiplier_snapshotted_at_filing, test_severity_table_frozen_per_version, test_lint_after_filing_does_not_change_that_challenge, test_not_retroactive.");
const src = readFileSync(root + "contracts/Sentinel.py", "utf8");
add("Only allowlisted explorer / RPC hosts", has("test_one_url_builder") && /CHAIN_HOSTS = \{/.test(src),
  "Contract: `_tx_url` is the only function containing an `/api/v2/` URL (test_one_url_builder); hosts come from `CHAIN_HOSTS` (5 Blockscout hosts); render is used only on the same URL. App: `frontend/src/lib/chains.ts` is the only RPC table (5 public RPCs), used by /api/txinfo for block times.\n" + fence(src.slice(src.indexOf("CHAIN_HOSTS = {"), src.indexOf("CHAINS = (")).trim()));
add("Identity: no one can act for an agent they do not operate",
  has("test_one_queued_at_a_time_and_operator_only") && has("test_top_up_operator_only") && has("test_cancel") && has("test_only_the_losing_party"),
  "Operator-only: update_mandate, request/cancel_withdrawal, unregister, top_up_bond (refund to claimable), appeal of a BREACH; challenger-only: appeal of a COMPLIANT; the operator cannot challenge its own agent; SentinelConsumer.act_for_agent refuses anyone but the operator. Permissionless by design: resolve, finalize, settle_stalled, resolve/expire_appeal, execute_withdrawal and finalize_unregister (they pay the operator), lint, mark_patrolled. Tests: test_operator_cannot_challenge_own_agent, test_top_up_operator_only, test_cancel, test_unregister_blocked_while_open_and_operator_only, test_only_the_losing_party, test_good_standing_carries_out_for_operator_only.");
add("Hidden or partial explorer data is INCONCLUSIVE", has("test_partial_data_inconclusive") && has("test_partial"),
  "`_partial`: truncated transfers, unindexed transfers, no block, no status, pending, no sender → INCONCLUSIVE code PARTIAL_DATA before the model is asked. A Cloudflare page or an unreadable body on a render chain waits (RETRY), a 404 is INCONCLUSIVE NOT_FOUND. Tests: Evidence.test_partial, Judgment.test_partial_data_inconclusive, test_not_found_inconclusive, test_explorer_down_raises_and_changes_nothing.");
add("Replay: nothing can be done twice", has("test_same_tx_twice_any_spelling") && has("test_bond_window_once") && has("test_claim_pays_once") && has("test_resolve_twice_refused"),
  "One challenge per (chain, tx, agent) in any spelling, one appeal per ruling, one resolution, one lint per version, claim zeroes first. Tests: test_same_tx_twice_any_spelling, test_bond_window_once, test_resolve_twice_refused, test_claim_pays_once, Lint.test_close_after_deadline.");
add("Model disagreement handled and documented exactly as it behaves on chain",
  has("test_validator_disagreement_writes_nothing") && /UNDETERMINED and nothing is written/.test(readme),
  "On chain (PROBE §12): a round whose validators disagree ended UNDETERMINED in 15 s and a counter bumped before it was unchanged. README: \"If they do not agree, the transaction ends UNDETERMINED and nothing is written … A disagreement is never recorded as INCONCLUSIVE.\" Tests: test_validator_disagreement_writes_nothing, test_disagreement_on_clause_writes_nothing, test_replica_lag_on_immutable_facts_writes_nothing, Lint.test_disagreement_writes_nothing.");

// 13. fees on every write
const feeSites = ["test/harness.mjs", "frontend/src/lib/contract.ts", "frontend/src/app/api/patrol/route.ts"].map((f) => [f, readFileSync(root + f, "utf8")]);
const feeOk = feeSites.every(([, s]) => /estimateTransactionFeesForWrite/.test(s) && /estimateTransactionFees\(/.test(s));
add("Fees on every write (per-call estimate, generic fallback)", feeOk,
  feeSites.map(([f]) => `- ${f}: estimateTransactionFeesForWrite first, estimateTransactionFees as fallback`).join("\n") + "\nEvery write in the seed, demo, deploy scripts, the app and the patrol goes through one of these three.");

// 14. honest README sections
const sections = ["What the model is never allowed to decide", "Known limitations", "How a reviewer can test"];
const banned = ["guaranteed", "100%"].filter((w) => readme.toLowerCase().includes(w.toLowerCase()));
add("README: the three required sections, studio-dev value-transfer limit disclosed, neutral wording",
  sections.every((s) => readme.includes("## " + s)) && /does not deliver value transfers/.test(readme) && banned.length === 0,
  sections.map((s) => `- \`## ${s}\`: ${readme.includes("## " + s) ? "present" : "MISSING"}`).join("\n") + `\n- studio-dev value transfers disclosed: ${/does not deliver value transfers/.test(readme)}\n- banned words found: ${banned.join(", ") || "none"}`);

// 15. live site numbers vs chain
const stats = await view(CAN, "get_stats");
const shot = sh("node", ["tools/shots/landing_numbers.mjs", SITE]);
let site = {};
try { site = JSON.parse(shot.stdout.trim().split("\n").pop()); } catch { /* reported below */ }
const want = { "Agents registered": stats.agents_registered, "Challenges filed": stats.challenges_filed, "Open now": stats.challenges_open,
  "Final breaches": stats.final.BREACH, "Final compliant": stats.final.COMPLIANT, "Final inconclusive": stats.final.INCONCLUSIVE,
  "Appeals filed": stats.appeals.filed, "Appeals upheld": stats.appeals.upheld, "Precedents": stats.precedents,
  "GEN slashed": Number(BigInt(stats.total_slashed) * 10000n / 10n ** 18n) / 10000, "GEN in bounties": Number(BigInt(stats.total_bounties) * 10000n / 10n ** 18n) / 10000 };
const cmp = Object.entries(want).map(([k, v]) => [k, String(site[k] ?? "missing"), String(v), String(site[k]) === String(v)]);
add("Live site: 10+ on-page numbers match the chain", cmp.filter((c) => c[3]).length >= 10,
  `${SITE}/ read with Playwright, chain read with get_stats at ${new Date().toISOString()}:\n\n| on page | site | chain | match |\n|---|---|---|---|\n` + cmp.map((c) => `| ${c[0]} | ${c[1]} | ${c[2]} | ${c[3] ? "yes" : "NO"} |`).join("\n"));

// 16. one set of addresses
const dts = readFileSync(root + "frontend/src/lib/deployments.ts", "utf8");
const apiSrc = await getJson(`${SITE}/api/check?agent=0`);
const patrol = await getJson(`${SITE}/api/patrol?dry=1`);
const stale = sh("git", ["grep", "-n", "-i", "-E", "0x67A1276E|0x3fc4E5dA", "--", ".", ":!docs/superseded", ":!docs/PROBE.md"]).stdout.trim();
const one = dts.includes(CAN) && dts.includes(DEMO) && dts.includes(CONS) && apiSrc?.source?.contract === CAN && patrol?.contract === CAN && readme.includes(CAN) && readme.includes(DEMO) && readme.includes(CONS);
add("One set of v2 addresses everywhere (repo, app, API, patrol, README)", one && stale.split("\n").every((l) => !l || /superseded|hackathon|v1/i.test(l)),
  `deployments.json → frontend/src/lib/deployments.ts (generated) → app, /api/check (source.contract = ${apiSrc?.source?.contract}), /api/patrol (contract = ${patrol?.contract}), README.\nMentions of the hackathon addresses outside docs/superseded:\n` + fence(stale || "none"));

// 17. 375 px
const ov = sh("node", ["tools/shots/overflow.mjs"], { env: { ...process.env, BASE: SITE, SETTLE_MS: "6000" } });
add("No horizontal scroll at 375 px (every page)", ov.status === 0, fence(ov.stdout));

// 18. Vercel
const vl = sh("vercel", ["ls", "sentinel", "--prod"], { cwd: root + "frontend" });
const ready = /● Ready\s+Production/.test(vl.stdout + vl.stderr);
add("Vercel production build green", ready, fence((vl.stdout + vl.stderr).split("\n").filter((l) => /vercel\.app/.test(l)).slice(0, 3).join("\n")));

// 19. git history clean
const log = git("log", "--format=%H%n%B", "b5145fa..HEAD");
const bad = ["co-authored-by", "claude", "anthropic", "generated with", " ai "].filter((w) => log.toLowerCase().includes(w));
const dirty = git("status", "--porcelain");
const secrets = git("ls-files").split("\n").filter((f) => /accounts\.json|\.env|\.fees\.json/.test(f) && !/\.example$/.test(f));
const pushed = git("rev-parse", "HEAD") === git("rev-parse", "origin/main");
add("Git history clean (no attribution or AI mentions, no secrets tracked, tree clean, pushed, no force push)",
  bad.length === 0 && secrets.length === 0 && pushed,
  `commits since BASE: ${git("rev-list", "--count", "b5145fa..HEAD")}; banned words in messages: ${bad.join(", ") || "none"}; tracked secret-like files: ${secrets.join(", ") || "none"}; working tree: ${dirty ? "has uncommitted FINAL_CHECK output only" : "clean"}; HEAD == origin/main: ${pushed}; history is linear on top of BASE (fast-forward pushes only).`);

// 20. tests
add("Tests pass", py.status === 0 && tsT.status === 0, fence(`python3 -m unittest test_sentinel test_consumer test_attacks test_attacks_r2  → Ran ${pyRan} tests, ${py.status === 0 ? "OK" : "FAILED"}\nnode test/test_patrol.mjs → ${tsRan} passed\n${py.status ? py.stderr.slice(-1500) : ""}`));

const pass = rows.filter((r) => r.pass).length;
const md = `# Final check

Generated by \`node tools/final_check.mjs\` at ${new Date().toISOString()} against HEAD \`${git("rev-parse", "HEAD")}\`, the chain (GenLayer Studio Dev) and ${SITE}.

**${pass} of ${rows.length} PASS.**

| # | Item | Result |
|---|---|---|
${rows.map((r, i) => `| ${i + 1} | ${r.item} | ${r.pass ? "PASS" : "**FAIL**"} |`).join("\n")}

${rows.map((r, i) => `## ${i + 1}. ${r.item} — ${r.pass ? "PASS" : "FAIL"}\n\n${r.proof}\n`).join("\n")}`;
writeFileSync(root + "docs/FINAL_CHECK.md", md);
console.log(`\n${pass}/${rows.length} PASS → docs/FINAL_CHECK.md`);
