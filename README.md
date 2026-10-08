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
| **Sentinel** — canonical register, 1 h windows | <!--ADDR:Sentinel-->`0x41Ad5F63d1FeE9b63D2B6f8cD6C92dF08a64c0a2`<!--/ADDR--> |
| **Sentinel** — demo, same code, 90 s windows | <!--ADDR:SentinelDemo-->`0x0396d725d4a8D4F4E2BAC4Df1bc0BB80cbbC8e29`<!--/ADDR--> |
| **SentinelConsumer** — reads the canonical register | <!--ADDR:SentinelConsumer-->`0x02B793C1603fAa78997De8Cf2C6F370f205bDF83`<!--/ADDR--> |

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
| Challengers | anyone, fixed stake | anyone except the operator; a loser's stake goes **to the operator**; one challenge per (chain, transaction, agent); the bounty goes to the challenger who proved the breach |
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
_Filled from chain data when the canonical seed completes._
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
- **One challenge per (chain, transaction, agent), for good**, except a VOID filing. A stalled challenge (no panel agreed
  within 24 h) retires its transaction. Re-filing would let anyone re-roll a probabilistic judge until it said BREACH.
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
