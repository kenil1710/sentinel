# Submission texts

Character counts are printed by `node tools/charcount.mjs` and repeated below each text.

## One-liner (≤ 180)

<!--ONELINER-->
Sentinel: bonded mandates for AI agents on GenLayer. Anyone can challenge a transaction; validators judge it, rulings can be appealed once, and code computes the slash.
<!--/ONELINER-->

_168 characters (limit 180)._

## Milestone reply (≤ 1000)

<!--REPLY-->
Compare: https://github.com/kenil1710/sentinel/compare/b5145fa76e8aae914ca1735e2d0507fd4860c40a...52bb05329fe68cbb3b0c6f43e95b355c57650d63
BASE b5145fa is the rewarded version: gen_getContractCode of hackathon contract 0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe is byte-identical to build/Sentinel.min.py at b5145fa (sha256 64d82a25…3f46).
Key changes: 1) rulings are provisional for an hour and appealable once to a fresh panel; 2) mandates are numbered, versioned clauses frozen at the transaction's block time, with severity-graded slashing computed by code; 3) anyone can challenge, and only final clearances become precedents the patrol bot obeys.
Tests: 483 → 569 (contract 423 → 507, patrol 60 → 62), all passing.
Addresses (Studio Dev): Sentinel 0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB, demo 0x74ca153c17a67F3E5Fcd893afF053395AEce1Aff, SentinelConsumer 0x053f15512462FD4f8F70F443EdCA1413e96D5eD0.
Details: https://github.com/kenil1710/sentinel/blob/main/docs/MILESTONE.md
<!--/REPLY-->

_982 characters (limit 1000)._

## Milestone text (≤ 1000)

<!--MILESTONE-->
Sentinel v2 upgrades the Agent Tank hackathon winner (Onchain Justice). Rulings are provisional for an hour and can be appealed once with a bond and new counter-evidence; a fresh panel judges only immutable transaction facts. Mandates are numbered clauses, versioned and frozen: an edit waits an hour and never reaches back. Anyone can challenge with a stake. Slashing follows a severity table frozen per version, with a capped repeat multiplier; a paused agent still answers for every breach. Validators lint mandates; flagged clauses are never slashed. Final clearances become precedents the patrol bot respects. Track records, a consumer contract, /api/check and a badge expose standing. Two attack rounds and a review fixed 14 issues (11 contract, 3 bot). Live (v2.1.0): 10 real bots on 5 chains, 36 challenges, 15 breaches each re-checked against chain RPC. 507 contract + 62 patrol tests (BASE 483) pass; on-chain code matches the repo.
<!--/MILESTONE-->

_942 characters (limit 1000)._

## Project text (≤ 1000)

<!--PROJECT-->
Sentinel puts a bond behind what an AI agent promises. An operator registers an agent's wallet on Ethereum, Base, Arbitrum, Polygon or Robinhood Chain under a mandate of numbered clauses and posts a bond. Anyone can challenge one of its transactions with a stake. GenLayer validators each fetch the transaction, check it belongs to the agent, and must agree: BREACH, COMPLIANT or INCONCLUSIVE, quoting a clause. Code decides the rest: the slash from a frozen severity table, bounties, refunds, precedents. Rulings can be appealed once; when validators disagree nothing is written. A patrol bot files challenges on its own and learns only from final clearances. Payouts are pull balances and the contract checks its own books. Other contracts can ask whether an agent is in good standing, and so can anyone through a public API and badge. Studio Dev limitation: value transfers are queued, not delivered, and the books show that gap.
<!--/PROJECT-->

_932 characters (limit 1000)._

## Review verification (≤ 500)

<!--REVIEW-->
Open sentinel-tau-ashen.vercel.app and switch to the demo deployment (90-second windows): register, challenge, appeal, finalize, withdraw and claim in minutes. Every number on the site is a contract read. Check challenges against docs/SEEDS.md and breaches against docs/BREACHES.md (each tx re-read from chain RPC). docs/FINAL_CHECK.md lists each check with proof. Tests: README, "How a reviewer can test", step 7.
<!--/REVIEW-->

_414 characters (limit 500)._
