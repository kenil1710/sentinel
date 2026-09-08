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
