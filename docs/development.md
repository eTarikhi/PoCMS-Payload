# Development and troubleshooting

## Common development workflow

1. Create a feature branch.

```bash
git checkout -b feature/your-feature
```

2. Prepare the database and start the app locally.

```bash
pnpm migrate             # applies src/migrations to your local database
pnpm seed                # optional: the portfolio content the site expects
pnpm dev
```

   The adapter runs with `push: false` (`src/payload.config.ts`), so **the migrations are the only
   thing that changes the schema** — development push is off. Pulling a branch that adds a
   migration means running `pnpm migrate` before the app can use the new columns; a fresh database
   needs `pnpm migrate` before `pnpm seed` or `pnpm dev`.

   `pnpm dev` runs `pnpm preflight` first (`scripts/preflight.ts`): it reads the core tables and the
   migration history and stops before Next starts if the database has no schema, printing the
   command to run. Run it on its own — for example in CI, or when a preview build looks empty — to
   get the same answer:

```bash
pnpm preflight           # ✔ Database ready (10 migrations applied).
```

3. Make changes and test locally.

4. Add a migration when the schema changes.

```bash
pnpm migrate:create add_pages   # writes src/migrations/<timestamp>_add_pages.ts
pnpm migrate                    # apply it locally
```

   Commit `src/migrations` with the change: the migration is how the schema reaches production.
   See [Deployment → Database migrations](deployment.md#database-migrations) for the deploy step.
   `pnpm migrate:status` lists applied and pending migrations.

   Media sizes are derived data, not schema: after adding a size in `src/collections/Media.ts` run
   `pnpm media:regenerate` so files uploaded earlier get the new size too (see
   `docs/ui-modernization/admin-ui-guide.md` → Media).

5. Commit and push.

```bash
git add .
git commit -m "Add your feature"
git push origin feature/your-feature
```

6. Open a pull request and deploy after merge.

## Troubleshooting

### Database connection issues

```bash
# Check POSTGRES_URL format
# Should look like:
# postgres://user:password@host:port/dbname

psql $POSTGRES_URL -c "SELECT 1"
```

### `Failed query: select "users" …` on every page

The database has no schema to query. Schema changes are applied by migrations only (`push: false`),
so a fresh database — a new one, a reset container, a restored backup, or a database behind the
current `src/migrations` — answers the first request with Drizzle's raw SQL and the real cause
(`error: relation "users" does not exist`) only in the server log. Payload's `onInit` now checks the
database before serving and stops with a message that says which case it is
(`src/lib/database-readiness.ts`):

```text
This database has no schema (missing tables: users, articles).
  It has never been migrated, so every query fails with a “relation does not exist” error.
  Schema changes are only applied by migrations (push is off).
  pnpm migrate        apply them
  pnpm seed           demo content, on an empty database
```

- **No schema** → `pnpm migrate` (then `pnpm seed` for demo content). CI does the same, in that
  order, before it builds.
- **Tables but no history** (a database from the old development push) → `pnpm migrate:adopt` once,
  then `pnpm migrate`.
- **Migrations pending** → `pnpm migrate`; the log lists them by name. This one is a warning rather
  than an error, so a stale column does not take the site down.
- **The database could not be reached** → the message says which failure it was, because the
  common ones need different fixes:

  | Error | What it means | What to do |
  | --- | --- | --- |
  | `ECONNREFUSED` | Nothing is listening on that host and port. | Start the database; check the URL and port. |
  | `ECONNRESET`, `Connection terminated unexpectedly` | Something accepted the connection and closed it: a stopped container (Docker's port mapping answers, then resets), a server still starting, a proxy, or a host that wants TLS. | `docker compose ps` and `docker compose logs db`; retry in a few seconds; add `?sslmode=require` for a hosted database. |
  | `ENOTFOUND` / `EAI_AGAIN` | The host name does not resolve. | Fix the host name, or the DNS/VPN the terminal uses. |
  | `28P01` | The server was reached and refused the credentials. | Correct the user/password, or the host rule in `pg_hba.conf`. |
  | `3D000` | The server was reached but the database does not exist. | Create it, or point the URL at the right one. |

  `pnpm preflight` retries a transient failure four times (400 ms, 800 ms, 1.6 s) before it gives
  up — a database that is still starting usually succeeds on the second attempt. If it is still
  unreachable, `pnpm dev` stops instead of starting a server that can only render errors; run
  `pnpm exec next dev` to start it anyway.

The same rules are unit-tested in `tests/int/database-readiness.int.spec.ts`, and the live check runs
on every Payload start, so the message cannot drift from the migrations.

### Build failures

```bash
rm -rf .payload
rm -rf dist

pnpm generate:all
pnpm build
```

### Missing environment variables

```bash
echo $POSTGRES_URL
echo $BLOB_READ_WRITE_TOKEN
echo $PAYLOAD_SECRET
echo $NEXT_PUBLIC_SITE_URL
```

### Vercel Blob issues

- confirm the token is valid
- check that the token has write permissions
- ensure the variable matches the correct project

## Recommended practices

- keep environment variables local and secret
- use migrations for schema changes
- validate custom collection and field changes before deployment
- review the Payload docs when adding advanced collection logic
