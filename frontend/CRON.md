# The patrol schedule

`vercel.json` schedules `/api/patrol` **daily**, not every ten minutes.

That is a plan limit, not a design choice. This account is on Vercel's Hobby
plan, which permits one cron run per day and **rejects any finer expression at
deploy time**:

```
Error: Hobby accounts are limited to daily cron jobs.
This cron expression (*/10 * * * *) would run more than once per day.
```

On Pro the intended cadence is a one-line change:

```json
{ "crons": [{ "path": "/api/patrol", "schedule": "*/10 * * * *" }] }
```

Nothing about the bot depends on the cadence. It is stateless: every run reads
its queue from the contract, and `is_tx_challenged` makes a second run over the
same transactions a no-op. Running it more often finds breaches sooner and
changes nothing else.

## Running it in between

- **From the UI** — the "Run patrol" button on `/patrol`. Always a **dry run**:
  the route forces one for any caller without the secret, because a public URL
  must never be able to spend the bot's stake.
- **For real** — send the shared secret:

  ```bash
  curl -H "Authorization: Bearer $PATROL_SECRET" https://<host>/api/patrol
  ```

  A trusted caller files for real unless it asks for `?dry=1`. Vercel Cron is
  trusted automatically via the `x-vercel-cron` header, which the platform
  strips from inbound public requests.
- **From any external scheduler** (GitHub Actions, cron-job.org, a local
  crontab) using the same bearer token, at whatever cadence you like.
