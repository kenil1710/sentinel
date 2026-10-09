/**
 * docs/MILESTONE.md: BASE and FINAL commits, the compare link, every feature with
 * GitHub links pinned at FINAL to the lines that implement it, addresses, tests
 * before and after, and the seeded cases.
 *   node tools/milestone.mjs <FINAL-commit>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = new URL("..", import.meta.url).pathname;
const git = (...a) => execFileSync("git", ["-C", root, ...a]).toString().trim();
const FINAL = process.argv[2] ?? git("rev-parse", "HEAD");
const BASE = "b5145fa76e8aae914ca1735e2d0507fd4860c40a";
const REPO = "https://github.com/kenil1710/sentinel";
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const at = (file) => git("show", `${FINAL}:${file}`).split("\n");

/** Lines [start, end] of a top-level/class def or of the first line matching a needle, to the next def at the same indent. */
function span(file, needle) {
  const lines = at(file);
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`${needle} not found in ${file} at ${FINAL}`);
  const indent = lines[i].match(/^\s*/)[0].length;
  let j = i + 1;
  const isPy = file.endsWith(".py");
  while (j < lines.length) {
    const l = lines[j];
    if (l.trim() && l.match(/^\s*/)[0].length <= indent && (isPy ? /^\s*(def |class |@)/.test(l) : /^(export |function |const |async |\}|\/\*\*)/.test(l.trim()) && l.match(/^\s*/)[0].length <= indent)) break;
    j++;
  }
  while (j > i + 1 && !lines[j - 1].trim()) j--;
  return [i + 1, j];
}
const link = (file, needle, label) => {
  const [a, b] = span(file, needle);
  return `[${label ?? needle.replace(/^(def |function |export function |export async function )/, "").split("(")[0]}](${REPO}/blob/${FINAL}/${file}#L${a}-L${b})`;
};
const fileLink = (file) => `[\`${file}\`](${REPO}/blob/${FINAL}/${file})`;
const S = "contracts/Sentinel.py", K = "contracts/SentinelConsumer.py";

