# Sentinel v2 — milestone

| | |
|---|---|
| BASE (hackathon submission, last commit on main at or before 2026-09-17 23:59 UTC) | [`b5145fa76e`](https://github.com/kenil1710/sentinel/commit/b5145fa76e8aae914ca1735e2d0507fd4860c40a) (2026-09-13) |
| FINAL | [`b7b5470aee`](https://github.com/kenil1710/sentinel/commit/b7b5470aee21f03d54e204c6d30fe0793482b4e1) |
| Compare | https://github.com/kenil1710/sentinel/compare/b5145fa76e8aae914ca1735e2d0507fd4860c40a...b7b5470aee21f03d54e204c6d30fe0793482b4e1 |
| Commits | 36; 109 files changed, 15176 insertions(+), 16549 deletions(-) (contracts, frontend, tests, tools) |
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

- Contract: [resolve_challenge](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1791-L1828), [_appeal_problem](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1855-L1886), [appeal](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1889-L1913), [resolve_appeal](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1916-L1964), [expire_appeal](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1967-L1985), [finalize](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1988-L2001), [_too_similar](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L504-L525)
- App / bot: [`frontend/src/app/(app)/challenge/[id]/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/challenge/[id]/page.tsx)

### A2 — Frozen mandate versions

Versions stored with their sha256 and effective time; an edit takes effect after the delay (1 h / 90 s); a challenge is judged against the version in force at the transaction's block time, snapshotted at filing.

- Contract: [_parse_clauses](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L350-L407), [_new_version](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1494-L1505), [update_mandate](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1569-L1602), [_version_at](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1460-L1469), [get_version_at](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2574-L2582)
- App / bot: [`frontend/src/components/MandateVersions.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/components/MandateVersions.tsx), [`frontend/src/components/ClauseEditor.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/components/ClauseEditor.tsx)

### A3 — Open challengers

Anyone but the operator challenges with an exact stake; a losing challenger's stake goes to the operator; one challenge per (chain, tx, agent); the bounty goes to the challenger who proved the breach.

- Contract: [_challenge_problem](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1665-L1694), [challenge_agent](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1697-L1754), [_finalize](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2003-L2071)
- App / bot: [`frontend/src/components/ChallengeForm.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/components/ChallengeForm.tsx), [`frontend/src/app/api/txinfo/route.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/api/txinfo/route.ts)

### A4 — Graduated slashing

Severity table (MINOR / MAJOR / CRITICAL as bps of the bond at filing) frozen in the mandate version; capped repeat multiplier; code computes the slash; the model returns only a verdict, a clause, the severity label written in the mandate and a quote, which code checks.

- Contract: [_parse_table](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L410-L442), [_multiplier_bps](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L445-L446), [_slash_amount](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L449-L456), [_decide](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L899-L952)
- App / bot: [`frontend/src/lib/mandate.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/lib/mandate.ts)

### A5 — Bond lifecycle

Top-up; timelocked withdrawal and unregister, blocked while anything is open; auto-pause below the minimum; pull payouts; the ledger invariant received = bonds + open stakes + claimable + claimed, recomputed from records on chain.

- Contract: [_set_bond](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1403-L1412), [top_up_bond](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2122-L2142), [request_withdrawal](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2145-L2171), [execute_withdrawal](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2185-L2206), [unregister](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2209-L2225), [finalize_unregister](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2228-L2247), [claim](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2250-L2262), [get_ledger](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2432-L2462)
- App / bot: [`frontend/src/components/OperatorPanel.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/components/OperatorPanel.tsx), [`frontend/src/app/(app)/balance/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/balance/page.tsx)

### B6 — Mandate linter

Validators flag clauses that cannot be judged from on-chain data, each quoted verbatim; strict equality on the clause ids; INCONCLUSIVE after the deadline if they never agree; a breach can never rest on a flagged clause.

- Contract: [_lint](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1069-L1090), [lint_mandate](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1605-L1646), [close_lint](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L1649-L1663)
- App / bot: [`frontend/src/app/(app)/register/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/register/page.tsx)

### B7 — Precedents

Only a FINAL COMPLIANT whose first ruling was COMPLIANT (unappealed or upheld against the challenger) becomes a precedent, keyed by agent, clause-text hash and a direction-aware transaction kind; a FINAL BREACH of the same key vetoes it; the patrol skips matching transactions.

- Contract: [_tx_kind](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L661-L681), [_maybe_precedent](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2073-L2099), [_veto](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2101-L2119), [precedent_for](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2755-L2772)
- App / bot: [`frontend/src/lib/kind.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/lib/kind.ts), [`frontend/src/app/api/patrol/route.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/api/patrol/route.ts), [`frontend/src/app/(app)/precedents/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/precedents/page.tsx)

### B8 — Agent track record

Breaches by severity, overrulings, appeals won/lost, last breach, total slashed — from final rulings only, and recomputed from the agent's challenges to prove the counters agree.

- Contract: [_track](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2312-L2319), [get_track_record](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2648-L2691)
- App / bot: [`frontend/src/components/TrackRecord.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/components/TrackRecord.tsx)

### C9 — Consumer contract

SentinelConsumer.is_in_good_standing(chain, wallet) by cross-contract view, and act_for_agent, which refuses an agent that is not in good standing or a caller who is not its operator.

- Contract: [_standing](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py#L2321-L2342), [is_in_good_standing](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/SentinelConsumer.py#L81-L83), [act_for_agent](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/SentinelConsumer.py#L90-L111)
- App / bot: [`frontend/src/app/(app)/consumer/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/consumer/page.tsx)

### C10 — Public API and badge

/api/check?agent=…&chain=… and /badge/<agent>.svg, answered from the canonical contract at request time.

- App / bot: [`frontend/src/app/api/check/route.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/api/check/route.ts), [`frontend/src/app/badge/[agent]/route.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/badge/[agent]/route.ts), [`frontend/src/lib/server.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/lib/server.ts)

### C11 — Frontend v2

Appeal flow, mandate version history, precedents, per-agent track record, open-challenge form, linter results at registration, the full transaction lifecycle (submitted → accepted → finalized) with success reported only after re-reading contract state; a canonical/demo switch.

- App / bot: [`frontend/src/lib/contract.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/lib/contract.ts), [`frontend/src/components/tx.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/components/tx.tsx), [`frontend/src/app/(app)/agents/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/agents/page.tsx), [`frontend/src/app/(app)/agent/[id]/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(app)/agent/[id]/page.tsx), [`frontend/src/app/(marketing)/page.tsx`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/(marketing)/page.tsx)

### Patrol — Patrol bot v2

Judges against the version in force at each transaction's block time, skips transactions a precedent covers, moves open challenges along, and attaches a fee estimate to every write.

- App / bot: [`frontend/src/app/api/patrol/route.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/app/api/patrol/route.ts), [`frontend/src/lib/heuristics.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/lib/heuristics.ts), [`frontend/src/lib/blockscout.ts`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/frontend/src/lib/blockscout.ts)

### Contract files changed

- [`contracts/Sentinel.py`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/Sentinel.py) (rewritten for v2) and [`contracts/SentinelConsumer.py`](https://github.com/kenil1710/sentinel/blob/b7b5470aee21f03d54e204c6d30fe0793482b4e1/contracts/SentinelConsumer.py) (new) — see the compare link above.

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

Canonical contract [`0x1d4B73BD37785F113a599505D80Bc9BDA3D96a90`](https://explorer-studio-dev.genlayer.com/address/0x1d4B73BD37785F113a599505D80Bc9BDA3D96a90), read 2026-10-09T07:24:01.056Z.

**10 agents on 5 chains · 120 challenges: 22 BREACH, 20 COMPLIANT, 75 INCONCLUSIVE final, 3 open · 2 appeals (1 upheld, 1 rejected) · 7 precedents · 2.6561 GEN slashed, 1.328 GEN in bounties.** Ledger: received 17.15 = bonds 7.3438 + open stakes 0.15 + claimable 9.6561 + claimed 0 (holds, and every total matches its recomputation from the records).

Every agent is a live bot we do not operate; every mandate is ours, written for that bot's observable behaviour; every challenge names a real transaction mined after the agent registered; the validators decided each one. Every final BREACH was re-checked by hand against the chain's own RPC: [docs/BREACHES.md](docs/BREACHES.md). Linter at registration: #0 DONE · #1 DONE · #2 DONE (C2, C3 flagged) · #3 DONE · #4 DONE · #5 DONE · #6 DONE · #7 DONE · #8 DONE · #9 DONE.

### Seeded cases

| Challenge | Agent | Transaction | Clause | Filed by | First ruling | Appeal | Final | Slash (GEN) | What happened |
|---|---|---|---|---|---|---|---|---|---|
| [#2](https://sentinel-tau-ashen.vercel.app/challenge/2) | #0 Exchange payout bot A (ethereum) | [0x9fc7dc…288c](https://eth.blockscout.com/tx/0x9fc7dc1c5c826b945e50831a62ac9f1bc55da6a8c85bdf3f9487eeeb08ad288c) | C1 | 0xc69f4b…cd98 | BREACH | operator → rejected | **BREACH** MAJOR | 0.4 | MAJOR breach: the payout bot sent a token that is neither USDT nor USDC. The operator appealed (customer withdrawals); a fresh panel rejected the appeal |
| [#3](https://sentinel-tau-ashen.vercel.app/challenge/3) | #0 Exchange payout bot A (ethereum) | [0x576d41…3f07](https://eth.blockscout.com/tx/0x576d41400d2727726410e88b8a77c066756d6664a8ddec2686e5bd01fa143f07) | C1 | 0xcd6d1e…f1c0 | COMPLIANT | — | **COMPLIANT** | — | an open challenger read a deposit the agent RECEIVED as the agent sending it; the panel saw the agent was only the recipient. Open-challenger loss; became a precedent (direction `in:`) |
| [#4](https://sentinel-tau-ashen.vercel.app/challenge/4) | #1 USDT payout bot (ethereum) | [0x1d9c44…8158](https://eth.blockscout.com/tx/0x1d9c44d54f813a8cdbd2269d20c4739d4cb245b21b491ac8437dadd266528158) | C1 | 0xcd6d1e…f1c0 | INCONCLUSIVE `MODEL_INCONCLUSIVE` | — | **INCONCLUSIVE** | — | the panel judged a symbol-only clause too vague to decide (INCONCLUSIVE); stake refunded |
| [#5](https://sentinel-tau-ashen.vercel.app/challenge/5) | #2 Exchange payout bot B (ethereum) | [0x410c56…b1f1](https://eth.blockscout.com/tx/0x410c562817b168777cba9b0f82e2f010770fdec0523052b78f461f8ce116b1f1) | C3 | 0xcd6d1e…f1c0 | INCONCLUSIVE `MODEL_INCONCLUSIVE` | — | **INCONCLUSIVE** | — | the linter had flagged C3 (a customer's risk is not in the transaction data); INCONCLUSIVE |
| [#6](https://sentinel-tau-ashen.vercel.app/challenge/6) | #5 Base USDC payout bot (base) | [0x4643a1…9228](https://base.blockscout.com/tx/0x4643a13c567f3e51ad863377e273a62f8a6bccc183b49c6f3d3d5f7463fe9228) | C1 | 0xc69f4b…cd98 | COMPLIANT | — | **COMPLIANT** | — | mined while mandate v2 (10 USDC limit) was queued: judged under v1, COMPLIANT. A filing alleging v2's C3 on it was refused by the contract ("version 1 has no clause C3") |
| [#9](https://sentinel-tau-ashen.vercel.app/challenge/9) | #7 Robinhood Chain keeper B (robinhood) | [0x2815bd…8a9e](https://robinhoodchain.blockscout.com/tx/0x2815bded1885af90a2d8cefed7ee2a0eb797fff8f056567ffb0256a07fd08a9e) | C1 | 0xc69f4b…cd98 | COMPLIANT | — | **COMPLIANT** | — | Robinhood Chain, read by validators through a real browser (Cloudflare): COMPLIANT; became a precedent |
| [#10](https://sentinel-tau-ashen.vercel.app/challenge/10) | #1 USDT payout bot (ethereum) | [0x136b64…39f1](https://eth.blockscout.com/tx/0x136b64ed376e8003085f5377e0568f37d9e97886167c210fb56a74ae7ce739f1) | C1 | 0xc69f4b…cd98 | COMPLIANT | challenger → upheld | **INCONCLUSIVE** | — | first panel: COMPLIANT. The challenger appealed that a ticker symbol cannot say which token is meant; the fresh panel ruled INCONCLUSIVE. **Appeal upheld**: stake and appeal bond returned |
| [#15](https://sentinel-tau-ashen.vercel.app/challenge/15) | #0 Exchange payout bot A (ethereum) | [0x0b9b8f…7828](https://eth.blockscout.com/tx/0x0b9b8fce8f38758faeea15148b43c74eca8be512c68f2ab7fd6d1fe5b6e47828) | C2 | 0xc69f4b…cd98 | BREACH | — | **BREACH** MINOR | — | MINOR breach: 6.13 ETH sent in one transaction against a 0.5 ETH cap; filed after an earlier breach was final, so the multiplier was ×1.5 (no slash left: the bond was already 0) |
| [#18](https://sentinel-tau-ashen.vercel.app/challenge/18) | #2 Exchange payout bot B (ethereum) | [0x06700f…f343](https://eth.blockscout.com/tx/0x06700f5bf297f890455ca657af2b6b795bddee3af671a90f04c5f12fb314f343) | C2 | 0xcd6d1e…f1c0 | INCONCLUSIVE `MODEL_INCONCLUSIVE` | — | **INCONCLUSIVE** | — | a Tether Gold payout under "Only send stablecoins", a clause the linter had flagged; the panel ruled INCONCLUSIVE |
| [#25](https://sentinel-tau-ashen.vercel.app/challenge/25) | #5 Base USDC payout bot (base) | [0xcf9d9b…9b38](https://base.blockscout.com/tx/0xcf9d9bc088926a0b44c6b3352d16c305dff801ab7fd2cf8a993968c2b0bc9b38) | C3 | 0xcd6d1e…f1c0 | BREACH | — | **BREACH** MAJOR | 0.2 | mined after v2 took effect: 232.99 USDC in one transfer against the 10 USDC limit. MAJOR breach, filed by an open challenger |
| [#109](https://sentinel-tau-ashen.vercel.app/challenge/109) | #8 Arbitrum USDC payout bot (arbitrum) | [0x7d11a6…ca99](https://arbitrum.blockscout.com/tx/0x7d11a62b5a8d2f56b15c06f20856e5702e2e9cb7671184bd3b6eee086111ca99) | C1 | 0xc69f4b…cd98 | COMPLIANT | — | **COMPLIANT** | — | an ordinary USDC payout on Arbitrum, read through a real browser: COMPLIANT; became a precedent |
| [#110](https://sentinel-tau-ashen.vercel.app/challenge/110) | #9 Polygon token payout bot (polygon) | [0xd9cc63…63c8](https://polygon.blockscout.com/tx/0xd9cc63dfa1e65ac119238889fc7125dc62a259ee997f0da1325f34b17d7b63c8) | C1 | 0xcd6d1e…f1c0 | COMPLIANT | — | **COMPLIANT** | — | an ordinary token payout on Polygon, read through a real browser: COMPLIANT; became a precedent |

- **Withdrawal blocked while a challenge was open:** the operator of payout bot B called `request_withdrawal` with challenge #106 open; the contract refused it — [tx](https://explorer-studio-dev.genlayer.com/tx/0x1e90f20fb08ff7402098588bf06af3bb865af3bc222c511fcda9b1019ac0b64a): “Withdrawals are blocked while 1 challenge(s) or appeal(s) are open against this agent”.
- **Unregister:** agent #6 (Robinhood keeper A) stopped transacting after registration; its operator unregistered it ([tx](https://explorer-studio-dev.genlayer.com/tx/0xdf0f7ea809c4e3887fc3b83601375d790f2b61ea2ebab0f349369cbc70a290f5)) and after the 1 h timelock anyone finalized it ([tx](https://explorer-studio-dev.genlayer.com/tx/0x809342a6300cc53d43186fedaa9d119e95d55e6ff2fcffa6feca37d454ddacf0)): status RETIRED, the bond moved to the operator's claimable balance.
- **Mandate edit not applied retroactively:** the Base bot published v2 ([tx](https://explorer-studio-dev.genlayer.com/tx/0xd199a9efbecd9f3a82f50c8973ce41bf77436a42c0d06fed422b6e06e32d1068)) adding a 10 USDC limit, effective 2026-10-08T19:35:49.000Z; see #6 and #25 above.
- **Precedent skip:** 7 precedents exist ([/precedents](https://sentinel-tau-ashen.vercel.app/precedents)). The bot's accusations against the USDT payout bot's USDT transfers stopped once #17 became a final COMPLIANT precedent for that agent, clause and transaction kind; the patrol report lists each withheld transaction under "withheld by precedent".
- **SentinelConsumer:** 3 requests on [0x02F421…11e5](https://explorer-studio-dev.genlayer.com/address/0x02F421486a6de07c3D2cF624576ED7ecDFe711e5) — 1 carried out (the Base bot's operator, agent in good standing), 2 refused (payout bot A: "status is PAUSED; bond below the 0.5 GEN minimum; 8 final CRITICAL breach(es)"; and a caller who was not the operator).
- **Two keeper wallets went quiet** on Arbitrum and Polygon after registration (agents #3 and #4 have no challenges); two active payout bots (#8, #9) carry those chains' cases.

### The patrol bot, unattended

Between the seed runs the patrol bot (`0x81d6bf84a5b03950d910b4a2f83c68006e0b93f4`, cron every 10 minutes) filed **108** challenges on its own against 3 agents: 19 final BREACH, 15 COMPLIANT, 71 INCONCLUSIVE, 3 still open. 13 of its BREACHes are against payout bot A (#0), which kept calling the batch executor its C3 forbids and sending tokens its C1 does not list, until its bond reached 0 and it was paused; 6 are against payout bot B (#2), each a single transaction sending more than the 5 ETH its C1 allows. 73 of its filings were the same accusation against payout bot B's clause C2 ("Only send stablecoins"), which the linter had flagged: a breach there can never be slashed, so each came back INCONCLUSIVE and the stake was refunded. That was a flaw in the bot, not the contract; the patrol now never stakes on a flagged clause, and defers instead of filing when the precedent check cannot be read (commit be2e44f).

| Challenge | Agent | Transaction | Clause | Filed by | First ruling | Appeal | Final | Slash (GEN) | What happened |
|---|---|---|---|---|---|---|---|---|---|
| [#0](https://sentinel-tau-ashen.vercel.app/challenge/0) | #0 Exchange payout bot A (ethereum) | [0x24927d…cace](https://eth.blockscout.com/tx/0x24927d90a5704762a2cda4d2bbf7cbb934dde53d9cf8ca4ca18c6a1889f1cace) | C3 | patrol bot | BREACH | — | **BREACH** CRITICAL | 1 | the bot's first filing: payout bot A called the batch executor its C3 forbids. CRITICAL breach, 1 GEN slashed (50% of the 2 GEN bond) |
| [#1](https://sentinel-tau-ashen.vercel.app/challenge/1) | #1 USDT payout bot (ethereum) | [0xf7f0b4…33cb](https://eth.blockscout.com/tx/0xf7f0b4cc01e4a51175625e82731ee5a0bd51ddb3fa98a1734a8d05483e2e33cb) | C1 | patrol bot | INCONCLUSIVE `MODEL_INCONCLUSIVE` | — | **INCONCLUSIVE** | — | the bot flags every token named only by symbol; the panel ruled INCONCLUSIVE |
| [#11](https://sentinel-tau-ashen.vercel.app/challenge/11) | #0 Exchange payout bot A (ethereum) | [0xc0bba4…4b48](https://eth.blockscout.com/tx/0xc0bba483dc7801566e1e279837ab428de7201a4dbac80944e8b2c9b2f34e4b48) | C3 | patrol bot | BREACH | — | **BREACH** CRITICAL | — | another call to the forbidden batch executor; CRITICAL, no slash left (the bond had already been taken to 0) |
| [#12](https://sentinel-tau-ashen.vercel.app/challenge/12) | #0 Exchange payout bot A (ethereum) | [0x8cb66c…13c3](https://eth.blockscout.com/tx/0x8cb66ca377803001c97fb2386e9cbb50f18dc9c5278746a4171a879c44a413c3) | C1 | patrol bot | BREACH | — | **BREACH** MAJOR | — | the agent sent token 0x4e3fbd… (not USDT or USDC); MAJOR, no slash left |
| [#13](https://sentinel-tau-ashen.vercel.app/challenge/13) | #0 Exchange payout bot A (ethereum) | [0x9c82f1…60a8](https://eth.blockscout.com/tx/0x9c82f14d2015f6777f28606fb9611c121d31ce4deec6777c72eaf4c2a5a960a8) | C3 | patrol bot | BREACH | — | **BREACH** CRITICAL | — | another call to the forbidden batch executor; CRITICAL, no slash left |
| [#14](https://sentinel-tau-ashen.vercel.app/challenge/14) | #0 Exchange payout bot A (ethereum) | [0x5c71ad…3b4c](https://eth.blockscout.com/tx/0x5c71ad357259e215a0898078a7778615097ec5e494be0c3dfd54e44ff8933b4c) | C3 | patrol bot | BREACH | — | **BREACH** CRITICAL | — | another call to the forbidden batch executor; CRITICAL, no slash left |

Every one of the bot's filings, with its ruling: [docs/SEEDS.md](docs/SEEDS.md#every-challenge).

Demo contract: every other path, ending with the books at 0 — [docs/SEEDS.md](SEEDS.md#demo-contract--every-path-drained-to-zero).

## Attack rounds

[docs/ATTACKS.md](ATTACKS.md). Final check, item by item: [docs/FINAL_CHECK.md](FINAL_CHECK.md).
