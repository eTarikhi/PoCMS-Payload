# Local PostgreSQL Compose recipe

The old MongoDB template has been replaced with a **development-only PostgreSQL
recipe**. The native adapter has been exercised against a real disposable local
PostgreSQL database. The YAML has semantic contract tests, but **Docker is not
installed in the agent sandbox**, so container startup, image pulls, healthchecks,
volume ownership and service-name networking have not been engine-tested here.
Do not treat this as a production deployment or a fully certified Docker stack.

## Why adapter selection matters

`DATABASE_ADAPTER` is explicit:

| Value                    | Transport                                                                        |
| ------------------------ | -------------------------------------------------------------------------------- |
| unset / empty / `vercel` | Existing `@payloadcms/db-vercel-postgres` behavior, unchanged                    |
| `postgres`               | `@payloadcms/db-postgres` / node-postgres, including ordinary service-name hosts |

The Vercel adapter only falls back to native `pg` for `localhost`/`127.0.0.1`; merely
replacing `mongo` with `postgres` in Compose would not fix its transport. Compose
now explicitly selects `postgres`. Unknown values fail with a sanitized configuration
error. No hostname-based automatic switch or database-copy/migration is performed.

## Setup on a machine with Docker Compose v2

1. Copy `.env.example` to private `.env` if it does not already exist. Do not overwrite
   an existing environment file. Set a strong private `PAYLOAD_SECRET` and set
   `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local use.
2. Generate a private random **hex-only** password and store it as
   `POCMS_POSTGRES_PASSWORD` in `.env`. For example, generate 32 random bytes with
   your password manager or Node crypto. Hex avoids reserved connection-URL characters;
   arbitrary punctuation passwords require URL encoding and are not supported by this
   recipe's direct interpolation. Never commit or paste the password into logs/chat.
3. Keep remote Blob/email keys absent unless deliberately testing those providers.
   Without a Blob token, local uploads use the repository's ignored `media` directory.
4. Validate privately and start:

```sh
docker compose config --quiet
docker compose up --build
```

Use `config --quiet`, **not** plain `docker compose config` in shared logs: the latter
can print interpolated secrets. Open `http://localhost:3000/admin`. The container's
Next server binds `0.0.0.0`, while the published host port is deliberately loopback-only.
This default is for local use, not a public cloud-IDE tunnel or production service.

The recipe uses Node 22 Debian, a pinned pnpm 10.17.1 and a frozen lockfile. The
PostgreSQL 17 image tracks its major release; image updates still need your normal
security review and engine smoke tests. PostgreSQL has no published host port.
A healthcheck gates app startup, and a dedicated `postgres_data` volume retains data.
The app uses the service name `postgres` in its container-only connection string;
its `POSTGRES_URL`/adapter environment overrides the host-local values in `.env`.
Do not copy this container URL into a host-running Next process.

This runs `pnpm dev` and may push the Payload schema. Use a **new disposable database**
for the first engine smoke test. Review/back up existing databases before development
schema synchronization. The Docker recipe does not run a seed, reset or migration.

## Data and shutdown safety

- Normal stop: `docker compose down` (without `-v`).
- Do not run `down -v`, prune volumes or reset a database as a routine setup step.
- Existing old Mongo `data` volumes are not reinterpreted, migrated or deleted.
  An old Mongo container may remain as an orphan; inspect it before stopping anything.
- PostgreSQL image credentials initialize a **new** data directory only. Changing
  `.env` later does not rotate a database user's password in an existing volume.
- Local media is a bind-mounted directory, not Blob storage or a database backup.
- Existing dependency-volume files may be owned by the container user. This recipe
  is not a hardened production image or least-privilege container design.

## Validation performed and remaining

Passed outside Docker: both adapter modes' real Payload integration tests and full
production builds, native bootstrap/reset lifecycle, native production-mode admin /
public / media / cache / Live Preview browser checks, semantic YAML contract tests,
and pnpm 10.17.1 frozen-lockfile validation.

Still required on a Docker-capable machine: `config --quiet`, first startup, actual
healthcheck/network behavior, upload persistence, safe stop/restart, package install
inside the image, and schema initialization against the new PostgreSQL 17 volume.
The outside-Docker database used for current integration checks is PostgreSQL 18.4;
that is not a claim that the PostgreSQL 17 container has been run.

Pinned Payload reference: [PostgreSQL adapters, v3.90.2](https://github.com/payloadcms/payload/blob/v3.90.2/docs/database/postgres.mdx).
