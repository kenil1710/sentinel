# The patrol schedule

**Two schedulers, and only one of them is Vercel.** This opening said the
opposite for a while and was corrected a hundred lines further down by "The
cadence does not come from Vercel", which is the section that is right.

`vercel.json` schedules `/api/patrol` **daily** — the most a Hobby plan permits,
and a finer expression is refused at deploy time rather than at runtime, so it
blocks shipping anything at all:

```json
{ "crons": [{ "path": "/api/patrol", "schedule": "0 12 * * *" }] }
```

```
Error: Hobby accounts are limited to daily cron jobs.
This cron expression (*/10 * * * *) would run more than once per day.
```

The **ten-minute cadence comes from an external scheduler** (cron-job.org)
calling the production alias with `PATROL_SECRET` as a bearer token. The daily
Vercel cron is the backstop behind it. See "The cadence does not come from
Vercel" below for why the alias and not the deployment URL.

Nothing about the bot depends on the cadence. It is stateless: every run reads
its queue from the contract, and `is_tx_challenged` makes a second run over the
same transactions a no-op — for the same agent, and only while that challenge
decided something, since an INCONCLUSIVE or stalled one releases its claim.
Running it more often finds breaches sooner and changes nothing else.

A run is bounded by `MAX_AGENTS` (12), `MAX_TX_PER_AGENT` (20) and
`MAX_CHALLENGES_PER_RUN` (3), and the route's `maxDuration` is 300s — so
consecutive ten-minute slots cannot overlap.

## Deployment Protection silently swallows the cron

A cron that is registered, enabled and correctly scheduled can still never run.
Vercel fires it at the **deployment URL**, not at the production alias:

```json
{ "host": "sentinel-<hash>-<scope>.vercel.app", "path": "/api/patrol",
  "schedule": "*/10 * * * *" }
```

With `ssoProtection.deploymentType = "all_except_custom_domains"` that host
answers **302 to `vercel.com/sso-api`** while the alias answers 200 — so every
firing landed on a login redirect and the contract recorded `patrols_run: 0`
for forty minutes with nothing in the logs to explain it.

```
sentinel-tau-ashen.vercel.app/api/patrol      200   (alias, public)
sentinel-<hash>-<scope>.vercel.app/api/patrol 302   (what cron actually calls)
```

The project is now `ssoProtection.deploymentType = "preview"`: preview
deployments stay behind SSO, production deployment URLs do not. That exposes
nothing new — the alias already served the whole site publicly, and
`/api/patrol` forces a dry run for anyone without the secret.

**That fix was necessary but not sufficient.** With the host answering 200, the
11:50, 12:00 and 12:10 slots still delivered nothing: `patrols_run` and
`challenges_filed` did not move off their baseline. Everything Vercel exposes
about the job is correct — team plan `pro`, `enabledAt` set with
`disabledAt: null`, the definition carrying `*/10 * * * *`, and the binding
pointing at the current READY production deployment — so the cron is not
arriving for a reason the API does not show. Treat Vercel Cron here as
UNPROVEN until a slot is observed to move the contract.

The route is not the problem, and that was measured rather than assumed. A real
run driven through the alias with the bearer token patrolled all ten agents,
scanned 104 transactions and filed one challenge in 209s — inside the 300s
`maxDuration`:

```bash
curl -H "Authorization: Bearer $PATROL_SECRET" https://<host>/api/patrol
# dry_run: false | patrolled: 10 | scanned: 104 | challenges_filed: 1 | 209.4s
```

So the reliable cadence today is an external scheduler hitting the **alias**
with the bearer token, which is the "Running it in between" path below. It does
not depend on Vercel Cron delivering at all.