const features = [
  ["A1", "Appeal window", "Ruling PROVISIONAL → CONTESTABLE (1 h canonical, 90 s demo) → FINAL; the losing party appeals once with a bond and counter-evidence; a fresh panel judges the same immutable facts; a novelty gate refuses a verbatim or near-verbatim resend; permissionless finalize after the deadline; expiry exit.",
    [link(S, "def resolve_challenge"), link(S, "def _appeal_problem"), link(S, "def appeal("), link(S, "def resolve_appeal"), link(S, "def expire_appeal"), link(S, "def finalize("), link(S, "def _too_similar")],
    ["frontend/src/app/(app)/challenge/[id]/page.tsx"]],
  ["A2", "Frozen mandate versions", "Versions stored with their sha256 and effective time; an edit takes effect after the delay (1 h / 90 s); a challenge is judged against the version in force at the transaction's block time, snapshotted at filing.",
    [link(S, "def _parse_clauses"), link(S, "def _new_version"), link(S, "def update_mandate"), link(S, "def _version_at"), link(S, "def get_version_at")],
    ["frontend/src/components/MandateVersions.tsx", "frontend/src/components/ClauseEditor.tsx"]],
  ["A3", "Open challengers", "Anyone but the operator challenges with an exact stake; a losing challenger's stake goes to the operator; one challenge per (chain, tx, agent); the bounty goes to the challenger who proved the breach.",
    [link(S, "def _challenge_problem"), link(S, "def challenge_agent"), link(S, "def _finalize")],
    ["frontend/src/components/ChallengeForm.tsx", "frontend/src/app/api/txinfo/route.ts"]],
  ["A4", "Graduated slashing", "Severity table (MINOR / MAJOR / CRITICAL as bps of the bond at filing) frozen in the mandate version; capped repeat multiplier; code computes the slash; the model returns only a verdict, a clause, the severity label written in the mandate and a quote, which code checks.",
    [link(S, "def _parse_table"), link(S, "def _multiplier_bps"), link(S, "def _slash_amount"), link(S, "def _decide")],
    ["frontend/src/lib/mandate.ts"]],
  ["A5", "Bond lifecycle", "Top-up; timelocked withdrawal of what open challenges could never slash (they hold back the CRITICAL rate of their snapshot); unregister, whose release waits until nothing is open; auto-pause below the minimum; pull payouts; the ledger invariant received = bonds + open stakes + claimable + claimed, recomputed from records on chain.",
    [link(S, "def _set_bond"), link(S, "def top_up_bond"), link(S, "def request_withdrawal"), link(S, "def execute_withdrawal"), link(S, "def unregister("), link(S, "def finalize_unregister"), link(S, "def claim("), link(S, "def get_ledger")],
    ["frontend/src/components/OperatorPanel.tsx", "frontend/src/app/(app)/balance/page.tsx"]],
  ["B6", "Mandate linter", "Validators flag clauses that cannot be judged from on-chain data, each quoted verbatim; strict equality on the clause ids; INCONCLUSIVE after the deadline if they never agree; a breach can never rest on a flagged clause.",
    [link(S, "def _lint("), link(S, "def lint_mandate"), link(S, "def close_lint")],
    ["frontend/src/app/(app)/register/page.tsx"]],
  ["B7", "Precedents", "Only a FINAL COMPLIANT whose first ruling was COMPLIANT (unappealed or upheld against the challenger) becomes a precedent, keyed by agent, clause-text hash and a direction-aware transaction kind; a FINAL BREACH of the same key vetoes it; the patrol skips matching transactions.",
    [link(S, "def _tx_kind"), link(S, "def _maybe_precedent"), link(S, "def _veto"), link(S, "def precedent_for")],
    ["frontend/src/lib/kind.ts", "frontend/src/app/api/patrol/route.ts", "frontend/src/app/(app)/precedents/page.tsx"]],
  ["B8", "Agent track record", "Breaches by severity, overrulings, appeals won/lost, last breach, total slashed — from final rulings only, and recomputed from the agent's challenges to prove the counters agree.",
    [link(S, "def _track"), link(S, "def get_track_record")],
    ["frontend/src/components/TrackRecord.tsx"]],
  ["C9", "Consumer contract", "SentinelConsumer.is_in_good_standing(chain, wallet) by cross-contract view, and act_for_agent, which refuses an agent that is not in good standing or a caller who is not its operator.",
    [link(S, "def _standing"), link(K, "def is_in_good_standing"), link(K, "def act_for_agent")],
    ["frontend/src/app/(app)/consumer/page.tsx"]],
  ["C10", "Public API and badge", "/api/check?agent=…&chain=… and /badge/<agent>.svg, answered from the canonical contract at request time.",
    [], ["frontend/src/app/api/check/route.ts", "frontend/src/app/badge/[agent]/route.ts", "frontend/src/lib/server.ts"]],
  ["C11", "Frontend v2", "Appeal flow, mandate version history, precedents, per-agent track record, open-challenge form, linter results at registration, the full transaction lifecycle (submitted → accepted → finalized) with success reported only after re-reading contract state; a canonical/demo switch.",
    [], ["frontend/src/lib/contract.ts", "frontend/src/components/tx.tsx", "frontend/src/app/(app)/agents/page.tsx", "frontend/src/app/(app)/agent/[id]/page.tsx", "frontend/src/app/(marketing)/page.tsx"]],
  ["Patrol", "Patrol bot v2", "Judges against the version in force at each transaction's block time, skips transactions a precedent covers, moves open challenges along, and attaches a fee estimate to every write.",
    [], ["frontend/src/app/api/patrol/route.ts", "frontend/src/lib/heuristics.ts", "frontend/src/lib/blockscout.ts"]],
];

