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
npx payload migrate:create
```

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
pnpm dev

# Build / production
pnpm build
pnpm start

# Database
npx payload migrate
npx payload migrate:fresh
npx payload migrate:create
```
