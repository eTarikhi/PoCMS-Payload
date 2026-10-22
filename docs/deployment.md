# Deployment

## Docker setup

The repository includes a `docker-compose.yml` file for local development and service orchestration.

### Start local services

```bash
cp .env.example .env   # set PAYLOAD_SECRET
docker compose up
```

The `payload` service runs `pnpm dev`. The adapter has development push disabled, so apply the
schema first, then load the portfolio content:

```bash
docker compose exec payload pnpm migrate
docker compose exec payload pnpm seed
```

After that, open the admin UI at:

```text
http://localhost:3000/admin
```

### Docker notes

The docker environment is intended to provide:

- PostgreSQL connectivity
- application service startup
- hot-reload friendly development
- isolated local environment

## Vercel deployment

1. Push the project to GitHub.
2. Import the repo in Vercel.
3. Add environment variables in the Vercel dashboard:
   - `POSTGRES_URL`
   - `BLOB_READ_WRITE_TOKEN`
   - `PAYLOAD_SECRET`
   - `NEXT_PUBLIC_SITE_URL`
   - `RESEND_API_KEY`
   - Optional, for the admin dashboard widgets: `GOOGLE_API_KEY` (Page speed), `VERCEL_TOKEN` and
     `VERCEL_PROJECT_ID` (Site traffic, Deployments), `GITHUB_TOKEN` (CI status of a private
     repository). See `.env.example` for how to create each one.
   - Optional, for Admin › Database: `NEON_API_KEY` (branch backups and point-in-time restore;
     without it the page links the Neon console), `NEON_PROJECT_ID`/`NEON_BRANCH_ID` when the key
     sees several projects, and `DATABASE_DIRECT_URL` (the Neon endpoint without `-pooler`) so
     backups and `VACUUM`/`REINDEX` do not run through PgBouncer.
4. Deploy the application.

## Database backups

Admin › **Database** (`manageDatabase` capability) downloads a logical `.sql` backup of the
database, the table being browsed, or the schema alone, and restores one. On Neon the same page can
create a branch (a copy-on-write backup), restore the branch to a timestamp while keeping the
current state under a name, and delete a backup branch — those need `NEON_API_KEY`, because a
branch and its history are project storage rather than tables.

- A backup restores into an **empty** database with `pnpm db:restore <file> --yes` or
  `psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f <file>`. It carries `payload_migrations`, so the
  restored database does not need `pnpm migrate` again.
- Prefer `DATABASE_DIRECT_URL` on Neon for a backup or a `VACUUM`: the pooled endpoint may cut a
  long statement.
- A backup is a logical copy. For a byte-exact, point-in-time copy use a Neon branch; the retention
  window is the project's (a day on the free plan), so a branch is also the way to keep a copy
  longer than that.

## Database migrations

The schema is committed as migrations in `src/migrations`, generated from `payload.config.ts`. A
database never changes through a deploy: migrations are applied deliberately, so a failed deploy
cannot leave the schema half-applied.

| Situation | Command |
| --- | --- |
| Fresh, empty database | `pnpm migrate` (applies the baseline and everything after it) |
| Database created by development schema push (this project's Neon database, a restored copy) | `pnpm migrate:adopt` once, then `pnpm migrate` after each deploy that adds a migration |
| Checking what is applied | `pnpm migrate:status` (also in the admin: Developer tools → Migration status) |
| After changing collections, globals or fields | `pnpm dev` in development, then `pnpm migrate:create <name>` and commit `src/migrations` |

`pnpm migrate:adopt` records the `*_baseline` migration as applied without running it, because the
tables already exist. It is safe to run twice: the second run only reports the state. `--dry-run`
prints the plan, `--name <migration>` targets a different migration.

### Deployment step (Vercel)

Vercel builds must not touch the production schema: preview builds often lack `POSTGRES_URL`, and a
build-time migration would run once per preview. Instead:

1. Add the production connection string as the repository secret `POSTGRES_URL` and enable the
   `production-db` environment for approval (Settings → Environments).
2. After a deploy that includes new files in `src/migrations`, run **Actions → Migrate database →
   Run workflow**. The job prints `migrate:status`, runs `payload migrate` and prints the status
   again; `status_only` only inspects the database.
3. Redeploy if the new code requires the new schema before it can serve traffic (additive changes
   usually do not: old code ignores new columns).

Locally, `pnpm migrate` uses `POSTGRES_URL` from `.env`; never commit that file.

## Scheduled jobs

`vercel.json` declares one cron job: `GET /api/jobs/cron` at 03:15 UTC every day. It empties the
trash, stores the Page speed report and, on Mondays, checks the site's links (see
[the admin guide](ui-modernization/admin-ui-guide.md#scheduled-jobs)).

1. Add `CRON_SECRET` to Vercel (any long random string, e.g. `openssl rand -hex 32`). Vercel sends
   it as `Authorization: Bearer $CRON_SECRET` with every cron call; without it the endpoint answers
   503 and nothing runs on a schedule.
2. Optional: `TRASH_RETENTION_DAYS` (default 30) and `GOOGLE_API_KEY` for the Page speed report.
3. Run a task by hand from **Admin → Scheduled jobs → Run now**, or with curl:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-site.vercel.app/api/jobs/cron
```

On the Hobby plan a cron job runs once a day, which is why one endpoint schedules the weekly task
itself. A run is bounded by the function's time limit (60 s, set in `vercel.json`); the link check
and the Lighthouse runs are sized to finish inside it. The `job-runs` collection keeps the outcome
of every run, failure included.

## Production environment checklist

Before deployment, verify the following:

- a secure `PAYLOAD_SECRET` is defined
- the database connection string is valid
- the blob token has read/write access
- `NEXT_PUBLIC_SITE_URL` points to the production domain
- `CRON_SECRET` is set, so scheduled jobs can run
- the migrations in `src/migrations` are applied (Actions → Migrate database)
- `NODE_ENV` is set appropriately

## Security notes

- Keep `.env` and `.env*.local` out of source control (only `.env.example` is committed)
- Use HTTPS in production
- Rely on provider-managed database security and backups
- Use Payload's built-in auth and access control features
- Configure rate limiting and additional validation as needed