To check the binding rather than trusting it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://$(vercel inspect <deployment-url> 2>&1 | grep -o '[a-z0-9-]*\.vercel\.app')/api/patrol?dry=1"
```

A 302 there means the cron is firing into a login page.

## Is the cron actually delivering?

**Yes, confirmed on 2026-09-10.** With nothing triggering the route from
outside, the on-chain counters moved on their own between 13:33:52Z and
13:34:54Z:

```
patrols_run          8  ->  9
challenges_filed    10  -> 13
challenges_settled  10  -> 11
```

Earlier notes in this repository said Vercel had never been seen to deliver a
slot. That was true when it was written, and the reason was not the scheduler:
the route was being woken on time and then refusing every write for want of a
studio-dev fee deposit, so a firing cron and a dead cron looked identical from
the outside. Once the writes were funded the slots started landing visibly.

The lesson worth keeping: *a scheduler firing into a route that cannot write is
indistinguishable from a scheduler that never fires.* Check the counter the work
moves, not the fact that a request arrived.

### The cadence does not come from Vercel

`vercel.json` schedules `/api/patrol` at `0 12 * * *` — **daily**, which is the
most a Hobby plan permits. A deploy carrying `*/10 * * * *` is refused outright:

```
Hobby accounts are limited to daily cron jobs. This cron expression
(*/10 * * * *) would run more than once per day. Upgrade to the Pro plan.
```

That is a deploy-time rejection, not a runtime one, so it blocks shipping
anything at all until the schedule is relaxed. The ten-minute cadence therefore
comes from an **external scheduler** calling the alias with `PATROL_SECRET`, and
the daily Vercel cron is a backstop behind it. Restore `*/10 * * * *` if the
account moves to Pro.

## What the bot's wallet has to hold

`PATROL_PRIVATE_KEY` is a real wallet and the patrol spends from it twice over:

- **the challenge stake** — `get_config().challenge_stake`, 0.05 GEN each, up to
  `MAX_CHALLENGES_PER_RUN` (3) per run;
- **a fee deposit on every write** — on any network whose fee policy is enabled.

Studio Dev's is. `getCurrentFeePolicy()` reports `enabled: true` and the chain
exposes no `feeManagerContract`, so the SDK derives the deposit from the local
round-fee calculation. Bradbury, which this route was first written against,
charges nothing — which is why the earlier version passed no `fees` at all and
every write here was refused as a zero-fee transaction. Measured on Studio Dev:

```
register_agent    0.00061 GEN     mark_patrolled       0.00061 GEN
challenge_agent   0.00077 GEN     resolve_challenge    0.00077 GEN
```

The deposit is estimated per call with `estimateTransactionFeesForWrite` against
the real calldata, because it depends on the method and its arguments — a
`mark_patrolled` carrying twelve agent ids does not cost what one carrying two
does.

**Funding it.** On a Studio network use the faucet RPC method directly:

```bash
curl -s https://studio-dev.genlayer.com/api \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"sim_fundAccount","params":["<bot address>",50000000000000000000]}'
```

Elsewhere there is no faucet: send the wallet GEN from a funded account by hand.
Either way the address is derived from `PATROL_PRIVATE_KEY`, and the run reports
it as `Filing as 0x…` in `notes`.

An empty wallet does not announce itself — the writes are refused one at a time
and the report reads like a patrol that found nothing wrong, which is the worst
shape a watchdog failure can take. So the route reads the balance ONCE at
startup and says plainly in `notes` when it is empty or below one stake. Check
that line before believing a quiet run.

## Who may spend the stake

`/api/patrol` files for real only for a **trusted** caller. Everyone else gets a
dry run whatever they ask for, because the "Run patrol" button on `/patrol` is
public and a public URL must never be able to spend real GEN.

- **Vercel Cron** — trusted automatically via the `x-vercel-cron` header, which
  the platform strips from inbound public requests.
- **A bearer token** — `Authorization: Bearer $PATROL_SECRET`:

  ```bash
  curl -H "Authorization: Bearer $PATROL_SECRET" https://<host>/api/patrol
  ```

  A trusted caller files for real unless it asks for `?dry=1`.
- **Anyone else** — forced to `dry_run: true`, with a note saying so in the
  report.

`PATROL_SECRET` is set in Vercel's environment for production, preview and
development. If it is unset, the bearer path is refused outright rather than
falling open.


## Where it stands, measured

`cron-job.org` calls `/api/patrol` every 10 minutes with the bearer token and
the route accepts it — production logs show
`[patrol] START trusted=true (bearer token) dry_run=false` on each firing.

Two bugs were found and fixed getting there, and one blocker remains.

**Fixed — the token comparison was exact.** `authorised()` compared the header to
`` `Bearer ${secret}` `` with `===`. Anything else — a lowercase scheme, stray
whitespace — fell through to `trusted = false`, which forces `dryRun = true`,
and the `!dryRun` guard means **`mark_patrolled` is never called**. The route
still answered **200 with a full report**, so the scheduler recorded successful
executions for runs that did nothing. The scheme is now matched
case-insensitively, the token trimmed, a bare token accepted, and a refusal says
why (lengths only, never the token).

**Fixed — `after()` does not run here.** Moving the work into `after()` returned
a 202 in a second and the callback never executed: `[patrol] START`, then
silence, and nothing on chain. Fluid Compute is off on this project, which is
also why `maxDuration = 800` was ignored and runs were still cut at 300.02s. The
work is inline again. A caller that gives up early does not stop it — a run cut
off at the client at 255s had still filed two challenges server-side.

**Historical note — a node once refused the bot's writes.** Every
`resolve_challenge` and `mark_patrolled` came back as
`transaction gas rate limit exceeded: node is at capacity, retry in ~481ms`, and
then a revert at the consensus contract. This was not specific to Vercel: the
same key from a laptop got the same refusal. The route retries on the delay the
node names and reports the failure rather than reporting a run it did not
finish, so `patrols_run` stays honest rather than counting a run that wrote
nothing.

## Running it in between

The same bearer token works from any external scheduler (GitHub Actions,
cron-job.org, a local crontab) at whatever cadence you like.
