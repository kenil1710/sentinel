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

## Running it in between

The same bearer token works from any external scheduler (GitHub Actions,
cron-job.org, a local crontab) at whatever cadence you like.
