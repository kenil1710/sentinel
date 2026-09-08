# The patrol schedule

`vercel.json` schedules `/api/patrol` **every 10 minutes**:

```json
{ "crons": [{ "path": "/api/patrol", "schedule": "*/10 * * * *" }] }
```

This account is on Vercel's **Pro** plan. It was previously daily (`0 6 * * *`)
because Hobby permits one cron run per day and rejects any finer expression at
deploy time:

```
Error: Hobby accounts are limited to daily cron jobs.
This cron expression (*/10 * * * *) would run more than once per day.
```

Nothing about the bot depends on the cadence. It is stateless: every run reads
its queue from the contract, and `is_tx_challenged` makes a second run over the
same transactions a no-op. Running it more often finds breaches sooner and
changes nothing else.

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

**Blocked — Bradbury is refusing the bot's writes.** Every `resolve_challenge`
and `mark_patrolled` currently comes back as
`transaction gas rate limit exceeded: node is at capacity, retry in ~481ms`, and
then a revert at the consensus contract `0x0112Bf6e…271D`. This is not specific
to Vercel: the same key from a laptop gets the same refusal. The route retries on
the delay the node names and reports the failure rather than reporting a run it
did not finish, so `patrols_run` stays honest at 1 until the network accepts
writes again.

## Running it in between

The same bearer token works from any external scheduler (GitHub Actions,
cron-job.org, a local crontab) at whatever cadence you like.
