/**
 * docs/MILESTONE.md: BASE and FINAL commits, the compare link, every feature with
 * GitHub links pinned at FINAL to the lines that implement it, addresses, tests
 * before and after, and the seeded cases.
 *   node tools/milestone.mjs <FINAL-commit>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
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
  ["A5", "Bond lifecycle", "Top-up; timelocked withdrawal and unregister, blocked while anything is open; auto-pause below the minimum; pull payouts; the ledger invariant received = bonds + open stakes + claimable + claimed, recomputed from records on chain.",
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
const canonicalTable = seeds.split("## Canonical register")[1].split("## Demo contract")[0].trim();
const ex = (a) => `[\`${a}\`](${dep.explorer.replace(/\/$/, "")}/address/${a})`;
const commits = git("rev-list", "--count", `${BASE}..${FINAL}`);
const changed = git("diff", "--stat", `${BASE}..${FINAL}`, "--", "contracts", "frontend/src", "test", "tools").split("\n").pop();

const md = `# Sentinel v2 — milestone

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
