# Who watches the AI agents? Building appeals, frozen mandates and graduated slashing on GenLayer

*Sentinel v2: what changed after the hackathon, and what the chain says now.*

---

In September I built Sentinel for GenLayer's Agent Tank hackathon. The idea was simple: an operator registers an AI
agent's wallet, writes down in plain English what the agent may do, and posts a bond. A patrol bot watches public chains
for transactions that contradict the mandate and files challenges. GenLayer validators fetch the transaction, read it
against the mandate and agree on a verdict. A breach slashes the bond.

It won the Onchain Justice track. It also had problems I knew about, because I had written them down in the README: a
verdict was final the moment it landed, an operator could edit the mandate and pull the whole bond out between
accusations, every breach cost the same 20% of the bond, and the bot "learned" by parsing its own past accusations.

Version 2 fixes those, and this post is about how.

## A ruling you can appeal

The biggest change is that a ruling is no longer final the moment the validators agree. A BREACH or COMPLIANT ruling
becomes **provisional** for an hour (90 seconds on the demo deployment). The party it went against can appeal once: the
operator against a breach, the challenger against a clearance. They post a bond and new counter-evidence, and a fresh
panel judges the same transaction again.

Two details took more thought than the feature itself.

First, **what counts as new evidence**. If an appeal could just resend the accusation, an appeal is a free re-roll of
a probabilistic judge. So there is a novelty gate: the counter-evidence is compared, as word 3-grams, with the
accusation, the ruling and its quote, and a near-verbatim resend is refused. It is lexical, which I say in the README:
it stops resends, not rewordings.

Second, **what the fresh panel reads**. The explorer's labels for a transaction (token names, contract tags,
"verified") can change at any time. A final verdict should not rest on something that moved after the first ruling. So
validators compare a digest of only the facts a chain cannot change: sender, recipient, value, function selector, token
transfers by contract address, block and time. An appeal must read the same digest, or it waits.

On the canonical register, two appeals have been filed so far, one each way. On challenge #2 the operator appealed a
MAJOR breach (the payout bot had sent a token that is neither USDT nor USDC), arguing they were customer withdrawals;
the fresh panel rejected the appeal and the appeal bond went to the challenger. On challenge #10 the first panel had
cleared a USDT payout; the challenger appealed that a clause naming tokens only by ticker symbol cannot say which
contract is meant, and the fresh panel ruled INCONCLUSIVE. That appeal was upheld, so the stake and the appeal bond
went back.

## Mandates that cannot reach back

A mandate is now a list of numbered clauses, each with a severity:

```
C1 [MAJOR]    Only send the stablecoins USDT 0xdac17f… and USDC 0xa0b869….
C2 [MINOR]    Never send more than 0.5 ETH of native value in one transaction.
C3 [CRITICAL] Never call the batch executor contract 0xee7ae8….
```

Every version is stored with its hash and the time it takes effect. An edit waits an hour. A challenge names the
transaction's block time, and the contract judges it against the version that was in force when the transaction was
mined, snapshotted at filing together with the severity table, the bond and every window.

I tested this on a live Base bot that moves small USDC amounts. Its operator added a 10 USDC limit. A transfer made
while the edit was still queued was challenged twice: once under the new clause, which the contract refused outright
because version 1 has no such clause, and once under version 1, where the validators ruled it compliant.

## Slashing that fits the breach

The operator now sets what each severity costs, as a share of the bond, and that table is frozen in the mandate
version. Repeat breaches raise a capped multiplier. The model returns only BREACH, COMPLIANT or INCONCLUSIVE, the clause,
the severity label written next to that clause, and a quote from it. Code checks the label and the quote, and computes
the money.

The real slashes on the canonical register, all computed by the contract:

- Challenge #0: CRITICAL breach on a 2 GEN bond at 50%: **1 GEN**.
- Challenge #2: MAJOR breach on the same 2 GEN bond at filing, 20%: **0.4 GEN**.
- Challenge #7: another CRITICAL breach, capped at what was left of the bond: **0.6 GEN**. After that the bond was 0,
  the agent was paused, and the twelve other final breaches against it slashed nothing.
- Challenge #25: MAJOR breach on a 1 GEN bond, 20%: **0.2 GEN**.
- Challenge #61: MINOR breach on a 1 GEN bond, 5%: **0.05 GEN**.
- Challenges #108 and #112: MINOR breaches on the same agent, each filed after one earlier final breach, so ×1.5 on the
  0.95 GEN bond at filing: **0.07125 GEN** each.
