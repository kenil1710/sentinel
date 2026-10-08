# Attack rounds

Two rounds, each run against the code as deployed, each written as failing tests before any fix
(`test/test_attacks.py`, `test/test_attacks_r2.py`). Every High and Medium finding is fixed; what is left is in the
README's Known limitations.

## Round 1 — against v2.0.0 (deployed and seeded from commit `1830a34`)

Failing tests committed first in `69ede0b`; fixed in `43aeabb`; redeployed as v2.0.1 (`0x92979f66…b48D`, from `eae94e5`) and
reseeded. Five findings, no High.

| # | Severity | Finding | Attack | Fix |
|---|---|---|---|---|
| A1 | Medium | A stalled challenge retired its transaction for good | A friend of the operator files first on the agent's real breach with an accusation built to split the panel (or on a chain whose explorer is flaky), lets it stall, takes the stake back after 24 h, and the transaction can never be challenged again — immunity for the price of a refundable stake | `settle_stalled` releases the (chain, tx, agent) claim: nothing was judged, so nothing was decided |
| A2 | Medium | Unregistering and re-registering a wallet laundered its record | After a final CRITICAL breach the operator unregisters, waits the timelock and registers the same wallet again: standing, `/api/check` and the badge read the fresh, clean agent, and the repeat multiplier starts again at ×1 | Every registration of a (chain, wallet) is kept; earlier breaches count toward the multiplier, an earlier CRITICAL breach keeps the wallet out of good standing, and the agent view lists earlier registrations |
| A3 | Medium | A precedent's transaction kind ignored which way tokens moved | A friend files a weak challenge on a deposit the agent merely received (token X in) and loses on purpose; the precedent then covers the agent sending token X through the same contract and selector, so the patrol stops checking exactly what an "only send USDT" clause is for | The kind records each token with its direction relative to the agent (`out:`, `in:`, `via:`); the patrol's TypeScript port is checked against the contract on real documents for both directions |
| A4 | Medium | The stored transaction record was the leader's unchecked text | A dishonest leader that agrees on the verdict stores a fabricated record (other amounts, another token) beside a real ruling, and the app shows it as "the record the panel read" | The record is split: on-chain facts rendered from the immutable core, which every validator must reproduce byte for byte, and the leader's explorer labels, stored and shown separately as unverified |
| A5 | Low | A disputed COMPLIANT ruling whose appeal expired became a precedent | The challenger appeals, no panel settles the appeal in 24 h, and the patrol learns from a ruling that was disputed and never re-examined | `APPEAL_EXPIRED` creates no precedent |

Considered and not changed (documented in Known limitations):

- **Track-record farming.** An operator's friend can file a challenge it expects to lose; the stake comes back to the
  operator and the agent's "cleared" count rises. Standing does not depend on that count, and nothing on chain can
  tell a friend from a stranger.
- **Views scan whole lists.** `get_ledger` and a few listing views walk every record; on a register far larger than
  this one they would need pagination.

## Round 2 — against the round-1 fixes (v2.0.1)

Failing tests committed first in `a2881a6`; fixed in `b1421a3`; redeployed as **v2.0.2** from `bdca383` (the final
addresses) and seeded from scratch. One Medium finding, introduced by the A2 fix; the other round-1 fixes held.

| # | Severity | Finding | Attack | Fix |
|---|---|---|---|---|
| B1 | Medium | A stranger could frame a wallet | Registering does not prove control of a wallet. Anyone could register a bot they do not run under a mandate it is sure to break, have a friend prove a CRITICAL breach (losing half their own slash to the treasury), and unregister. Because A2 counted every earlier registration, the wallet's real operator would then be born out of good standing, with a repeat multiplier it never earned | Earlier registrations count toward standing and the multiplier only when made by the **same operator**; every earlier registration is still listed with its operator and a `same_operator` flag |

Checked and held: the stalled-claim release (A1) does not let a decided transaction be re-argued — only a stall or a
VOID frees it; the direction-aware kind (A3) matches between contract and patrol on real documents for the sender and
the recipient; the facts check (A4) is deterministic because facts are rendered only from the digest-checked core.

Left as limitations after round 2 (README → Known limitations):

- **A different operator address can still launder** a record by unregistering and registering the wallet again; the
  earlier registration is listed (`same_operator: false`) but does not count. Telling an operator's second address from
  a stranger is not possible on chain.
- **Withdrawal griefing.** Anyone willing to lock a stake can keep a challenge open against an agent, and an open
  challenge blocks its withdrawals, as the design requires. A challenge whose panel never agrees stalls after 24 h and
  its transaction is released, so a challenger who can split panels can block withdrawals again, a day at a time, for a
  refundable stake. Any wallet, the operator included, can put the challenge to the validators earlier.
