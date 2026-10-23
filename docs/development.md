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

   **`index.ts` is generated from the folder.** `migrate:create` rewrites it from every `.ts` file
   in `src/migrations`, so a migration file that is present but unregistered will join the registry
   on the next generate. That matters when it duplicates another one: `20261022_000244` recreated
   what `20261021_163000_media_folders` already adds, and registering both would fail halfway
   through a fresh database. Migrations that are not part of the history live in
   `src/migrations/archive/` (with a README saying why); their `.json` snapshots stay in place
   because `migrate:create` diffs against the newest one. `tests/int/migrations.int.spec.ts` asserts
   that the registry and the top-level files are the same list, so this cannot drift again.

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
- **Part of a schema** (`missing tables` *and* objects already in `public`) → a migration stopped
  partway. The adapter runs each migration in a transaction, but a connection dropped in the middle
  — a serverless database suspending, a stopped container, a closed laptop — can leave the earlier
  `CREATE TYPE`s behind, and every later attempt then dies on
  `type "enum_articles_category" already exists`. On a database with nothing to keep, start over:

  ```bash
  pnpm db:status          # what exists: tables, enum types, applied migrations
  pnpm db:reset --yes     # drops the public schema, then runs `pnpm migrate`
  ```

  `db:reset` prints what it is about to drop and refuses to delete rows unless given `--force`.
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

  `pnpm db:status` answers the same questions from outside the app, so it also works on a database
  Payload refuses to start on.

  `pnpm preflight` retries a transient failure four times (400 ms, 800 ms, 1.6 s) before it gives
  up — a database that is still starting usually succeeds on the second attempt. Run it before
  `pnpm dev` (or in a script) when you want that check: `pnpm dev` itself starts Next directly, so
  a missing database surfaces in the browser.

The same rules are unit-tested in `tests/int/database-readiness.int.spec.ts`, and the live check runs
on every Payload start, so the message cannot drift from the migrations.

### The admin asks me to sign in (or refuses me) and I have no account

A brand-new database shows **Create first user** on `/admin`; the account it creates is an
Administrator (`assignRolesOnCreate`), which is what opens the panel. The two ways to get stuck are
a database where something already counts as a user, and an account without a role. Both are
visible and fixable from the terminal, without the browser:

```bash
pnpm admin:status                       # who exists, with which roles; flags what cannot sign in
pnpm admin:create --email you@example.com   # creates it, or resets the password and adds a role
```

- **`Sign in` instead of `Create first user`** → a user row already exists. It can be an earlier
  attempt, a restored dump, a colleague's account, or a fixture left by an interrupted
  `pnpm test:int` (the suite runs against the database in `.env` and marks its accounts with
  `@example.test`; `admin:status` labels those). Payload only shows the create form when the
  `users` table is completely empty. `pnpm admin:status` lists the address and the database it is
  looking at; `pnpm admin:create --email <that address>` sets a password you know (or create a new
  account with a different address).
- **Signed in, then sent back to `/admin/unauthorized`** → the account has no role, and
  `access.admin` (`hasAnyRole`) refuses it. Same command adds the built-in Administrator role.
- **`No accounts yet`** → `pnpm admin:create --email …`; the password can come from
  `ADMIN_PASSWORD`, so it stays out of the shell history.
- **The database has no tables at all** (a new Neon/Vercel database) → `pnpm migrate` first, or add
  `--migrate` to `admin:create`, which runs the migrations and then creates the account. Without it
  the command reports the same "no schema" message shown above.

`admin:status` exits non-zero when nobody can open the admin, so it is usable as a deploy check.

### Backups, restores and the database page

`/admin/database` (the `manageDatabase` capability) shows the tables, downloads a backup, restores
one, runs `ANALYZE`/`VACUUM`/`REINDEX`, repairs sequences and orphaned relation rows, and — with
`NEON_API_KEY` — manages Neon branches. The same backup restores from a terminal:

```bash
# In the admin: Database -> Backup -> Download SQL (or JSON for a readable copy).
pnpm db:restore ./pocms-2026-10-22.sql --yes
```

- The dump is logical, generated by Postgres (`format('%L', …)`), and restores into an **empty**
  database. Rows are left out only for locks, preferences and `payload_kv`, so a restored database
  keeps its migration history; `pnpm db:status` reports `ready` after a restore, and does not need
  `pnpm migrate` again.
- `db:restore` prints the file's statement and table count, whether it has `BEGIN`/`COMMIT`, and
  what the database already holds. It refuses a database with content until `--yes`, and refuses a
  file that touches the server (`DROP DATABASE`, `ALTER SYSTEM`, roles, psql meta-commands).