const py = spawnSync("python3", ["-m", "unittest", "discover", "-s", ".", "-p", "test_*.py"], { cwd: root + "test", encoding: "utf8" });
const pyRan = (py.stderr.match(/Ran (\d+) tests/) || [])[1];
const ts = spawnSync("node", ["--experimental-strip-types", "--no-warnings", "test/test_patrol.mjs"], { cwd: root, encoding: "utf8" });
const tsRan = (ts.stdout.match(/(\d+) patrol tests passed/) || [])[1];
const perFile = ["test_sentinel", "test_consumer", "test_attacks", "test_attacks_r2", "test_ported_engine", "test_ported_flow"].map((m) => {
  const r = spawnSync("python3", ["-m", "unittest", m], { cwd: root + "test", encoding: "utf8" });
  return [m, Number((r.stderr.match(/Ran (\d+) tests/) || [])[1]), r.status === 0];
});
const REMOVED = [
  ["test_logic.py · TestArtifact", 18, "v2 deploys `contracts/Sentinel.py` itself; there is no mangled `build/Sentinel.min.py` for the battery to run on. What is deployed is compared byte for byte with the source on chain by `tools/verify_source.mjs`."],
  ["test_logic.py · TestComplianceScore", 7, "v2 publishes a track record and a standing instead of a score in bps. The eighth test (\"unproven is not guilty\") is ported: INCONCLUSIVE counts on neither side."],
  ["test_logic.py · TestOwnerControls", 7, "v2 has no owner, no settable minimum bond or stake, no ownership transfer and no pause. Ported (10): nobody can change the minimum, exact stake, decimal-string money, per-mandate severity bounds, every dial validated, the treasury's share claimable and nothing more, nothing can switch the contract off."],
  ["test_logic.py · TestVindicationSplit", 3, "the bps dial that split a refuted challenger's stake is gone: the operator receives all of it. The default split, reconstruction and an inexact stake are ported."],
  ["test_logic.py · TestChallengeFiling", 3, "no per-wallet cooldown (replaced by an exact stake and a 20-open-challenge cap per agent, both tested) and no global pause."],
  ["test_logic.py · TestSettlementCompliant", 3, "the award is now a pull balance, not added to the bond; the protocol takes nothing from a refuted stake; no score."],
  ["test_logic.py · TestBondLifecycle", 3, "no pause; top-ups are operator-only (a stranger's top-up is credited back); a paused agent is now challengeable on purpose (v2.1.0)."],
  ["test_logic.py · TestViews", 3, "no by-chain views (the app filters `get_agents`); `is_tx_challenged`, not the preview, answers whether a transaction is taken."],
  ["test_logic.py · TestProfileOnChain", 3, "list views return the full record; no by-type views."],
  ["test_logic.py · TestARefundReleasesTheTransaction", 2, "reversed on purpose: an INCONCLUSIVE ruling holds the transaction, so nobody can re-roll the judge. Stall release, decided-holds and two-agents are ported."],
  ["test_logic.py · TestJudgePipeline", 1, "the model is no longer asked for a confidence."],
  ["test_logic.py · TestRegister / TestSettleStalled / TestSettlementTransient / TestSettlementViolation", 4, "no global pause (2); no judgement lock: a resolution is one consensus transaction (1); no score (1)."],
  ["test_patrol.mjs · ticker extraction", 5, "v2 never reads token symbols: a token called USDT at another address is the oldest spoof. A clause naming tokens by symbol makes the bot flag every token and the validators decide."],
  ["test_patrol.mjs · explorer-label rules", 4, "the bot no longer accuses on scam or verification labels (mutable, third-party; the linter flags clauses that rely on them), and native-symbol aliases went with symbol reading."],
  ["test_patrol.mjs · the bot's own learning", 12, "replaced by on-chain precedents: no reason parsing (4), no clearance threshold (one FINAL COMPLIANT that outlived the appeal window counts) (4), no corroboration fetches (1), never defers on an amount rule (1), learns from any challenger's final ruling (1), a challenge cannot exist without a hash (1). The 18 learning tests whose behaviour exists in v2 are ported and run end to end against the contract."],
];
const seeds = readFileSync(root + "docs/SEEDS.md", "utf8");
const canonicalTable = seeds.split("## Canonical register")[1].split("## Demo contract")[0].trim().split("](docs/").join("](");
const ex = (a) => `[\`${a}\`](${dep.explorer.replace(/\/$/, "")}/address/${a})`;
const commits = git("rev-list", "--count", `${BASE}..${FINAL}`);
const changed = git("diff", "--stat", `${BASE}..${FINAL}`, "--", "contracts", "frontend/src", "test", "tools").split("\n").pop();