- Challenges #113, #114 and #116: MINOR breaches filed after two earlier final breaches, so ×2 on the 0.87875 GEN bond
  at filing: **0.087875 GEN** each. The patrol bot filed these on its own while I was writing this.

That adds up to 2.656125 GEN slashed, half of it paid to the challengers who proved the breaches. The second agent's
bond is now 0.543875 GEN: one more breach would take it below the 0.5 GEN minimum and pause it.

## A linter for mandates

Some clauses cannot be judged from a transaction at all. "Never pay a customer the exchange would consider high-risk"
is a good intention and an unjudgeable rule. Before a mandate is used, validators list the clauses that cannot be
decided from on-chain data, each with a quote, and must agree clause for clause. A breach can never be slashed on a
flagged clause.

The linter was stricter than I expected, in a way I agree with. It flagged "Never send funds to a contract", because
whether a recipient is a contract is not in the transaction itself. It also flagged "Only send stablecoins", because
which tokens count as stablecoins is a classification made off chain.

## Anyone can challenge, and the bot learns from final rulings only

Anyone except the operator can challenge, with a stake. A challenger who proves a breach gets the stake back plus half
the slash; one who is wrong pays the stake to the operator. The same transaction cannot be argued twice once anything
is decided.

The patrol bot is still there, and it now learns from **precedents**: a ruling becomes one only if it was COMPLIANT from
the start and then became final. A provisional ruling never teaches it. A clearance an operator won on appeal never does
either, and one proven breach ends a precedent for good. The bot only trusts token addresses, never symbols, so a
clause like "Only move USDT and USDC" makes it accuse every token it sees. The validators then decide which of those
were fine.

## What the attack rounds found

I ran two attack rounds against my own deployed code, writing failing tests first. The first found five problems,
four of them Medium:

- A stalled challenge retired its transaction for good, so a friendly challenger could buy permanent immunity for a
  refundable stake.
- Unregistering and registering the same wallet again laundered its record.
- A precedent's "kind of transaction" ignored which way tokens moved, so a deposit the agent received could cover a
  payment it sent.
- The stored transaction record was the leader's unchecked text.

The second round found that my fix for laundering had created a new problem. Registering does not prove you run a
wallet, so a stranger could register someone else's bot under a mandate it was sure to break, get it slashed, and
leave the real operator a wallet that was already out of good standing. Now only the same operator's earlier record
counts. A different address can still launder, and I say so.

## What the chain says now

Read from the canonical contract on 9 October 2026:

- 10 agents on 5 chains; 1 paused after its bond reached 0, 1 unregistered.
- 120 challenges: 22 final BREACH, 20 final COMPLIANT, 75 final INCONCLUSIVE, 3 still being judged.
- 2 appeals: 1 upheld, 1 rejected.
- 7 precedents, all active.
- 2.656125 GEN slashed and 1.3280625 GEN paid in bounties.
- Each of the 22 final breaches was re-checked by hand against the chain's own RPC: 22 of 22 hold.

Most of those challenges were filed by the patrol bot on its own. Many of its INCONCLUSIVE results came from one bug in
the bot: it kept accusing a clause the linter had flagged, where a breach can never be slashed. The contract handled
that correctly, refunding each stake, and the bot now skips flagged clauses.

Every agent in the register is a live bot I do not operate, on Ethereum, Base, Arbitrum, Polygon or Robinhood Chain,
registered under a mandate I wrote for what it actually does. Every challenge names a real transaction mined after the
agent registered, and every verdict was decided by the validators.

## Honest limits

- Studio Dev, the GenLayer network this runs on, accepts value transfers and does not deliver them. Payouts are pull
  balances, and the contract reports the gap between its books and its balance.
- Four of the five block explorers now sit behind Cloudflare. Validators get through with a real browser, but the
  patrol bot runs on Vercel and cannot, so it lists transactions on Ethereum only. Open challengers cover the other
  chains.
- When validators disagree, nothing is written and the challenge waits. I saw that happen on chain once, and it is
  documented exactly as it behaves.

The code, the attack write-ups and a reviewer's checklist are on GitHub at github.com/kenil1710/sentinel, and the app is
at sentinel-tau-ashen.vercel.app.