- If the database is **large**, the page caps a table at 100,000 rows and says which ones were
  truncated; use `pg_dump` and `psql` for a full byte-for-byte copy, or a Neon branch.
- On Neon, set `NEON_API_KEY` to add branch backups and point-in-time restore to the page.
  `NEON_PROJECT_ID`/`NEON_BRANCH_ID` skip the lookup that matches this database to its project
  (needed when the key sees several projects); `DATABASE_DIRECT_URL` sends backups and maintenance
  to the endpoint without `-pooler`.

### Real content in local development, and a migration from a database

Two commands read a *source* database — the Neon branch, normally — and write into this checkout.
They are the answer to "my local site is empty" and to "the branch has a column nobody migrated".

```bash
# A seed of the real content, and load it into the local database (it replaces those tables' rows).
pnpm db:seed-from --from neon --apply --yes

# Just the file, to read or to commit after review:
pnpm db:seed-from --from neon                       # → src/seed/snapshot.json
pnpm db:seed-load                                   # = db:seed-apply src/seed/snapshot.json --yes
pnpm db:seed-from --collections articles,projects --max-rows 200

# A Payload migration written from the database's catalogs, registered in src/migrations/index.ts:
pnpm db:schema-from --from neon
pnpm db:schema-from --from neon --mode fresh --out /tmp    # plain CREATEs, with a down that drops

# Does every object in the database come from a migration? Exits 1 when one does not:
pnpm db:drift
pnpm db:drift --from neon                                  # the same check against production

# What a seed would do, without doing it:
pnpm db:seed-apply src/seed/snapshot.json --dry-run
```

- `--from neon` uses `DATABASE_DIRECT_URL`, then `POSTGRES_URL`; `--from local` always uses
  `POSTGRES_URL`; `--from <url>` connects wherever the URL points. Nothing prints a credential.
- A seed holds the collections this config defines — never `users`, `roles`, `job_runs`,
  `pagespeed_reports`, `audit_logs` or Payload's own tables — so a production password hash cannot
  arrive in a development database. Media rows keep their blob URLs: images still render locally
  without copying a file. `--apply` deletes the rows of the tables the file names first, in one
  transaction, and sets each sequence past the highest id so the next insert does not collide.
  A file already on disk is applied with `pnpm db:seed-apply <file> --yes`.
- The generated migration is **guarded** by default: `CREATE TABLE IF NOT EXISTS`, and
  `CREATE TYPE`/`ADD CONSTRAINT` inside a `DO` block that checks the catalog, so running it against
  the database it came from changes nothing and running it against an empty one builds the schema.
  Its `down` is a no-op — a snapshot never drops anything. `--mode fresh` emits plain `CREATE`s with
  a `down` that drops them, for a file that defines a database on its own; do not commit that beside
  the baseline. Read the file before `pnpm migrate`: it describes what the database has, including
  anything added by hand.
- On a database that already has the schema, record the file as applied instead of running it:
  `pnpm migrate:adopt --name <the file's name>`.
- The same two files download from `/admin/database` → **From this database**, and a seed can be
  loaded from the **Load a seed** card (type `seed` to confirm). That card's *Show what this would
  change* button is the dry run: per table, the rows it would delete and the rows it would insert,
  read from the server, before the confirmation is typed.
- `pnpm db:drift` is the guard behind "the branch has a column nobody migrated". It reads the `up()`
  of every registered migration, lifts the SQL out of its `sql` templates (including a loop that
  builds its table name at runtime, and the `DO` blocks a guarded snapshot wraps its checks in), and
  compares the objects those statements declare with `pg_class`, `pg_attribute`, `pg_indexes` and
  `pg_type`. An object in the database that no migration declares is **drift** and fails the run;
  an object a migration declares that the database lacks is reported separately as **pending**,
  which is normally just a migration that has not run here. It does not compare types, defaults or
  constraints — two databases are `/admin/database` → **Compare with another database**, and one
  database's whole shape is `pnpm db:schema-from`. The same check is a card on `/admin/database`
  (**Migration drift**) and a read-only Terminal entry (*Migration drift check*).
- Argument-free spellings exist for CI and for the admin **Terminal**, whose allow-list may only
  name a package script (`pnpm run <script>`, never extra arguments):
  `pnpm db:schema-from:neon`, `pnpm db:seed-from:neon` and `pnpm db:seed-load`. On the Terminal
  (`/admin/terminal`, development builds only) they are the entries *Migration from this database*,
  *Seed from this database* and *Load that seed into the local database*; the last one is flagged
  `database`, so the console warns that it replaces rows before it runs.

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
echo $NEON_API_KEY          # optional: branch operations on /admin/database
echo $DATABASE_DIRECT_URL   # optional: non-pooled endpoint for backups and VACUUM
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
