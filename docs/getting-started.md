# Getting started

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Git
- Access to a PostgreSQL-compatible database such as Neon
- A Vercel Blob token and Payload secret for full functionality

## Installation

1. Clone the repository:

```bash
git clone https://github.com/eTarikhi/PoCMS-Payload.git
cd PoCMS-Payload
```

2. Install dependencies:

```bash
pnpm install --no-prod
```

3. Approve build dependencies when prompted:

```bash
pnpm approve-builds
```

4. Generate configuration files:

```bash
pnpm generate:all
```

5. Copy the example environment file:

```bash
cp .env.example .env
```

6. Update the file with your local values (at least `PAYLOAD_SECRET` and `POSTGRES_URL`).

7. Start a local PostgreSQL database (or point `POSTGRES_URL` at an existing one), then run the
   app and seed it:

```bash
docker compose up -d postgres
pnpm dev
pnpm seed   # optional: clears the content collections and loads the portfolio data
```

## Environment variables

`.env.example` documents every variable. The names below are the ones the code reads
(`src/payload.config.ts`, `src/app/(frontend)/lib/seo.ts`):

```env
# Payload CMS
PAYLOAD_SECRET=your-super-secret-key-here

# Database (local PostgreSQL, or Vercel Postgres / Neon)
POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/pocms

# Canonical site URL (absolute URLs, SEO, admin "View site" link)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Vercel Blob Storage (optional locally: uploads go to ./media when empty)
BLOB_READ_WRITE_TOKEN=

# Resend (optional locally)
RESEND_API_KEY=
```

### Generate a secure Payload secret

```bash
openssl rand -base64 32
```

## Database setup

### Fresh database

Run `pnpm migrate` first. The Postgres adapter runs with `push: false`, so a new empty database
gets its schema from `src/migrations` — the same files production runs — and `pnpm dev` or
`pnpm seed` on an unmigrated database fails instead of silently creating a schema of its own.

### Create the first admin

Open `http://localhost:3000/admin` — a database with no users shows **Create first user**, and the
account it creates is an Administrator. From the terminal, or when an account already exists and
the password is unknown:

```bash
pnpm admin:create --email you@example.com    # asks for the password
pnpm admin:status                            # who exists, what they may do
```

A hosted database (Neon, Vercel Postgres) is empty until the migrations run — the app says
`This database has no schema (missing tables: users, articles)` and stops. `--migrate` does both
steps in one, and prints the migration log first:

```bash
pnpm admin:create --migrate --email you@example.com
```

or, separately, `pnpm migrate` then `pnpm admin:create` (plus `pnpm seed` for demo content).

If the migration stops partway (the serverless connection dropping mid-run leaves a few `CREATE
TYPE` statements behind), the next attempt fails with
`type "enum_articles_category" already exists`. Nothing else will run on that database until the
leftovers are gone:

```bash
pnpm db:status          # what exists, and what the app makes of it
pnpm db:reset --yes     # drops the public schema and migrates from zero
```

`admin:create` is idempotent: a new address creates an Administrator, an existing one gets the new
password and, if it had no role, the Administrator role (an account without a role is refused by
the admin).

### Create a custom migration

```bash
pnpm migrate:create --name my_change   # diffs the schema and writes src/migrations/<ts>_my_change.ts
pnpm migrate:status                    # which files have run, and which have not
pnpm migrate:adopt --name <ts>_my_change   # record it as applied without running it
```

`migrate:create` compares the Payload config against the database it connects to, so a database
that already has the change produces an empty file — `--skip-empty` (already in the script) drops
it again. Point it at a *freshly migrated* database to get only your own change.

### Write a migration from any database

When a database already holds the schema you want — production on Neon, a teammate's copy — its
catalogs can produce the migration file directly, with no diff step and no risk of Payload
re-creating something that exists:

```bash
pnpm db:schema-from:neon     # guarded CREATE … IF NOT EXISTS from DATABASE_DIRECT_URL (or POSTGRES_URL)
pnpm db:seed-from:neon       # content seed as src/seed/snapshot.json, from the same database
pnpm db:seed-load            # load that file into the local database, one transaction
```

| Command | What it does |
| --- | --- |
| `pnpm db:schema-from:neon` | Reads the catalogs of the Neon/remote database and writes `src/migrations/<ts>_schema_snapshot.ts`, registered in `src/migrations/index.ts`. **Guarded** by default (`IF NOT EXISTS` + catalog checks), so it is safe to run on a database that already has the schema; `--mode fresh` writes plain `CREATE`s with a real `down`. Never emits rows, grants, ownership or extensions. |
| `pnpm db:seed-from:neon` | Writes `src/seed/snapshot.json`: the rows of the content collections (auth, operational and Payload tables excluded), parents first, capped at 5 000 rows per table. Review it before committing — it holds whatever the source database holds. `--apply --yes` loads it in the same step. |
| `pnpm db:seed-load` | Loads `src/seed/snapshot.json` into the local database in one transaction: deletes the rows of the tables the file names (children first), inserts the file's rows, resets the sequences. Nothing outside the file is touched. |
| `pnpm db:status` | Tables, enum types and applied migrations, plus a verdict on whether the app can run. |
| `pnpm db:reset --yes` | Drops the public schema and migrates from zero. Destructive. |
| `pnpm db:restore <file.sql>` | Runs a backup taken from `/admin/database`. |
| `pnpm db:seed-apply <file.json> --yes` | `db:seed-load` for any snapshot path. |

Both `:neon` shortcuts are the argument-free spelling of `pnpm db:schema-from --from neon` and
`pnpm db:seed-from --from neon`; `--from local` always means `POSTGRES_URL`, and `--from <url>`
connects wherever that URL points. Credentials are never printed. Run `pnpm db:schema-from` with no
arguments for the full flag list.

The same three commands are on the allow-list of the admin **Terminal** (`/admin/terminal`,
development builds only), so the snapshot can be pulled and loaded without leaving the browser.
See `docs/plugins/database-tools.md` and `docs/ui-modernization/terminal-security.md`.

## Start the app

```bash
pnpm dev
```

Then open:

- Admin panel: `http://localhost:3000/admin`
- API: `http://localhost:3000/api`

Follow the on-screen setup instructions to create your first admin user.

## Useful scripts

```bash
# Development
pnpm dev                 # Next.js + Payload with hot reload
pnpm generate:all        # import map, types, payload output
pnpm lint                # eslint
pnpm typecheck           # tsc --noEmit
pnpm test:int            # integration tests (vitest)

# Build / production
pnpm build
pnpm start

# Database
pnpm migrate             # apply src/migrations
pnpm migrate:status      # what has run
pnpm migrate:create --name my_change
pnpm migrate:adopt --name <ts>_my_change
pnpm seed                # demo content
pnpm admin:create --email you@example.com
pnpm admin:status
pnpm db:status
pnpm db:schema-from:neon # migration file from a remote database's catalogs
pnpm db:seed-from:neon   # content seed from a remote database
pnpm db:seed-load        # load src/seed/snapshot.json locally
pnpm db:reset --yes      # destructive
```
