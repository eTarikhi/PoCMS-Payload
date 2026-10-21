# Getting started

## Frontend design review without a database

Use a supported Node runtime (Node 22 recommended) and pnpm matching `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm preview:studio
```

The standalone Studio preview listens on port **4173** and uses clearly labeled,
checked-in sample content. It is not the CMS application and does not replace failed
production database requests. See [preview documentation](../previews/studio/README.md).

## Running the real CMS application

```sh
cp .env.example .env
```

Edit `.env` privately. At minimum configure:

- `PAYLOAD_SECRET`: a strong random value, never committed or printed in logs.
- `POSTGRES_URL`: your PostgreSQL connection string.
- `NEXT_PUBLIC_SITE_URL`: the canonical public origin, or your local app origin.

For a local PostgreSQL instance the Vercel adapter uses `pg` when the URL hostname is
`localhost` or `127.0.0.1`. Other hosts use the Vercel/Neon transport. Do not assume an
arbitrary Docker service hostname behaves like a local PostgreSQL connection.

`BLOB_READ_WRITE_TOKEN` enables Vercel Blob. With no token, media stays on local disk;
use durable storage for production. `RESEND_API_KEY` enables transactional email.
`MEDIA_REMOTE_ORIGINS` allows additional public HTTPS image hosts. `.env.example`
is the authoritative list of configuration names.

Generate a secret locally, then store it privately:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Once configured:

```sh
pnpm dev
```

Open `/admin` to author content and `/` for the public site. Public routes also include
`/projects`, `/articles`, and `/articles/[slug]` for articles with a local body.
GraphQL is at `/api/graphql`, not `/graphql`.

## Database and generated files

Development may push the schema through Payload's adapter. Back up important data
before starting against an existing database. Use an isolated database for tests.

After intentional collection/config changes, generate the project artifacts using
`pnpm generate:all` in the configured environment. Production schema changes should
use reviewed migrations and the normal release process.

**Do not run `migrate:fresh`, the destructive seed, or database-drop commands on an
existing database as a routine setup step.** No schema changes are needed for the
Studio redesign delivered here.

The current `docker-compose.yml` is a legacy MongoDB template and does not match the
PostgreSQL adapter. Do not use it as the setup path until it has been modernized.
