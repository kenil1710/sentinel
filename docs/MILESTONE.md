**BASE = `b5145fa`, proven: on-chain code of the hackathon contract is byte-identical to `build/Sentinel.min.py` at `b5145fa`.**

| | bytes | sha256 |
|---|---|---|
| `gen_getContractCode(0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe)` on Studio Dev, read 2026-10-09 | 50355 | `64d82a250f22bed0c243b37d1c523425556a63adc591f52237d9be926d313f46` |
| [`build/Sentinel.min.py` at `b5145fa`](https://github.com/kenil1710/sentinel/blob/b5145fa76e8aae914ca1735e2d0507fd4860c40a/build/Sentinel.min.py) | 50355 | `64d82a250f22bed0c243b37d1c523425556a63adc591f52237d9be926d313f46` |

The hackathon contract was deployed from that minified artifact of [`contracts/Sentinel.py`](https://github.com/kenil1710/sentinel/blob/b5145fa76e8aae914ca1735e2d0507fd4860c40a/contracts/Sentinel.py); both files last changed together, in `df2a633` (2026-09-12), and the five later commits up to `b5145fa` (2026-09-13), the last on main before the 2026-09-17 23:59 UTC cut-off, touch neither. Reproduce: `node tools/milestone.mjs` refuses to write this file if the bytes differ.

# Sentinel v2 — milestone

| | |
|---|---|
| BASE (hackathon submission, last commit on main at or before 2026-09-17 23:59 UTC) | [`b5145fa76e`](https://github.com/kenil1710/sentinel/commit/b5145fa76e8aae914ca1735e2d0507fd4860c40a) (2026-09-13) |
| FINAL | [`52bb05329f`](https://github.com/kenil1710/sentinel/commit/52bb05329fe68cbb3b0c6f43e95b355c57650d63) |
| Compare | https://github.com/kenil1710/sentinel/compare/b5145fa76e8aae914ca1735e2d0507fd4860c40a...52bb05329fe68cbb3b0c6f43e95b355c57650d63 |
| Commits | 51; 109 files changed, 15244 insertions(+), 16549 deletions(-) (contracts, frontend, tests, tools) |
| Deployed from | [`42a6172d96`](https://github.com/kenil1710/sentinel/commit/42a6172d966f1f67f40e7ad5d207d9689f1c046c) — all three contracts, byte-identical to `contracts/` at FINAL (`node tools/verify_source.mjs`) |

## New addresses (GenLayer Studio Dev, chain 61997)

| Contract | Address | Constructor |
|---|---|---|
| Sentinel (canonical) | [`0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB`](https://explorer-studio-dev.genlayer.com/address/0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB) | `["CANONICAL"]` |
| Sentinel (demo) | [`0x74ca153c17a67F3E5Fcd893afF053395AEce1Aff`](https://explorer-studio-dev.genlayer.com/address/0x74ca153c17a67F3E5Fcd893afF053395AEce1Aff) | `["DEMO"]` |
| SentinelConsumer | [`0x053f15512462FD4f8F70F443EdCA1413e96D5eD0`](https://explorer-studio-dev.genlayer.com/address/0x053f15512462FD4f8F70F443EdCA1413e96D5eD0) | `["0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB"]` |

The hackathon contract `0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe` is untouched and still readable: [docs/superseded/README.md](superseded/README.md).

## Features, with the code that implements each (pinned at FINAL)

### A1 — Appeal window

Ruling PROVISIONAL → CONTESTABLE (1 h canonical, 90 s demo) → FINAL; the losing party appeals once with a bond and counter-evidence; a fresh panel judges the same immutable facts; a novelty gate refuses a verbatim or near-verbatim resend; permissionless finalize after the deadline; expiry exit.

- Contract: [resolve_challenge](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1791-L1828), [_appeal_problem](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1855-L1886), [appeal](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1889-L1913), [resolve_appeal](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1916-L1964), [expire_appeal](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1967-L1985), [finalize](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1988-L2001), [_too_similar](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L504-L525)
- App / bot: [`frontend/src/app/(app)/challenge/[id]/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/challenge/[id]/page.tsx)

### A2 — Frozen mandate versions

Versions stored with their sha256 and effective time; an edit takes effect after the delay (1 h / 90 s); a challenge is judged against the version in force at the transaction's block time, snapshotted at filing.

- Contract: [_parse_clauses](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L350-L407), [_new_version](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1494-L1505), [update_mandate](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1569-L1602), [_version_at](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1460-L1469), [get_version_at](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2574-L2582)
- App / bot: [`frontend/src/components/MandateVersions.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/components/MandateVersions.tsx), [`frontend/src/components/ClauseEditor.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/components/ClauseEditor.tsx)

### A3 — Open challengers

Anyone but the operator challenges with an exact stake; a losing challenger's stake goes to the operator; one challenge per (chain, tx, agent); the bounty goes to the challenger who proved the breach.

- Contract: [_challenge_problem](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1665-L1694), [challenge_agent](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1697-L1754), [_finalize](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2003-L2071)
- App / bot: [`frontend/src/components/ChallengeForm.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/components/ChallengeForm.tsx), [`frontend/src/app/api/txinfo/route.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/api/txinfo/route.ts)

### A4 — Graduated slashing

Severity table (MINOR / MAJOR / CRITICAL as bps of the bond at filing) frozen in the mandate version; capped repeat multiplier; code computes the slash; the model returns only a verdict, a clause, the severity label written in the mandate and a quote, which code checks.

- Contract: [_parse_table](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L410-L442), [_multiplier_bps](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L445-L446), [_slash_amount](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L449-L456), [_decide](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L899-L952)
- App / bot: [`frontend/src/lib/mandate.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/lib/mandate.ts)

### A5 — Bond lifecycle

Top-up; timelocked withdrawal of what open challenges could never slash (they hold back the CRITICAL rate of their snapshot); unregister, whose release waits until nothing is open; auto-pause below the minimum; pull payouts; the ledger invariant received = bonds + open stakes + claimable + claimed, recomputed from records on chain.

- Contract: [_set_bond](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1403-L1412), [top_up_bond](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2122-L2142), [request_withdrawal](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2145-L2171), [execute_withdrawal](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2185-L2206), [unregister](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2209-L2225), [finalize_unregister](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2228-L2247), [claim](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2250-L2262), [get_ledger](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2432-L2462)
- App / bot: [`frontend/src/components/OperatorPanel.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/components/OperatorPanel.tsx), [`frontend/src/app/(app)/balance/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/balance/page.tsx)

### B6 — Mandate linter

Validators flag clauses that cannot be judged from on-chain data, each quoted verbatim; strict equality on the clause ids; INCONCLUSIVE after the deadline if they never agree; a breach can never rest on a flagged clause.

- Contract: [_lint](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1069-L1090), [lint_mandate](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1605-L1646), [close_lint](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L1649-L1663)
- App / bot: [`frontend/src/app/(app)/register/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/register/page.tsx)

### B7 — Precedents

Only a FINAL COMPLIANT whose first ruling was COMPLIANT (unappealed or upheld against the challenger) becomes a precedent, keyed by agent, clause-text hash and a direction-aware transaction kind; a FINAL BREACH of the same key vetoes it; the patrol skips matching transactions.

- Contract: [_tx_kind](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L661-L681), [_maybe_precedent](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2073-L2099), [_veto](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2101-L2119), [precedent_for](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2755-L2772)
- App / bot: [`frontend/src/lib/kind.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/lib/kind.ts), [`frontend/src/app/api/patrol/route.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/api/patrol/route.ts), [`frontend/src/app/(app)/precedents/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/precedents/page.tsx)

### B8 — Agent track record

Breaches by severity, overrulings, appeals won/lost, last breach, total slashed — from final rulings only, and recomputed from the agent's challenges to prove the counters agree.

- Contract: [_track](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2312-L2319), [get_track_record](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2648-L2691)
- App / bot: [`frontend/src/components/TrackRecord.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/components/TrackRecord.tsx)

### C9 — Consumer contract

SentinelConsumer.is_in_good_standing(chain, wallet) by cross-contract view, and act_for_agent, which refuses an agent that is not in good standing or a caller who is not its operator.

- Contract: [_standing](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py#L2321-L2342), [is_in_good_standing](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/SentinelConsumer.py#L81-L83), [act_for_agent](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/SentinelConsumer.py#L90-L111)
- App / bot: [`frontend/src/app/(app)/consumer/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/consumer/page.tsx)

### C10 — Public API and badge

/api/check?agent=…&chain=… and /badge/<agent>.svg, answered from the canonical contract at request time.

- App / bot: [`frontend/src/app/api/check/route.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/api/check/route.ts), [`frontend/src/app/badge/[agent]/route.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/badge/[agent]/route.ts), [`frontend/src/lib/server.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/lib/server.ts)

### C11 — Frontend v2

Appeal flow, mandate version history, precedents, per-agent track record, open-challenge form, linter results at registration, the full transaction lifecycle (submitted → accepted → finalized) with success reported only after re-reading contract state; a canonical/demo switch.

- App / bot: [`frontend/src/lib/contract.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/lib/contract.ts), [`frontend/src/components/tx.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/components/tx.tsx), [`frontend/src/app/(app)/agents/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/agents/page.tsx), [`frontend/src/app/(app)/agent/[id]/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(app)/agent/[id]/page.tsx), [`frontend/src/app/(marketing)/page.tsx`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/(marketing)/page.tsx)

### Patrol — Patrol bot v2

Judges against the version in force at each transaction's block time, skips transactions a precedent covers, moves open challenges along, and attaches a fee estimate to every write.

- App / bot: [`frontend/src/app/api/patrol/route.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/app/api/patrol/route.ts), [`frontend/src/lib/heuristics.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/lib/heuristics.ts), [`frontend/src/lib/blockscout.ts`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/frontend/src/lib/blockscout.ts)

### Contract files changed

- [`contracts/Sentinel.py`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/Sentinel.py) (rewritten for v2) and [`contracts/SentinelConsumer.py`](https://github.com/kenil1710/sentinel/blob/52bb05329fe68cbb3b0c6f43e95b355c57650d63/contracts/SentinelConsumer.py) (new) — see the compare link above.

## Tests, before and after

| | BASE (hackathon) | FINAL |
|---|---|---|
| Offline contract suite | 423 tests (`test/test_logic.py`, v1 contract) | **507 tests**, all passing |
| Patrol bot (TypeScript) | 60 tests (`test/test_patrol.mjs`) | **62 tests**, all passing, including exact transaction-kind parity with the contract and the learning tests run end to end against it |
| **Total** | **483** | **569** |
| Static "no write before a revert" scan | — | every write method of both contracts (`tools/scan_writes.py`), 0 violations |
| On chain | live e2e suite, not re-run on Studio Dev | the canonical seed and the demo run below |

Per file at FINAL (BASE had one Python file, `test_logic.py`, 423 tests, and `test_patrol.mjs`, 60):

| File | Tests | What it covers |
|---|---|---|
| `test/test_sentinel.py` | 125 | v2 behaviour: clauses, tables, evidence, judgment, appeals, precedents, lint, bond, views, static checks |
| `test/test_consumer.py` | 6 | SentinelConsumer |
| `test/test_attacks.py` | 6 | attack round 1 (A1-A5) |
| `test/test_attacks_r2.py` | 4 | attack round 2 (B1) |
| `test/test_ported_engine.py` | 117 | BASE tests of the judgement engine, ported (117 of 117) |
| `test/test_ported_flow.py` | 249 | BASE tests of money, filing, settlement, bond, views, profile, invariants, static checks and audit fixes, ported (249) |
| `test/test_patrol.mjs` | 62 | 14 v2 tests, 39 ported from BASE, 9 for the v2.1.0 patrol fixes and `lib/patrolPlan.ts` |

### Tests removed and why

366 of the 423 BASE contract tests and 39 of its 60 patrol tests were ported to the v2 API (classes keep their v1 names).
These were not, because the behaviour they test no longer exists in v2:

| BASE tests | Count | Why |
|---|---|---|
| test_logic.py · TestArtifact | 18 | v2 deploys `contracts/Sentinel.py` itself; there is no mangled `build/Sentinel.min.py` for the battery to run on. What is deployed is compared byte for byte with the source on chain by `tools/verify_source.mjs`. |
| test_logic.py · TestComplianceScore | 7 | v2 publishes a track record and a standing instead of a score in bps. The eighth test ("unproven is not guilty") is ported: INCONCLUSIVE counts on neither side. |
| test_logic.py · TestOwnerControls | 7 | v2 has no owner, no settable minimum bond or stake, no ownership transfer and no pause. Ported (10): nobody can change the minimum, exact stake, decimal-string money, per-mandate severity bounds, every dial validated, the treasury's share claimable and nothing more, nothing can switch the contract off. |
| test_logic.py · TestVindicationSplit | 3 | the bps dial that split a refuted challenger's stake is gone: the operator receives all of it. The default split, reconstruction and an inexact stake are ported. |
| test_logic.py · TestChallengeFiling | 3 | no per-wallet cooldown (replaced by an exact stake and a 20-open-challenge cap per agent, both tested) and no global pause. |
| test_logic.py · TestSettlementCompliant | 3 | the award is now a pull balance, not added to the bond; the protocol takes nothing from a refuted stake; no score. |
| test_logic.py · TestBondLifecycle | 3 | no pause; top-ups are operator-only (a stranger's top-up is credited back); a paused agent is now challengeable on purpose (v2.1.0). |
| test_logic.py · TestViews | 3 | no by-chain views (the app filters `get_agents`); `is_tx_challenged`, not the preview, answers whether a transaction is taken. |
| test_logic.py · TestProfileOnChain | 3 | list views return the full record; no by-type views. |
| test_logic.py · TestARefundReleasesTheTransaction | 2 | reversed on purpose: an INCONCLUSIVE ruling holds the transaction, so nobody can re-roll the judge. Stall release, decided-holds and two-agents are ported. |
| test_logic.py · TestJudgePipeline | 1 | the model is no longer asked for a confidence. |
| test_logic.py · TestRegister / TestSettleStalled / TestSettlementTransient / TestSettlementViolation | 4 | no global pause (2); no judgement lock: a resolution is one consensus transaction (1); no score (1). |
| test_patrol.mjs · ticker extraction | 5 | v2 never reads token symbols: a token called USDT at another address is the oldest spoof. A clause naming tokens by symbol makes the bot flag every token and the validators decide. |
| test_patrol.mjs · explorer-label rules | 4 | the bot no longer accuses on scam or verification labels (mutable, third-party; the linter flags clauses that rely on them), and native-symbol aliases went with symbol reading. |
| test_patrol.mjs · the bot's own learning | 12 | replaced by on-chain precedents: no reason parsing (4), no clearance threshold (one FINAL COMPLIANT that outlived the appeal window counts) (4), no corroboration fetches (1), never defers on an amount rule (1), learns from any challenger's final ruling (1), a challenge cannot exist without a hash (1). The 18 learning tests whose behaviour exists in v2 are ported and run end to end against the contract. |
| **Total removed** | **78** | 57 contract + 21 patrol |

## Seeded cases (canonical)

Canonical contract [`0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB`](https://explorer-studio-dev.genlayer.com/address/0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB), read 2026-10-09T11:49:56.273Z.

**10 agents on 5 chains · 36 challenges: 15 BREACH, 8 COMPLIANT, 9 INCONCLUSIVE final, 4 open · 1 appeals (0 upheld, 1 rejected) · 6 precedents · 2.2 GEN slashed, 1.1 GEN in bounties.** Ledger: received 12.9 = bonds 7.8 + open stakes 0.2 + claimable 4.9 + claimed 0 (holds, and every total matches its recomputation from the records).

Every agent is a live bot we do not operate; every mandate is ours, written for that bot's observable behaviour; every challenge names a real transaction mined after the agent registered; the validators decided each one. Every final BREACH was re-checked by hand against the chain's own RPC: [docs/BREACHES.md](BREACHES.md). Linter at registration: #0 DONE · #1 DONE · #2 DONE (C2, C3 flagged) · #3 DONE · #4 DONE · #5 DONE · #6 DONE · #7 DONE · #8 DONE · #9 DONE.

### Seeded cases

| Challenge | Agent | Transaction | Clause | Filed by | First ruling | Appeal | Final | Slash (GEN) | What happened |
|---|---|---|---|---|---|---|---|---|---|
| [#2](https://sentinel-tau-ashen.vercel.app/challenge/2) | #0 Exchange payout bot A (ethereum) | [0x903330…c269](https://eth.blockscout.com/tx/0x9033300407073989d133353050b5ac082d942710afaa2b0009582ed1cd8ec269) | C1 | 0xc69f4b…cd98 | BREACH | operator → rejected | **BREACH** MAJOR | 0.4 | the payout bot sent a token that is neither USDT nor USDC: MAJOR breach. The operator appealed (customer withdrawals); a fresh panel rejected the appeal, so the appeal bond went to the challenger |
| [#3](https://sentinel-tau-ashen.vercel.app/challenge/3) | #0 Exchange payout bot A (ethereum) | [0xa0857f…3530](https://eth.blockscout.com/tx/0xa0857fb5ef756bfd71aa8547df28dc46782fce50d858aab9985a47dff5e43530) | C1 | 0xcd6d1e…f1c0 | COMPLIANT | — | **COMPLIANT** | — | an open challenger read a token the agent RECEIVED as the agent sending it; the panel saw the agent was only the recipient. Open-challenger loss; the stake went to the operator, and the ruling became a precedent (direction `in:`) |
| [#4](https://sentinel-tau-ashen.vercel.app/challenge/4) | #1 USDT payout bot (ethereum) | [0xa22089…fdd7](https://eth.blockscout.com/tx/0xa2208994d33ec28b3c85ef33addcdf801eb7b7d1e49dbe6f0faa76706267fdd7) | C1 | 0xcd6d1e…f1c0 | COMPLIANT | — | **COMPLIANT** | — | an ordinary USDT payout under a clause that names tokens by symbol: COMPLIANT; became a precedent |
| [#5](https://sentinel-tau-ashen.vercel.app/challenge/5) | #2 Exchange payout bot B (ethereum) | [0xb3efb5…4bf1](https://eth.blockscout.com/tx/0xb3efb5948a969a467f1d0bcfe2ae0493971c4be7e03513d5bfe86aa173304bf1) | C3 | 0xcd6d1e…f1c0 | INCONCLUSIVE `UNUSABLE_ANSWER` | — | **INCONCLUSIVE** | — | the linter had flagged C3 (a customer's risk is not in the transaction data): INCONCLUSIVE; stake refunded |
| [#8](https://sentinel-tau-ashen.vercel.app/challenge/8) | #5 Base USDC payout bot (base) | [0xec1d9d…9413](https://base.blockscout.com/tx/0xec1d9d7f78910170df1e32ea512992c2560bd5118cef21d91c0202d986a09413) | C1 | 0xc69f4b…cd98 | COMPLIANT | — | **COMPLIANT** | — | mined while mandate v2 (10 USDC limit) was still queued: judged under v1, COMPLIANT. A filing alleging v2's C3 on it was refused by the contract ("version 1 has no clause C3") |
| [#15](https://sentinel-tau-ashen.vercel.app/challenge/15) | #0 Exchange payout bot A (ethereum) | [0x867dbe…a716](https://eth.blockscout.com/tx/0x867dbed45cfe4ed377312df819038063d351530c00a993d09d7b14673381a716) | C2 | 0xc69f4b…cd98 | BREACH | — | **BREACH** MINOR | — | The transaction record shows a 'native value sent' of 4.68985 ETH, which directly violates clause C2's limit of 0.5 ETH per transaction. Filed after 1 earlier final breach(es), so the snapshot multiplier was ×1.5; no slash left: the bond had already been taken to 0 by earlier breaches |
| [#16](https://sentinel-tau-ashen.vercel.app/challenge/16) | #7 Arbitrum USDC payout bot (arbitrum) | [0xd84cd3…2f8e](https://arbitrum.blockscout.com/tx/0xd84cd35aad67f071d9129c881f87b8c380cf424bad5eb976e5bf863ffc872f8e) | C1 | 0xc69f4b…cd98 | COMPLIANT | — | **COMPLIANT** | — | an ordinary USDC payout on Arbitrum, read through a real browser: COMPLIANT; became a precedent |
| [#17](https://sentinel-tau-ashen.vercel.app/challenge/17) | #8 Polygon token payout bot (polygon) | [0xc7d825…9124](https://polygon.blockscout.com/tx/0xc7d825e3fdb66af1d1563056f49ad983fd1ef44fbd23e31451d5ec177bb69124) | C1 | 0xcd6d1e…f1c0 | COMPLIANT | — | **COMPLIANT** | — | an ordinary token payout on Polygon, read through a real browser: COMPLIANT; became a precedent |
| [#18](https://sentinel-tau-ashen.vercel.app/challenge/18) | #9 Robinhood Chain keeper B (robinhood) | [0x84b4a1…d2bb](https://robinhoodchain.blockscout.com/tx/0x84b4a12b8442f84e053d50e81090550e37dcd7f26ee2a40ddb3d988c7933d2bb) | C1 | 0xc69f4b…cd98 | COMPLIANT | — | **COMPLIANT** | — | Robinhood Chain, read by validators through a real browser (Cloudflare): COMPLIANT; became a precedent |
| [#21](https://sentinel-tau-ashen.vercel.app/challenge/21) | #2 Exchange payout bot B (ethereum) | [0xe82ae6…3b11](https://eth.blockscout.com/tx/0xe82ae6d3b4706b71402dadfd27205edaac5e5ce4402b6ff242a9c060751e3b11) | C2 | 0xcd6d1e…f1c0 | INCONCLUSIVE `MODEL_INCONCLUSIVE` | — | **INCONCLUSIVE** | — | a Tether Gold payout under "Only send stablecoins", a clause the linter had flagged: INCONCLUSIVE (`MODEL_INCONCLUSIVE`); stake refunded |
| [#30](https://sentinel-tau-ashen.vercel.app/challenge/30) | #1 USDT payout bot (ethereum) | [0x2e4634…8d3b](https://eth.blockscout.com/tx/0x2e4634110092c81f980c80613162d0dc26125e854d5d53a0d6dda8a4bfe18d3b) | C1 | 0xc69f4b…cd98 | INCONCLUSIVE `UNUSABLE_ANSWER` | — | **INCONCLUSIVE** | — | the same symbol-only clause, filed to test an appeal: the panel's answers could not be used (quote or label did not match the clause), so code recorded INCONCLUSIVE at once and there was nothing to appeal |
| [#31](https://sentinel-tau-ashen.vercel.app/challenge/31) | #5 Base USDC payout bot (base) | [0x508c90…afc6](https://base.blockscout.com/tx/0x508c904352a24505ff4871a7e633f377ec9fe9add5616351caf06ef6ecf3afc6) | C3 | 0xcd6d1e…f1c0 | BREACH | — | **BREACH** MAJOR | 0.2 | mined after v2 took effect: C3 is breached because the on-chain record shows one token transfer of 13,829,613 raw units from the agent via the mandated token contract, and the explorer evidence identifies that contract as USDC with 6 decimals, i.e. BREACH MAJOR, filed by an open challenger |
| [#33](https://sentinel-tau-ashen.vercel.app/challenge/33) | #1 USDT payout bot (ethereum) | [0x6bb639…bffc](https://eth.blockscout.com/tx/0x6bb63982c3eb07ae2e338f2bca8250bb8465cac777ed5fb385d596be1228bffc) | C1 | 0xc69f4b…cd98 | INCONCLUSIVE `UNUSABLE_ANSWER` | — | **INCONCLUSIVE** | — | a second try at the same question: again INCONCLUSIVE (`UNUSABLE_ANSWER`), so no appeal |

- **Withdrawal held back while challenges were open:** with 6 challenges open against payout bot A (#2 under appeal, the rest filed by the patrol bot), all 2 GEN of its 2 GEN bond was held for what they could slash; its operator asked for 1 wei and the contract refused — [tx](https://explorer-studio-dev.genlayer.com/tx/0xac891600c0856f0ef67dc39ed6007b4fe3e97a9096d43f580e8c2743a25200fc): “Withdrawals are blocked: 6 open challenge(s) or appeal(s) could slash the whole bond”. The partial case is in the demo run below: one open challenge held 0.5 GEN of a 1 GEN bond, and 1 wei over the free 0.5 GEN was refused.
- **Unregister:** its operator unregistered agent #6 (Robinhood keeper A; on the v2.0 deployment this keeper had stopped transacting) to exercise the exit ([tx](https://explorer-studio-dev.genlayer.com/tx/0x088416d01599a5a8c0b9fb7a423f60249c2fa884403b6a344a03a95d1d21a047)); after the 1 h timelock anyone could finalize it, and it was ([tx](https://explorer-studio-dev.genlayer.com/tx/0x4c9e98d2f163a39ed652e5752d5af610d1950558f8f2de03bce9cdda558c1e89)): status RETIRED, the bond moved to the operator's claimable balance.
- **Mandate edit not applied retroactively:** the Base bot published v2 ([tx](https://explorer-studio-dev.genlayer.com/tx/0x4d50a0e85932ede0d4a96d508aab35ba72051c92bb6eaafbd9c284bfc16bf62e)) adding a 10 USDC limit, effective 2026-10-09T09:55:08.000Z; see #8 (mined while it was queued) and #31 (mined after) above.
- **Precedent skip:** 6 precedents exist ([/precedents](https://sentinel-tau-ashen.vercel.app/precedents)). A live dry run of the patrol ([docs/patrol-dry-run.json](patrol-dry-run.json), 2026-10-09T11:48:47.916Z) withheld 6 flag(s) because a final COMPLIANT precedent covers that agent, clause and transaction kind (for example 0xdc136e560e… under C1, covered by #4).
- **SentinelConsumer:** 3 requests on [0x053f15…5eD0](https://explorer-studio-dev.genlayer.com/address/0x053f15512462FD4f8F70F443EdCA1413e96D5eD0) — 1 carried out (the Base bot's operator, agent in good standing), 2 refused (payout bot A: "status is PAUSED; bond below the 0.5 GEN minimum; 8 final CRITICAL breach(es)"; and a caller who was not the operator).
- **No appeal was upheld on this deployment.** The operator's appeal on #2 was rejected; both tries at the symbol-only clause (#30, #33) came back INCONCLUSIVE at once, which cannot be appealed. Nothing was forced. An upheld appeal is on chain in the v2.0 live history (challenge #10 on [`0x1d4B73BD…6a90`](https://explorer-studio-dev.genlayer.com/address/0x1d4B73BD37785F113a599505D80Bc9BDA3D96a90), [docs/superseded/v2.0.2/SEEDS.md](superseded/v2.0.2/SEEDS.md)), and the path is covered offline (`test_sentinel.Appeals`).
- **Two cases found no transaction:** the cross-chain keeper (agents #3 on Arbitrum and #4 on Polygon) never called the contracts those cases need; the active payout bots #7 and #8 carry those chains' cases.

### The patrol bot, unattended

Between the seed runs the patrol bot (`0x81d6bf84a5b03950d910b4a2f83c68006e0b93f4`, cron every 10 minutes) filed **23** challenges on its own against 3 agents: 12 final BREACH, 2 COMPLIANT, 5 INCONCLUSIVE, 4 still open. 12 against Exchange payout bot A (#0), 12 of them final BREACH; 6 against USDT payout bot (#1); 5 against Exchange payout bot B (#2). None accused a linter-flagged clause: since the v2.0 fix (commit be2e44f) the bot never stakes on one, and it defers instead of filing when the precedent check cannot be read. Every one of its filings is in the full list below; the first of each kind of outcome:

| Challenge | Agent | Transaction | Clause | Filed by | First ruling | Appeal | Final | Slash (GEN) | What happened |
|---|---|---|---|---|---|---|---|---|---|
| [#0](https://sentinel-tau-ashen.vercel.app/challenge/0) | #0 Exchange payout bot A (ethereum) | [0xa02619…6f75](https://eth.blockscout.com/tx/0xa026199e27d222f1384f093e31d2f111b8c5c50d7d7694783d0ae92392b56f75) | C3 | patrol bot | BREACH | — | **BREACH** CRITICAL | 1 | the panel: “The transaction record shows that the agent (0x28c6c0...) sent a transaction where the recipient was 0xee7ae85f2fe2239e27d9c1e23fffe168d63b4055.” |
| [#6](https://sentinel-tau-ashen.vercel.app/challenge/6) | #0 Exchange payout bot A (ethereum) | [0xd06b85…b803](https://eth.blockscout.com/tx/0xd06b85b15170f6da215eba0f3158f2a58e817c8438d8a577020a9d54021cb803) | C1 | patrol bot | BREACH | — | **BREACH** MAJOR | — | the panel: “The transaction shows a transfer of token 0xca14007eff0db1f8135f4c25b34de49ab0d42766.” No slash: the bond was already 0. |
| [#9](https://sentinel-tau-ashen.vercel.app/challenge/9) | #1 USDT payout bot (ethereum) | [0xa870f3…8147](https://eth.blockscout.com/tx/0xa870f35798c346524f1e8265f5f2f211a5b3448ef864441e1e25a46e36068147) | C1 | patrol bot | COMPLIANT | — | **COMPLIANT** | — | the panel: “The transaction shows a transfer of token 0xdac17f958d2ee523a2206206994597c13d831ec7, which is verified by explorer labels and tags as the USDT contract.” |
| [#19](https://sentinel-tau-ashen.vercel.app/challenge/19) | #1 USDT payout bot (ethereum) | [0x53544b…d1df](https://eth.blockscout.com/tx/0x53544b78de38cb205abdc7478ee335a23fce71d70a1b26960246ef0e2cded1df) | C1 | patrol bot | INCONCLUSIVE `UNUSABLE_ANSWER` | — | **INCONCLUSIVE** | — | the panel: “The auditors' answer could not be used (malformed, a quote that is not in the clause, a severity that does not match the mandate, or reasoning that contradicts the verdict), so code records INCONCLUSIVE.” |
| [#23](https://sentinel-tau-ashen.vercel.app/challenge/23) | #0 Exchange payout bot A (ethereum) | [0xf393c8…e58d](https://eth.blockscout.com/tx/0xf393c8a0d1a50da7b7a8bfbaa3cb09a8b5f64b1f2a8ccf1e87ed5d109555e58d) | C2 | patrol bot | BREACH | — | **BREACH** MINOR | — | the panel: “Clause C2 is plainly breached: the on-chain facts show this transaction sent 67.97085 of the chain's native value, which is far above the 0.5 ETH/native-value cap in one transaction.” No slash: the bond was already 0. |

Every one of the bot's filings, with its ruling: [docs/SEEDS.md](SEEDS.md#every-challenge).

Demo contract: every other path, ending with the books at 0 — [docs/SEEDS.md](SEEDS.md#demo-contract--every-path-drained-to-zero).

## Attack rounds

[docs/ATTACKS.md](ATTACKS.md). Final check, item by item: [docs/FINAL_CHECK.md](FINAL_CHECK.md).
