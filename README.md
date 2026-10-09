# Sentinel

**An autonomous agent that polices other autonomous agents — v2: bonded mandates, appealable rulings, final settlements.**

An operator registers an AI agent's wallet on one of five chains under a mandate of numbered clauses, gives each
clause a severity, and posts a bond. Anyone can challenge one transaction of that wallet as a breach of one clause
and stake on being right. GenLayer validators each fetch the transaction from the chain's Blockscout explorer, and
must agree on a verdict against the mandate version that was in force when the transaction was mined. The ruling is
provisional for an hour; the party it went against may appeal once; then it is final, code computes the slash, and
every payout is a pull balance.

**Live:** [sentinel-tau-ashen.vercel.app](https://sentinel-tau-ashen.vercel.app) · built on the
[Agent Tank hackathon](docs/superseded/README.md) submission (Onchain Justice track winner).

| Contract (GenLayer Studio Dev, chain 61997) | Address |
|---|---|
| **Sentinel** — canonical register, 1 h windows | <!--ADDR:Sentinel-->`0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB`<!--/ADDR--> |
| **Sentinel** — demo, same code, 90 s windows | <!--ADDR:SentinelDemo-->`0x74ca153c17a67F3E5Fcd893afF053395AEce1Aff`<!--/ADDR--> |
| **SentinelConsumer** — reads the canonical register | <!--ADDR:SentinelConsumer-->`0x053f15512462FD4f8F70F443EdCA1413e96D5eD0`<!--/ADDR--> |

RPC `https://studio-dev.genlayer.com/api`, explorer <https://explorer-studio-dev.genlayer.com/>. All three were
deployed from one commit, and `node tools/verify_source.mjs` reads each back with `gen_getContractCode` and compares
it byte for byte with `contracts/` at HEAD. The hackathon contracts are untouched and listed in
[docs/superseded/README.md](docs/superseded/README.md).

- Contracts: [`contracts/Sentinel.py`](contracts/Sentinel.py), [`contracts/SentinelConsumer.py`](contracts/SentinelConsumer.py)
- Milestone write-up, with links to every changed file: [docs/MILESTONE.md](docs/MILESTONE.md)
- The final check, item by item with proof: [docs/FINAL_CHECK.md](docs/FINAL_CHECK.md)
- Attack rounds: [docs/ATTACKS.md](docs/ATTACKS.md)
- What validators can actually reach (measured): [docs/PROBE.md](docs/PROBE.md)
- Demo video: [docs/demo/sentinel-v2.mp4](docs/demo/sentinel-v2.mp4) (vertical cut: [docs/demo/sentinel-v2-vertical.mp4](docs/demo/sentinel-v2-vertical.mp4))
  Recorded on the previous deployment (addresses in docs/superseded/README.md); the flow is unchanged.

---

## What changed from the hackathon version

| | v1 (hackathon) | v2 |
|---|---|---|
| Ruling | final at once | **provisional → contestable (1 h) → final**; one appeal by the losing party, with a bond and counter-evidence; a fresh panel; a novelty gate refuses a verbatim or near-verbatim resend |
| Mandate | free text, editable when nothing was pending | **numbered clauses, each with a severity**, stored as **versions with a hash and an effective time**; edits take effect after 1 h; a challenge is judged against the version in force at its transaction's block time, snapshotted at filing |
| Challengers | anyone, fixed stake | anyone except the operator; a loser's stake goes **to the operator**; one challenge per (chain, transaction, agent) once decided; the bounty goes to the challenger who proved the breach |
| Slashing | 20% of the bond, whatever the breach | **severity table frozen in the mandate version** (MINOR / MAJOR / CRITICAL as a share of the bond at filing) × a **capped repeat multiplier**; code computes it; the model only returns BREACH / COMPLIANT and a severity label quoted from the mandate |
| Bond | instant withdrawal | top-up; **timelocked withdrawal** of what open challenges could never slash, and **unregister**, whose release waits until nothing is open; **auto-pause** below the minimum; **pull payouts** only; a ledger invariant checked in tests and on chain |
| Mandate quality | — | a **linter**: validators mark clauses that cannot be judged from on-chain data, quoted verbatim, strict equality on clause ids; a breach can never rest on a flagged clause |
| Learning | the bot parsed its own past accusations | **precedents**: only FINAL COMPLIANT rulings whose first ruling was already COMPLIANT; keyed by agent, clause text and transaction kind; the patrol skips matching transactions; a single FINAL BREACH vetoes one for good |
| Reputation | a compliance score | a **track record** computed by the contract: breaches by severity, overrulings, appeals won/lost, last breach, total slashed — and recomputed from the records to prove the counters agree |
| Integration | `/api/check` | `/api/check?agent=…&chain=…`, an **SVG badge**, and **SentinelConsumer**, a contract other contracts can copy |

## The lifecycle of a challenge

```
filed ──resolve_challenge (anyone)──► provisional BREACH / COMPLIANT ──► CONTESTABLE (1 h)
  │                                  provisional INCONCLUSIVE / VOID ──► FINAL at once
  │                                                      │
  │ resolve_deadline (24 h) passed:                      ├─ no appeal: finalize (anyone) ──► FINAL
  └─ settle_stalled (anyone): stake back,                └─ appeal (losing party, bond, new evidence) ──► APPEALED
     recorded INCONCLUSIVE · STALLED                         ├─ resolve_appeal (anyone): fresh panel ──► FINAL
                                                             └─ appeal deadline (24 h) passed: expire_appeal (anyone):
                                                                bond back, first ruling stands ──► FINAL
```

Every state has a deadline and a permissionless exit. At filing the contract snapshots the mandate version (picked
from the transaction's block time), its clause text and hash, its severity table, its linter result, the agent's
bond, the repeat multiplier, the bounty share and every window, and binds the challenge to the exact chain,
transaction hash, agent and wallet.

### Who gets what

| Final verdict | Operator | Challenger | Treasury |
|---|---|---|---|
| BREACH | bond − slash | stake + 50% of the slash | 50% of the slash |
| COMPLIANT | + the challenger's stake | loses the stake | — |
| INCONCLUSIVE | — | stake back | — |
| VOID (filed with the wrong block time) | + the stake | loses the stake; the transaction is released so a correct filing can follow | — |
| INCONCLUSIVE · STALLED (no panel in 24 h) | — | stake back; the transaction is released | — |

`slash = bond_at_filing × severity_bps × multiplier_bps`, divided before multiplied and never more than the bond
still there. `multiplier = min(1 + step × prior final breaches, cap)`, both from the mandate version. A lost appeal's
bond goes to the other party; a won or expired appeal's bond goes back to the appellant. The treasury is the
deploying address, fixed at construction; its share is an ordinary pull balance.

### What a paused agent means

An agent whose bond falls below the 0.5 GEN minimum (slashed, or withdrawn) is **PAUSED** automatically, and is ACTIVE
again as soon as a top-up brings it back to the minimum.

- **It can still be challenged, at any bond, zero included.** Pausing is not an exit: an agent keeps answering for
  what it does. (Up to v2.0.2 a filing against a bond of exactly 0 was refused, which let an operator freeze an agent's
  record by letting the bond run out; v2.1.0 removed that refusal.)
- **Every ruling counts against its record.** A final BREACH adds to the agent's breach counts and to the repeat
  multiplier of later filings, even when there is nothing left to slash; the slash is whatever the bond can still
  cover, and the challenger then gets their stake back and a bounty of that size (possibly 0).
- **It is not in good standing.** `get_standing`, `/api/check`, the badge and `SentinelConsumer` all answer no, with
  the reasons ("status is PAUSED", "bond below the 0.5 GEN minimum", and any final CRITICAL breach). SentinelConsumer
  refuses to act for it.
- **The patrol bot does not stake on an agent with nothing to slash** (it is left out of `get_patrol_queue`); anyone
  else can still challenge it.

## What the model is never allowed to decide

The model answers exactly two questions:

1. **Judging:** is this one transaction a BREACH, COMPLIANT or INCONCLUSIVE under these clauses — and if a breach,
   which clause, the severity label written next to it, and a quote copied from it.
2. **Linting:** which clauses cannot be judged from on-chain data, each with a quote.

Code decides everything else, and checks the model's answer before it counts:

| Decided by code | How |
|---|---|
| Which explorer is read | `_tx_url` builds the only URL in the contract, from a fixed host table and a normalised hash; no caller supplies a URL |
| Whether the record is complete | truncated transfers, unindexed transfers, no block, no status, no sender → INCONCLUSIVE (`PARTIAL_DATA`) before the model sees anything |
| Whether it is the agent's transaction | the wallet must be the sender, the recipient or a party to a token transfer (`NOT_AGENT_TX`) |
| Whether the filing told the truth | the chain's block time must equal the filed one, or the filing is VOID |
| Which mandate version applies | the latest version whose effective time is not after the block time, snapshotted at filing |
| Whether the answer is usable | clause id must exist, severity label must equal the clause's, quote must be in the clause (up to case and spacing), reasoning must not contradict the verdict; otherwise INCONCLUSIVE (`UNUSABLE_ANSWER`) |
| Whether a breach can count | never on a clause the linter flagged (`NOT_JUDGEABLE_CLAUSE`); the most severe clause listed decides |
| Every amount | the severity table and multiplier from the snapshot; the 50/50 bounty split; forfeits and refunds |
| Every deadline, who may act, precedents, track records, standing | code |

**Model disagreement, exactly as it behaves on chain.** Validators compare one string by strict equality:
`verdict | clause | digest of the immutable transaction facts | transaction kind`, where the clause is filled in only
for a BREACH, so every INCONCLUSIVE compares the same however it was reached (the linter compares
`status | flagged clause ids`). If they do not agree, the transaction ends **UNDETERMINED and nothing is written** —
measured on studio-dev: a counter bumped before a disagreeing round was still 0 afterwards. The challenge stays
PENDING (or the appeal APPEALED, or the lint PENDING) and anyone may call the method again. A disagreement is never
recorded as INCONCLUSIVE. Only the deadline exits record anything: `settle_stalled` records INCONCLUSIVE with code
`STALLED`, `expire_appeal` lets the first ruling stand, and `close_lint` records the lint as INCONCLUSIVE.

**No mutable content decides a final verdict.** The digest on the consensus axis covers only facts a chain cannot
change (sender, recipient, value, selector, token transfers by contract address, block, time). An appeal re-reads the
transaction and must find the same digest, or it waits. Explorer labels (contract names, tags, verification status)
reach the model only under a heading that says they are mutable, and a clause that depends on them is what the
linter exists to flag.

## The seeded register

<!--SEED-->
Canonical contract [`0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB`](https://explorer-studio-dev.genlayer.com/address/0x9147b6b4c1200daC6a9E0665925D391E6AEABDdB), read 2026-10-09T11:49:56.273Z.

**10 agents on 5 chains · 36 challenges: 15 BREACH, 8 COMPLIANT, 9 INCONCLUSIVE final, 4 open · 1 appeals (0 upheld, 1 rejected) · 6 precedents · 2.2 GEN slashed, 1.1 GEN in bounties.** Ledger: received 12.9 = bonds 7.8 + open stakes 0.2 + claimable 4.9 + claimed 0 (holds, and every total matches its recomputation from the records).

Every agent is a live bot we do not operate; every mandate is ours, written for that bot's observable behaviour; every challenge names a real transaction mined after the agent registered; the validators decided each one. Every final BREACH was re-checked by hand against the chain's own RPC: [docs/BREACHES.md](docs/BREACHES.md). Linter at registration: #0 DONE · #1 DONE · #2 DONE (C2, C3 flagged) · #3 DONE · #4 DONE · #5 DONE · #6 DONE · #7 DONE · #8 DONE · #9 DONE.

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
- **Precedent skip:** 6 precedents exist ([/precedents](https://sentinel-tau-ashen.vercel.app/precedents)). A live dry run of the patrol ([docs/patrol-dry-run.json](docs/patrol-dry-run.json), 2026-10-09T11:48:47.916Z) withheld 6 flag(s) because a final COMPLIANT precedent covers that agent, clause and transaction kind (for example 0xdc136e560e… under C1, covered by #4).
- **SentinelConsumer:** 3 requests on [0x053f15…5eD0](https://explorer-studio-dev.genlayer.com/address/0x053f15512462FD4f8F70F443EdCA1413e96D5eD0) — 1 carried out (the Base bot's operator, agent in good standing), 2 refused (payout bot A: "status is PAUSED; bond below the 0.5 GEN minimum; 8 final CRITICAL breach(es)"; and a caller who was not the operator).
- **No appeal was upheld on this deployment.** The operator's appeal on #2 was rejected; both tries at the symbol-only clause (#30, #33) came back INCONCLUSIVE at once, which cannot be appealed. Nothing was forced. An upheld appeal is on chain in the v2.0 live history (challenge #10 on [`0x1d4B73BD…6a90`](https://explorer-studio-dev.genlayer.com/address/0x1d4B73BD37785F113a599505D80Bc9BDA3D96a90), [docs/superseded/v2.0.2/SEEDS.md](docs/superseded/v2.0.2/SEEDS.md)), and the path is covered offline (`test_sentinel.Appeals`).
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

Every one of the bot's filings, with its ruling: [docs/SEEDS.md](docs/SEEDS.md#every-challenge).

<!--/SEED-->

## Why most results are INCONCLUSIVE

On the v2.0 deployment that ran from 8 to 9 October ([docs/superseded/README.md](docs/superseded/README.md)), 75 of
the 120 challenges ended INCONCLUSIVE. The same pattern will show on any register a bot patrols, for three plain
reasons:

1. **Most were filed by the patrol bot against a clause the linter had flagged.** 73 of its filings accused payout
   bot B under "Only send stablecoins", a clause the validators had marked as not judgeable from on-chain data
   (which tokens count as stablecoins is decided off chain). A breach on a flagged clause can never be slashed, so
   each came back INCONCLUSIVE and the stake was refunded. That was a bug in the bot, not in the contract; the bot now
   never stakes on a flagged clause.
2. **Clauses that name tokens by symbol are deliberately undecidable.** "Only move USDT and USDC" does not say which
   contracts are meant, and a token called USDT at another address is the oldest spoof there is. The bot flags every
   token under such a clause, and the validators say they cannot decide.
3. **Missing or partial data is never decided either way.** A transaction the explorer has not fully indexed, or a
   record that does not show the agent's wallet, ends INCONCLUSIVE before the model is asked anything.

That is the safe outcome. INCONCLUSIVE costs the challenger nothing (the stake comes back), costs the operator
nothing, adds nothing to the agent's breaches, and creates no precedent. The alternative, a judge that must answer
BREACH or COMPLIANT every time, would slash bonds and clear transactions on guesses. An INCONCLUSIVE also holds the
transaction, so nobody can file the same accusation again and again until a panel says BREACH.

On the current v2.1.0 register, with the bot no longer staking on flagged clauses, the share is lower: 9 of the 32
final results on 9 October were INCONCLUSIVE (the counts above are read from the chain and keep moving as the bot
patrols).

## How a reviewer can test

No wallet needed to look; a funded Studio Dev wallet to act (the Studio faucet funds any address).

1. **Read the register:** [Agents](https://sentinel-tau-ashen.vercel.app/agents) → any agent: standing, track record,
   every mandate version with its linter result, every challenge. Each figure is a contract read.
2. **Follow a challenge end to end:** [Challenges](https://sentinel-tau-ashen.vercel.app/challenges) → a final one
   shows the snapshot taken at filing, the ruling with its quote and the record the panel read, the appeal if there
   was one, and where every wei went.
3. **Ask the API:** `curl 'https://sentinel-tau-ashen.vercel.app/api/check?agent=0x28c6c06298d514db089934071355e5743bf21d60&chain=ethereum'`,
   and the badge at `/badge/0x28c6c06298d514db089934071355e5743bf21d60.svg?chain=ethereum`.
4. **Walk every path yourself in minutes:** switch the header to **Demo** (90 s windows), register an agent on any
   active wallet, run the linter, file a challenge on one of its new transactions (the form fills the block time from
   the chain and shows the version it will be judged against), resolve it, appeal it from the losing wallet, finalize,
   withdraw (timelocked), unregister, and claim from **Balance**.
5. **Check the books:** **Analytics** and **Balance** show `get_ledger`: received = bonds + open stakes + claimable +
   claimed, recomputed from every record.
6. **From a contract:** **Consumer** calls `SentinelConsumer.is_in_good_standing(chain, wallet)` and `act_for_agent`,
   which refuses an agent that is not in good standing, and anyone but its operator.
7. **Offline:**

   ```bash
   cd test && python3 -m unittest discover -s . -p "test_*.py"    # every Python suite
   node --experimental-strip-types --no-warnings test/test_patrol.mjs     # from the repo root
   python3 tools/scan_writes.py                                         # no write before a revert
   node tools/verify_source.mjs                                         # chain == HEAD, byte for byte
   ```

## Known limitations

Fixed in v2.1.0, from the list as it stood at v2.0.2: the two spellings of INCONCLUSIVE on the consensus axis (now
one); withdrawal griefing (an open challenge now holds back only what it could slash, and unregistering can start
while challenges are open); views that walked whole lists (now bounded, with paged `get_ledger_page`,
`get_open_challenge_page` and `get_precedent_page`); a zero bond that froze an agent's record; and, in the patrol bot,
staking on failed transactions, comparing amount caps as floating-point numbers, and missing tokens received in a
trade.

### Still open, and how each would be fixed

- **A friendly challenger can pad a track record or take the bounty.** An operator's confederate can file challenges
  it expects to lose (the stake returns to the operator and "cleared" rises), or file first on the operator's own
  breach and take the 50% bounty back to the operator's side. Nothing on chain tells a friend from a stranger. What
  limits it today: standing never uses the cleared count, and a breach always costs at least the treasury's 50% of
  the slash. Planned fix: send the bounty to the treasury when the challenger has funded or been funded by the
  operator's address in the same window (checkable from the chain's own transfer history), and show cleared counts
  only for challenges whose challenger has also won against other agents.
- **A different operator address can launder a record.** Earlier registrations of a wallet count against it only when
  made by the same operator, because registering does not prove control of a wallet and a stranger could otherwise
  frame a bot it does not run (attack round 2). An operator who re-registers its own bot from a new address starts
  clean; the earlier records are still listed on the agent and in `/api/check` with `same_operator: false`. Planned
  fix: an optional proof of control (the agent wallet signs the registration); a proven registration then inherits
  every earlier record of that wallet, whoever filed it.
- **The novelty gate for appeals is lexical.** It compares word 3-grams (Jaccard at least 60% or containment at least
  80%) against the accusation, the ruling and its quote, so it stops resends, not rewordings. Planned fix: ask the
  validators, as a second consensus question, whether the counter-evidence states a fact that is not already on
  record, and refuse the appeal unless they agree it does.

### What Studio Dev imposes

- **Studio Dev does not deliver value transfers.** `claim()` zeroes the balance and posts an `emit_transfer`; studio-dev
  accepts it and never credits the recipient (measured, [PROBE §12](docs/PROBE.md)). The books are right and
  `get_ledger` reports the on-chain balance next to them; the gap equals the claimed total. GEN here is test money.
- **Four of the five explorers sit behind Cloudflare.** Validators read base, arbitrum, polygon and robinhood through
  `gl.nondet.web.render` (a real browser), which cleared the check when measured; a validator that is challenged
  waits (RETRY) rather than ruling. The patrol bot runs on Vercel, cannot run a browser, and therefore lists
  transactions on **Ethereum only**; other chains are covered by open challengers, and the patrol reports those agents
  as "skipped, not cleared".
- **It is a development network.** During this milestone its RPC returned Cloudflare 520s and HTML error pages for
  long stretches, and it rate-limits each IP (30 a minute, 500 an hour, 5000 a day); every script retries with bounded
  requests, and some seeded steps took several attempts.

### By design

- **Registering does not prove control of the wallet.** The seeded agents are live bots we do not operate, registered
  under mandates we wrote for their observable behaviour. The bond is the registrant's own money; the API and the
  badge say "bonded by", never "owned by".
- **A mandate binds only transactions mined after registration.** There is no backfill.
- **One challenge per (chain, transaction, agent) once anything is decided, INCONCLUSIVE included.** Only a VOID
  filing or a stall (no panel agreed within 24 h) releases the transaction; re-filing a decided one would let anyone
  re-roll a probabilistic judge until it said BREACH.
- **Precedents cover a transaction kind, not an amount.** A kind is counterparty, selector, tokens moved with their
  direction, and a coarse native-value bucket. The patrol never defers to a precedent on an amount rule, and anyone
  can still challenge.
- **The stored labels are the leader's.** A ruling stores the on-chain facts, which every validator must reproduce
  exactly, and separately the explorer labels as the leader read them; the app shows the second as unverified, and
  they never decide anything.
- **An appeal reads the same immutable facts.** If the facts read at appeal differ from the first ruling's (a lagging
  explorer replica), the appeal waits; after its 24 h deadline the first ruling stands.
- **A fresh panel can find a different clause.** An operator's appeal of a MINOR breach can come back as a MAJOR one;
  the fresh judgment is final. (This is also why an open challenge holds back the CRITICAL rate of the bond, not the
  rate of the clause it named.)
- **The linter only advises where validators disagree.** If they do not agree on which clauses to flag, nothing is
  written; after 24 h `close_lint` records INCONCLUSIVE and no clause is excluded from slashing.
- **Views carry no clock.** Deadlines are returned as unix times; the app and the API compare them with the wall clock.

## Repository

```
contracts/Sentinel.py           the v2 contract (canonical and demo are the same file)
contracts/SentinelConsumer.py   is_in_good_standing + a gate that refuses agents not in good standing
test/                           offline suites (stub GenVM, real Blockscout documents), deploy, seed and demo drivers
tools/                          scan_writes.py (no write before a revert), verify_source.mjs, final_check.mjs
frontend/                       Next.js app, /api/check, /badge, the patrol bot (/api/patrol)
docs/                           milestone, final check, attack rounds, probe measurements, seeds, demo video
docs/superseded/                the hackathon deployments and their source
```
