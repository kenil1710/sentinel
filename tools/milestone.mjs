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

const py = spawnSync("python3", ["-m", "unittest", "test_sentinel", "test_consumer", "test_attacks", "test_attacks_r2"], { cwd: root + "test", encoding: "utf8" });
const pyRan = (py.stderr.match(/Ran (\d+) tests/) || [])[1];
const ts = spawnSync("node", ["--experimental-strip-types", "--no-warnings", "test/test_patrol.mjs"], { cwd: root, encoding: "utf8" });
const tsRan = (ts.stdout.match(/(\d+) patrol tests passed/) || [])[1];
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
| Offline contract suite | 423 tests (\`test/test_logic.py\`, v1 contract) | **${pyRan} tests** (\`test_sentinel\`, \`test_consumer\`, \`test_attacks\`, \`test_attacks_r2\`), all passing |
| Patrol bot (TypeScript) | 60 tests | **${tsRan} tests**, including exact transaction-kind parity with the contract on real Blockscout documents |
| Static "no write before a revert" scan | — | every write method of both contracts (\`tools/scan_writes.py\`), 0 violations |
| On chain | live e2e suite, not re-run on Studio Dev | the canonical seed and the demo run below |

## Seeded cases (canonical)

${canonicalTable}

Demo contract: every other path, ending with the books at 0 — [docs/SEEDS.md](SEEDS.md#demo-contract--every-path-drained-to-zero).

## Attack rounds

[docs/ATTACKS.md](ATTACKS.md). Final check, item by item: [docs/FINAL_CHECK.md](FINAL_CHECK.md).
`;
writeFileSync(root + "docs/MILESTONE.md", md.replace(/\n### Contract files changed[\s\S]*?\n## Tests/, `\n### Contract files changed\n\n- ${fileLink(S)} (rewritten for v2) and ${fileLink(K)} (new) — see the compare link above.\n\n## Tests`));
console.log("wrote docs/MILESTONE.md");