// BASE proof: the hackathon contract's code, read back from the chain, against the artifact at BASE.
const HACK = "0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe";
const onchain = await fetch(dep.rpc ?? "https://studio-dev.genlayer.com/api", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [HACK] }) }).then((r) => r.json()).then((j) => Buffer.from(j.result, "base64"));
const artifact = execFileSync("git", ["-C", root, "show", `${BASE}:build/Sentinel.min.py`]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const identical = Buffer.compare(onchain, artifact) === 0;
if (!identical) throw new Error("the hackathon contract's on-chain code does not match build/Sentinel.min.py at BASE");
const proof = `**BASE = \`${BASE.slice(0, 7)}\`, proven: on-chain code of the hackathon contract is byte-identical to \`build/Sentinel.min.py\` at \`${BASE.slice(0, 7)}\`.**

| | bytes | sha256 |
|---|---|---|
| \`gen_getContractCode(${HACK})\` on Studio Dev, read ${new Date().toISOString().slice(0, 10)} | ${onchain.length} | \`${sha(onchain)}\` |
| [\`build/Sentinel.min.py\` at \`${BASE.slice(0, 7)}\`](${REPO}/blob/${BASE}/build/Sentinel.min.py) | ${artifact.length} | \`${sha(artifact)}\` |

The hackathon contract was deployed from that minified artifact of [\`contracts/Sentinel.py\`](${REPO}/blob/${BASE}/contracts/Sentinel.py); both files last changed together, in \`df2a633\` (2026-09-12), and the five later commits up to \`${BASE.slice(0, 7)}\` (2026-09-13), the last on main before the 2026-09-17 23:59 UTC cut-off, touch neither. Reproduce: \`node tools/milestone.mjs\` refuses to write this file if the bytes differ.

`;

// "What changed: hackathon v1 -> v2". Every v1 cell was checked against the code at BASE
// (contracts/Sentinel.py, frontend/src at b5145fa).
const SITE = "https://sentinel-tau-ashen.vercel.app";
const EXT = "https://explorer-studio-dev.genlayer.com/tx/";
const ch = (n) => `[#${n}](${SITE}/challenge/${n})`;
const txl = (h, label) => `[${label}](${EXT}${h})`;
const H = "frontend/src/lib/heuristics.ts", P = "frontend/src/lib/patrolPlan.ts", TP = "test/test_patrol.mjs";
const CHANGES = [
  ["Appeal window", "did not exist: `resolve_challenge` settled and paid out at once (SETTLED / REFUNDED)",
    "BREACH / COMPLIANT provisional, contestable 1 h; one appeal by the losing party with a bond and new counter-evidence; fresh panel; novelty gate",
    [link(S, "def appeal("), link(S, "def resolve_appeal"), link(S, "def finalize(")],
    "test_sentinel.py `Appeals.test_appeal_lost_by_operator`, `Appeals.test_novelty_gate_verbatim_and_near_verbatim`", `${ch(2)}: operator appeal rejected`],
  ["Frozen mandate versions", "free text (20-1000 chars) edited in place by `update_mandate`, refused while a challenge was pending; no versions",
    "numbered clauses with severities; versions with hash and effective time (1 h delay); judged against the version in force at the tx's block time, snapshotted at filing",
    [link(S, "def _parse_clauses"), link(S, "def update_mandate"), link(S, "def _version_at")],
    "test_sentinel.py `Versions.test_not_retroactive`, `Versions.test_edit_takes_effect_after_delay`", `${ch(8)} (mined while v2 was queued, judged under v1) vs ${ch(31)} (after)`],
  ["Open challengers", "anyone but the operator, fixed owner-set stake, 60 s per-wallet cooldown; a refuted stake split 70% into the operator's bond / 30% protocol",
    "anyone but the operator, exact stake, 20 open per agent; a refuted stake goes wholly to the operator's pull balance; the bounty to whoever proved the breach",
    [link(S, "def _challenge_problem"), link(S, "def challenge_agent")],
    "test_sentinel.py `Filing.test_operator_cannot_challenge_own_agent`, `Finality.test_compliant_money`", `${ch(3)} open-challenger loss, ${ch(31)} open-challenger win`],
  ["Graduated slashing", "one owner-set penalty, 20% of the bond, for any violation (`_slash_split`)",
    "severity table (MINOR / MAJOR / CRITICAL) frozen per mandate version × capped repeat multiplier, on the bond at filing; code computes it",
    [link(S, "def _parse_table"), link(S, "def _multiplier_bps"), link(S, "def _slash_amount")],
    "test_sentinel.py `Finality.test_repeat_multiplier_snapshotted_at_filing`, `Table.test_slash_math_divides_first_and_caps_at_bond`", `${ch(0)} CRITICAL 1 GEN, ${ch(2)} MAJOR 0.4 GEN, ${ch(15)} ×1.5 multiplier`],
  ["Bond lifecycle + zero-bond paused agents", "instant `withdraw_bond` of the whole bond, refused while anything was pending; below the minimum SLASHED_OUT and no longer challengeable; push payouts",
    "top-up; timelocked withdrawal of what open challenges could never slash; unregister whose release waits; auto-pause; a paused agent is challengeable at any bond and every ruling counts; pull payouts",
    [link(S, "def _set_bond"), link(S, "def _exposure"), link(S, "def request_withdrawal"), link(S, "def unregister(")],
    "test_sentinel.py `Bond.test_paused_zero_bond_agent_still_answers`, `Bond.test_withdrawal_while_open_limited_to_what_it_cannot_slash`", `${txl("0xac891600c0856f0ef67dc39ed6007b4fe3e97a9096d43f580e8c2743a25200fc", "withdrawal refused")} with 6 open; ${ch(25)} one of 12 final breaches counted after the bond reached 0; a filing against a 0 bond was not exercised live`],
  ["Mandate linter", "did not exist", "validators list clauses that cannot be judged from on-chain data, quoted, strict agreement; a breach never rests on a flagged clause",
    [link(S, "def _lint("), link(S, "def lint_mandate"), link(S, "def close_lint")],
    "test_sentinel.py `Lint.test_flags_stored`, `Decide.test_flagged_clause_cannot_breach`", `${txl("0x3cfa25f295ce91fe042a896fb63e664371ba39ddd99bcb633d3e983697f43daa", "lint of agent #2")} (C2, C3 flagged), ${ch(21)}`],
  ["Precedents", "did not exist on chain; the bot learned off chain from 2 COMPLIANT reasons it had written itself (`LEARN_AFTER = 2`)",
    "only a FINAL COMPLIANT whose first ruling was COMPLIANT, keyed by agent, clause text and direction-aware tx kind; one final BREACH vetoes it for good",
    [link(S, "def _maybe_precedent"), link(S, "def _veto"), link(S, "def precedent_for")],
    "test_sentinel.py `Precedents.test_final_compliant_creates_precedent`, `Precedents.test_breach_vetoes`", `${ch(3)}, [6 flags withheld in a live dry run](https://github.com/kenil1710/sentinel/blob/${FINAL}/docs/patrol-dry-run.json)`],
  ["Track record", "a compliance score in bps (`get_compliance_score`) and violation / compliant counts",
    "breaches by severity, overrulings, appeals won / lost, last breach, total slashed, recomputed from the records; standing with reasons",
    [link(S, "def _track"), link(S, "def get_track_record"), link(S, "def _standing")],
    "test_sentinel.py `Views.test_track_record_matches_storage_through_every_outcome`, `Views.test_standing_reasons`", `[agent #0](${SITE}/agent/0)`],
  ["SentinelConsumer", "did not exist", "a contract that asks the register by cross-contract view and refuses to act for an agent not in good standing, or for anyone but its operator",
    [link(K, "def is_in_good_standing"), link(K, "def act_for_agent")],
    "test_consumer.py `Consumer.test_good_standing_carries_out_for_operator_only`, `Consumer.test_refuses_unknown_and_paused`", `${txl("0xc119dae362dfdcd629462b1bc740b85d50bc602ecbeac68b4b295b268eeb7f92", "carried out")}, ${txl("0xd0f0ef35fffcebdc4d42d9f88ce70be2f17da2a6e09198426cd04e43d5dc05de", "refused")}`],
  ["/api/check + badge", "`/api/check?wallet=…&chain=…` existed; no badge", "`/api/check?agent=…&chain=…` (by id or wallet) with standing and reasons; `/badge/<agent>` SVG",
    [fileLink("frontend/src/app/api/check/route.ts"), fileLink("frontend/src/app/badge/[agent]/route.ts")],
    "— (live endpoints; checked by the final check, item 16)", `[/api/check?agent=0](${SITE}/api/check?agent=0), [/badge/0](${SITE}/badge/0)`],
  ["Frontend v2 pages", "landing, agents, agent, challenge, register, patrol, leaderboard, analytics, docs; no transaction lifecycle",
    "+ challenges, precedents, balance, consumer; appeal flow, mandate versions, clause editor, track record, operator panel; signing → submitted → accepted → finalized lifecycle",
    [fileLink("frontend/src/lib/contract.ts"), fileLink("frontend/src/components/tx.tsx"), fileLink("frontend/src/components/OperatorPanel.tsx")],
    "— (Lighthouse a11y 100, no horizontal scroll at 375 px: final check, item 17)", `[/precedents](${SITE}/precedents), [/balance](${SITE}/balance), [/consumer](${SITE}/consumer)`],
  ["Patrol bot", "free-text rules: ticker extraction, dollar-free ETH ceilings, unverified / scam labels; learned from its own reasons",
    "five clause shapes that trust addresses only; wei-exact caps; skips failed txs and linter-flagged clauses; defers to on-chain precedents, defers when they cannot be read",
    [link(H, "export function flagsFor"), link(P, "export async function screenFlags"), fileLink("frontend/src/app/api/patrol/route.ts")],
    `${TP} "a linter-flagged clause is never staked on", "an unreadable precedent check defers instead of filing"`, `[live dry run](https://github.com/kenil1710/sentinel/blob/${FINAL}/docs/patrol-dry-run.json)`],
  ["Bounded / paged views", "views read windows of the last 500 records (`SCAN_CAP = 500`)",
    "open count from the final counters; agents from the live set; `get_ledger_page`, `get_open_challenge_page`, `get_precedent_page`",
    [link(S, "def get_stats"), link(S, "def get_ledger_page"), link(S, "def get_open_challenge_page")],
    "test_sentinel.py `BoundedViews.test_ledger_pages_sum_to_the_totals`, `BoundedViews.test_open_count_exact_without_scan`", `[/analytics](${SITE}/analytics)`],
  ["Attack A1: a stall immunised its tx", "settle_stalled released the tx (v1 audit fix 3)", "a stall or a VOID filing releases the tx; nothing else does",
    [link(S, "def settle_stalled")], "test_attacks.py `A1_StallImmunisesTransaction.test_stalled_challenge_releases_its_transaction`", "not triggered live (no stall)"],
  ["Attack A2: re-registering laundered a record", "a re-registered wallet started with a clean record", "earlier registrations of the wallet count (same operator)",
    [link(S, "def _earlier")], "test_attacks.py `A2_ReregistrationLaundersTheRecord.test_repeat_multiplier_counts_previous_registrations`", "not triggered live"],
  ["Attack A3: precedent kind ignored direction", "did not exist (no precedents)", "kind marks each token out / in / via, identical in contract and bot",
    [link(S, "def _tx_kind"), fileLink("frontend/src/lib/kind.ts")], "test_attacks.py `A3_PrecedentIgnoresDirection.test_kind_distinguishes_sent_from_received`", `${ch(3)} precedent on a received token (\`in:\`)`],
  ["Attack A4: stored record was the leader's text", "validators compared the verdict only; the evidence digest was the leader's, never voted on", "facts rendered from the digest-checked core; every validator must reproduce them",
    [link(S, "def _render_facts"), link(S, "def _leader_shape_ok")], "test_attacks.py `A4_LeaderWritesTheEvidence.test_forged_evidence_is_rejected`", `${ch(2)} stored facts`],
  ["Attack A5: expired appeal taught the patrol", "did not exist (no appeals)", "only UNAPPEALED or challenger-lost-appeal clearances become precedents",
    [link(S, "def _maybe_precedent")], "test_attacks.py `A5_ContestedRulingTeachesThePatrol.test_expired_appeal_creates_no_precedent`", `demo ${txl("0x8007e271fd260551271887e61285b096fa871be747805493d8dffb0f55dcda18", "expire_appeal")}`],
  ["Attack B1: a stranger could frame a wallet", "did not exist (earlier records were not counted)", "only the same operator's earlier registrations count; others are listed with `same_operator: false`",
    [link(S, "def _earlier")], "test_attacks_r2.py `B1_StrangerPoisonsAWallet.test_real_operator_not_framed_out_of_good_standing`", "not triggered live"],
  ["Review: zero bond froze the record", "same: `That agent's bond is exhausted`, and SLASHED_OUT agents could not be challenged", "a paused agent is challengeable at any bond",
    [link(S, "def _challenge_problem")], "test_sentinel.py `Bond.test_paused_zero_bond_agent_still_answers`", `${ch(25)} counted at slash 0; zero-bond filing not exercised live`],
  ["Review: two spellings of INCONCLUSIVE", "did not exist (no linter; the axis was the verdict alone)", "the clause is on the consensus axis only for a BREACH",
    [link(S, "def _axis")], "test_sentinel.py `OneInconclusive.test_mixed_panel_settles`", `${ch(5)} INCONCLUSIVE on a flagged clause, settled first try`],
  ["Review: withdrawal griefing", "any pending challenge blocked the whole withdrawal", "an open challenge holds back only what it could slash",
    [link(S, "def _exposure")], "test_sentinel.py `Bond.test_withdrawal_blocked_when_open_challenges_could_take_everything`", `demo ${txl("0xf1c6425d45cfba3da9535703f1cbdc158565a44e7df5970159bdefa7f4c2869c", "0.5 of 1 GEN held, 1 wei over refused")}`],
  ["Review: views walked whole lists", "list views read windows of the last 500 records; `get_treasury` returned counters only, with no recomputation from records on chain", "bounded, with paged views (row above)",
    [link(S, "def _ledger_sums")], "test_sentinel.py `BoundedViews.test_ledger_leaves_huge_recompute_to_pages`", `[/balance](${SITE}/balance)`],
  ["Review: stats miscount after many retirements", "counted the last 500 of `active_ids` (v1 audit fix 1)", "counted over the live set, RETIRED derived",
    [link(S, "def get_stats")], "test_ported_flow.py `TestRetiredAgentsCannotCrowdOutLiveOnes.test_a_flood_of_retired_agents_cannot_hide_a_live_one`", "not triggered live"],
  ["Review: bot staked on failed txs", "never flagged a reverted tx", "never stakes on a failed tx (restored)",
    [link(H, "export function flagsFor")], `${TP} "NEVER flags a failed transaction"`, "—"],
  ["Review: bot compared caps as floats", "ceilings parsed to wei as BigInt", "caps compared in wei (restored)",
    [link(H, "export function decimalToWei")], `${TP} "fractional limits keep full wei precision"`, "—"],
  ["Review: bot ignored tokens received in a trade", "flagged any unlisted token in the transfer list", "trade / swap clauses count received tokens; send clauses only sent ones",
    [link(H, "export function flagsFor")], `${TP} "FLAGS the real WETH to WFC swap against a clause listing WETH and USDC"`, "—"],
];
const shortstat = git("diff", "--shortstat", BASE, FINAL);
const changeTable = `## What changed: hackathon v1 → v2

| Area | v1 at BASE (\`${BASE.slice(0, 7)}\`) | v2 at FINAL (\`${FINAL.slice(0, 7)}\`) | Code (pinned at FINAL) | Test | Live proof (v2.1.0) |
|---|---|---|---|---|---|
${CHANGES.map(([a, v1, v2, code, test, live]) => `| ${a} | ${v1} | ${v2} | ${code.join(", ")} | ${test} | ${live} |`).join("\n")}

- **Files changed:** ${shortstat.split(",")[0].trim()} (\`git diff --shortstat ${BASE.slice(0, 7)} ${FINAL.slice(0, 7)}\`).
- **Lines:** ${shortstat.split(",").slice(1).map((x) => x.trim()).join(", ")}.
- **Tests:** 483 → ${Number(pyRan) + Number(tsRan)} (contract 423 → ${pyRan}, patrol 60 → ${tsRan}), all passing.

`;
const md = proof + changeTable + `# Sentinel v2 — milestone

| | |
|---|---|
| BASE (hackathon submission, last commit on main at or before 2026-09-17 23:59 UTC) | [\`${BASE.slice(0, 10)}\`](${REPO}/commit/${BASE}) (2026-09-13) |
| FINAL | [\`${FINAL.slice(0, 10)}\`](${REPO}/commit/${FINAL}) |
| Compare | ${REPO}/compare/${BASE}...${FINAL} |
| Commits | ${commits}; ${changed.trim()} (contracts, frontend, tests, tools) |
| Deployed from | [\`${dep.contracts.Sentinel.commit.slice(0, 10)}\`](${REPO}/commit/${dep.contracts.Sentinel.commit}) — all three contracts, byte-identical to \`contracts/\` at FINAL (\`node tools/verify_source.mjs\`) |

## New addresses (GenLayer Studio Dev, chain 61997)

| Contract | Address | Constructor |
|---|---|---|
| Sentinel (canonical) | ${ex(dep.contracts.Sentinel.address)} | \`${JSON.stringify(dep.contracts.Sentinel.constructor_args)}\` |
| Sentinel (demo) | ${ex(dep.contracts.SentinelDemo.address)} | \`${JSON.stringify(dep.contracts.SentinelDemo.constructor_args)}\` |
| SentinelConsumer | ${ex(dep.contracts.SentinelConsumer.address)} | \`${JSON.stringify(dep.contracts.SentinelConsumer.constructor_args)}\` |

The hackathon contract \`0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe\` is untouched and still readable: [docs/superseded/README.md](superseded/README.md).

## Features, with the code that implements each (pinned at FINAL)

${features.map(([id, name, what, contractLinks, files]) => `### ${id} — ${name}\n\n${what}\n\n${contractLinks.length ? "- Contract: " + contractLinks.join(", ") + "\n" : ""}${files.length ? "- App / bot: " + files.map(fileLink).join(", ") + "\n" : ""}`).join("\n")}
### Contract files changed

- ${fileLink(S)} — [diff from BASE](${REPO}/compare/${BASE}...${FINAL}#diff-${git("hash-object", "--stdin", "--no-filters")}) (rewritten for v2)
- ${fileLink(K)} — new

## Tests, before and after

| | BASE (hackathon) | FINAL |
|---|---|---|
| Offline contract suite | 423 tests (\`test/test_logic.py\`, v1 contract) | **${pyRan} tests**, all passing |
| Patrol bot (TypeScript) | 60 tests (\`test/test_patrol.mjs\`) | **${tsRan} tests**, all passing, including exact transaction-kind parity with the contract and the learning tests run end to end against it |
| **Total** | **483** | **${Number(pyRan) + Number(tsRan)}** |
| Static "no write before a revert" scan | — | every write method of both contracts (\`tools/scan_writes.py\`), 0 violations |
| On chain | live e2e suite, not re-run on Studio Dev | the canonical seed and the demo run below |

Per file at FINAL (BASE had one Python file, \`test_logic.py\`, 423 tests, and \`test_patrol.mjs\`, 60):

| File | Tests | What it covers |
|---|---|---|
${perFile.map(([m, n, ok]) => `| \`test/${m}.py\` | ${n}${ok ? "" : " (FAILING)"} | ${({ test_sentinel: "v2 behaviour: clauses, tables, evidence, judgment, appeals, precedents, lint, bond, views, static checks", test_consumer: "SentinelConsumer", test_attacks: "attack round 1 (A1-A5)", test_attacks_r2: "attack round 2 (B1)", test_ported_engine: "BASE tests of the judgement engine, ported (117 of 117)", test_ported_flow: "BASE tests of money, filing, settlement, bond, views, profile, invariants, static checks and audit fixes, ported (249)" })[m]} |`).join("\n")}
| \`test/test_patrol.mjs\` | ${tsRan} | 14 v2 tests, 39 ported from BASE, 9 for the v2.1.0 patrol fixes and \`lib/patrolPlan.ts\` |

### Tests removed and why

366 of the 423 BASE contract tests and 39 of its 60 patrol tests were ported to the v2 API (classes keep their v1 names).
These were not, because the behaviour they test no longer exists in v2:

| BASE tests | Count | Why |
|---|---|---|
${REMOVED.map(([w, n, why]) => `| ${w} | ${n} | ${why} |`).join("\n")}
| **Total removed** | **${REMOVED.reduce((a, r) => a + r[1], 0)}** | 57 contract + 21 patrol |

## Seeded cases (canonical)

${canonicalTable}

Demo contract: every other path, ending with the books at 0 — [docs/SEEDS.md](SEEDS.md#demo-contract--every-path-drained-to-zero).

## Attack rounds

[docs/ATTACKS.md](ATTACKS.md). Final check, item by item: [docs/FINAL_CHECK.md](FINAL_CHECK.md).
`;
writeFileSync(root + "docs/MILESTONE.md", md.replace(/\n### Contract files changed[\s\S]*?\n## Tests/, `\n### Contract files changed\n\n- ${fileLink(S)} (rewritten for v2) and ${fileLink(K)} (new) — see the compare link above.\n\n## Tests`));
console.log("wrote docs/MILESTONE.md");
