# Superseded deployments

Sentinel v2 is a new contract with new addresses (see [`deployments.json`](../../deployments.json)). The
hackathon deployments below were **not modified**: they stay on GenLayer Studio Dev, readable, with their full
record. Nothing in the v2 app, API or patrol bot writes to them.

## v1 — Agent Tank hackathon submission (Onchain Justice track)

| | |
|---|---|
| Address | [`0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe`](https://explorer-studio-dev.genlayer.com/address/0x67A1276E240376D06Cec7bA37AE3E497AeF48dEe) |
| Network | GenLayer Studio Dev, chain 61997 |
| Deployed | 2026-09-12, from the minified artifact `docs/superseded/v1/source/build/Sentinel.min.py` (50,355 bytes, sha256 `64d82a250f22bed0c243b37d1c523425556a63adc591f52237d9be926d313f46`) |
| Readable source | [`docs/superseded/v1/source/Sentinel.py`](v1/source/Sentinel.py) — the hackathon contract as it was at the BASE commit |
| Last code commit | `b5145fa` (2026-09-13), the BASE of the v2 milestone |
| Record when v2 shipped (read 2026-10-08 with `get_stats`) | 22 agents registered, 9 active, 57 challenges filed and settled: 14 VIOLATION, 22 COMPLIANT, 21 INCONCLUSIVE; 1.742256 GEN slashed, 0.871128 GEN in bounties; 3,598 patrol runs |

An earlier v1 address, [`0x3fc4E5dA7bc0a4c28EF52435aE62606D5aED563e`](https://explorer-studio-dev.genlayer.com/address/0x3fc4E5dA7bc0a4c28EF52435aE62606D5aED563e),
was superseded during the hackathon itself (150 challenges: 33 VIOLATION, 61 COMPLIANT, 56 INCONCLUSIVE) and is also
untouched.

Why v2 could not be an upgrade in place: GenLayer contracts are not upgradeable, and v2 changes every storage
structure (clause-numbered mandate versions, challenge snapshots, appeals, pull balances, precedents). The v1 scripts,
build pipeline and test suites that targeted it are kept under [`v1/source/`](v1/source/) and its deployment record
under [`v1/deployments.json`](v1/deployments.json).

What v1's README listed as unfixed and v2 now addresses:

| v1 known limitation | v2 |
|---|---|
| An operator could withdraw the whole bond instantly whenever nothing was pending | Withdrawals and unregistering are timelocked (1 h canonical) and blocked while anything is open; challenges filed during the timelock still bind |
| Settlement terms were read at settlement, not snapshotted at filing | Every parameter (mandate version, severity table, multiplier, bond, bounty share, windows) is snapshotted at filing |
| A refunded challenge released its transaction; a stalled one retired it | One challenge per (chain, transaction, agent), released only by a VOID filing or a stall (nothing was judged) |
| Mandate edits applied to pending judgement only by refusal | Versions with a delay; a challenge is judged against the version in force at its transaction's block time |
| A single verdict was final at once | Provisional ruling, one appeal by the losing party, fresh panel |

## v2.0.0 and v2.0.1 — superseded by the attack rounds

Each attack round that changed the contract produced a new deployment (GenLayer contracts are not upgradeable). The
earlier ones stay on chain, readable, with their records; their open challenges keep their deadlines and permissionless
exits.

| Deployment | Address | From commit | Why it was replaced |
|---|---|---|---|
| Sentinel | [`0x41Ad5F63d1FeE9b63D2B6f8cD6C92dF08a64c0a2`](https://explorer-studio-dev.genlayer.com/address/0x41Ad5F63d1FeE9b63D2B6f8cD6C92dF08a64c0a2) | `1830a34589` | attack round 1 fixes (v2.0.1) |
| SentinelDemo | [`0x0396d725d4a8D4F4E2BAC4Df1bc0BB80cbbC8e29`](https://explorer-studio-dev.genlayer.com/address/0x0396d725d4a8D4F4E2BAC4Df1bc0BB80cbbC8e29) | `1830a34589` | attack round 1 fixes (v2.0.1) |
| SentinelConsumer | [`0x02B793C1603fAa78997De8Cf2C6F370f205bDF83`](https://explorer-studio-dev.genlayer.com/address/0x02B793C1603fAa78997De8Cf2C6F370f205bDF83) | `1830a34589` | attack round 1 fixes (v2.0.1) |
| Sentinel | [`0x92979f66ca6b3f6F57Ab2c6AD425DA68c9Ccb48D`](https://explorer-studio-dev.genlayer.com/address/0x92979f66ca6b3f6F57Ab2c6AD425DA68c9Ccb48D) | `eae94e5af9` | attack round 2 fix (v2.0.2) |
| SentinelDemo | [`0xc128B02839a6668ff9d9689214986864821CdC0b`](https://explorer-studio-dev.genlayer.com/address/0xc128B02839a6668ff9d9689214986864821CdC0b) | `eae94e5af9` | attack round 2 fix (v2.0.2) |
| SentinelConsumer | [`0xCcCc4495705bD11D47c2Cb0F719cD3B1630dc4b2`](https://explorer-studio-dev.genlayer.com/address/0xCcCc4495705bD11D47c2Cb0F719cD3B1630dc4b2) | `eae94e5af9` | attack round 2 fix (v2.0.2) |

What each one recorded:

- **v2.0.0** (`0x41Ad5F63…c0a2`): the first full seed — 8 agents on all five chains, 12 challenges with every verdict, a
  CRITICAL breach on Arbitrum, an operator appeal and a challenger appeal (both rejected), a real validator
  disagreement (`resolve_challenge` UNDETERMINED, nothing written), a withdrawal refused while a challenge was open, a
  queued mandate edit that could not reach back, and an unregister. Log: [`v2.0.0/seed-canonical.json`](v2.0.0/seed-canonical.json).
  Its demo deployment ran every path and drained to exactly 0: [`v2.0.0/seed-demo.json`](v2.0.0/seed-demo.json).
  Attack round 1 ran against it.
- **v2.0.1** (`0x92979f66…b48D`): round-1 fixes; reseeding had started (agents registered) when round 2 found B1.
  Partial logs in [`v2.0.1/`](v2.0.1/).
