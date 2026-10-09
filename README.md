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
| **Sentinel** — canonical register, 1 h windows | <!--ADDR:Sentinel-->`0x1d4B73BD37785F113a599505D80Bc9BDA3D96a90`<!--/ADDR--> |
| **Sentinel** — demo, same code, 90 s windows | <!--ADDR:SentinelDemo-->`0x5b30a2E64aA5C4a6089C5Df616EAac0d2e035393`<!--/ADDR--> |
| **SentinelConsumer** — reads the canonical register | <!--ADDR:SentinelConsumer-->`0x02F421486a6de07c3D2cF624576ED7ecDFe711e5`<!--/ADDR--> |

RPC `https://studio-dev.genlayer.com/api`, explorer <https://explorer-studio-dev.genlayer.com/>. All three were
deployed from one commit, and `node tools/verify_source.mjs` reads each back with `gen_getContractCode` and compares
it byte for byte with `contracts/` at HEAD. The hackathon contracts are untouched and listed in
[docs/superseded/README.md](docs/superseded/README.md).

- Contracts: [`contracts/Sentinel.py`](contracts/Sentinel.py), [`contracts/SentinelConsumer.py`](contracts/SentinelConsumer.py)
- Milestone write-up, with links to every changed file: [docs/MILESTONE.md](docs/MILESTONE.md)
- The final check, item by item with proof: [docs/FINAL_CHECK.md](docs/FINAL_CHECK.md)
- Attack rounds: [docs/ATTACKS.md](docs/ATTACKS.md)
- What validators can actually reach (measured): [docs/PROBE.md](docs/PROBE.md)

---

## What changed from the hackathon version

| | v1 (hackathon) | v2 |
|---|---|---|
| Ruling | final at once | **provisional → contestable (1 h) → final**; one appeal by the losing party, with a bond and counter-evidence; a fresh panel; a novelty gate refuses a verbatim or near-verbatim resend |
| Mandate | free text, editable when nothing was pending | **numbered clauses, each with a severity**, stored as **versions with a hash and an effective time**; edits take effect after 1 h; a challenge is judged against the version in force at its transaction's block time, snapshotted at filing |
| Challengers | anyone, fixed stake | anyone except the operator; a loser's stake goes **to the operator**; one challenge per (chain, transaction, agent) once decided; the bounty goes to the challenger who proved the breach |
| Slashing | 20% of the bond, whatever the breach | **severity table frozen in the mandate version** (MINOR / MAJOR / CRITICAL as a share of the bond at filing) × a **capped repeat multiplier**; code computes it; the model only returns BREACH / COMPLIANT and a severity label quoted from the mandate |
| Bond | instant withdrawal | top-up; **timelocked withdrawal** and **unregister**, blocked while anything is open; **auto-pause** below the minimum; **pull payouts** only; a ledger invariant checked in tests and on chain |
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
`verdict | clause | digest of the immutable transaction facts | transaction kind` (the linter compares
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

<!--/SEED-->

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
   cd test && python3 -m unittest -q test_sentinel test_consumer test_attacks test_attacks_r2
   node --experimental-strip-types --no-warnings test/test_patrol.mjs     # from the repo root
   python3 tools/scan_writes.py                                         # no write before a revert
   node tools/verify_source.mjs                                         # chain == HEAD, byte for byte
   ```

## Known limitations

- **Studio Dev does not deliver value transfers.** `claim()` zeroes the balance and posts an `emit_transfer`; studio-dev
  accepts it and never credits the recipient (measured, [PROBE §12](docs/PROBE.md)). The books are right and
  `get_ledger` reports the on-chain balance next to them; the gap equals the claimed total. GEN here is test money.
- **Four of the five explorers sit behind Cloudflare.** Validators read base, arbitrum, polygon and robinhood
  through `gl.nondet.web.render` (a real browser), which cleared the check when measured; a validator that is
  challenged waits (RETRY) rather than ruling. The patrol bot runs on Vercel, cannot run a browser, and therefore lists
  transactions on **Ethereum only**; other chains are covered by open challengers, and the patrol reports those agents
  as "skipped, not cleared".
- **Registering does not prove control of the wallet.** The seeded agents are live bots we do not operate, registered
  under mandates we wrote for their observable behaviour. The bond is the registrant's own money; the API and the badge
  say "bonded by", never "owned by".
- **A mandate binds only transactions mined after registration.** There is no backfill, by design.
- **One challenge per (chain, transaction, agent), for good, once anything is decided.** Only a VOID filing or a stall
  (no panel agreed within 24 h) releases the transaction; re-filing a decided one would let anyone re-roll a
  probabilistic judge until it said BREACH.
- **A different operator address can launder a record.** Earlier registrations of a wallet count against it only when
  made by the same operator (otherwise a stranger could frame a wallet it does not run, attack round 2). They are always
  listed on the agent and in `/api/check`, with `same_operator`.
- **Withdrawal griefing.** An open challenge blocks withdrawals and unregistering, by design. A challenger who can make
  panels disagree can keep one open for 24 h at a time for a refundable stake; anyone can put it to the validators sooner.
- **Track records can be padded.** An operator's friend can file challenges it expects to lose; the stake returns to the
  operator and "cleared" rises. Standing does not use that count.
- **The stored labels are the leader's.** A ruling stores the on-chain facts, which every validator must reproduce
  exactly, and separately the explorer labels as the leader read them; the app shows the second as unverified.
- **An operator can front-run with a friendly challenger.** A confederate who files first on the operator's own breach
  gets the bounty (50% of the slash) back to the operator's side; the other 50% still goes to the treasury, so a
  breach always costs at least half its slash.
- **Precedents cover a transaction kind, not an amount.** A kind is counterparty, selector, tokens moved and a coarse
  native-value bucket. The patrol never defers to a precedent on an amount rule, and anyone can still challenge.
- **The appeal judges with the same explorer document.** If the immutable facts read at appeal differ from the first
  ruling's (a lagging explorer replica), the appeal waits; after its 24 h deadline the first ruling stands.
- **A fresh panel can find a different clause.** An operator's appeal of a MINOR breach can come back as a MAJOR one;
  the fresh judgment is final.
- **The novelty gate is lexical.** Word 3-gram overlap (Jaccard ≥ 60% or containment ≥ 80%) against the accusation, the
  ruling and its quote. A paraphrase passes it; it stops resends, not rewordings.
- **Two kinds of INCONCLUSIVE can split a panel.** When a breach lands on a linter-flagged clause, code records
  INCONCLUSIVE with that clause id; a model that answers INCONCLUSIVE directly carries none. Both refund the stake, but
  they differ on the consensus axis, so one validator of each kind makes the round UNDETERMINED (nothing written; anyone
  can resolve again). Observed once on v2.0.0 (challenge #6, settled on the second attempt). Liveness, not safety.
- **The linter is advisory where it disagrees.** If validators do not agree on which clauses to flag, nothing is written;
  after 24 h `close_lint` records INCONCLUSIVE and no clause is excluded from slashing.
- **Views carry no clock.** Deadlines are returned as unix times; the app and the API compare them with the wall clock.
- **Studio Dev is a development network.** During this milestone its RPC returned Cloudflare 520s and HTML error pages
  for long stretches; every script retries with bounded requests, and some seeded steps took several attempts.

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
