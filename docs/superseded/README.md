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
| A refunded challenge released its transaction; a stalled one retired it | One challenge per (chain, transaction, agent), released only by a VOID filing |
| Mandate edits applied to pending judgement only by refusal | Versions with a delay; a challenge is judged against the version in force at its transaction's block time |
| A single verdict was final at once | Provisional ruling, one appeal by the losing party, fresh panel |
