# Phase 2A.1 — Neon disposable-branch safety and integration validation

**Architecture:** the app runs locally but connects to Neon. `src/payload.config.ts` uses
`@payloadcms/db-vercel-postgres` in every environment; local PostgreSQL, Docker PostgreSQL, and a
plain `pg.Pool` are not supported application targets.

**Validation status:** the safety harness and source-level adapter checks are implemented. No live
Neon integration or empty-branch schema bootstrap is claimed; this checkout has no approved test
branch credentials or target metadata. The Neon integration command fails closed without them.

For the owner-side Windows 11 / PowerShell procedure—including isolated-project provisioning,
metadata IDs, empty-database verification, and cleanup—see the [Phase 2A.2 owner runbook](phase2a-neon-owner-runbook.md).

## 1. Runtime and schema-push behavior

### Adapter

The configured adapter is `vercelPostgresAdapter` from `@payloadcms/db-vercel-postgres`. For remote
Neon hosts, Payload 3.90.2's installed adapter uses `VercelPool` from `@vercel/postgres`, backed by
the Neon serverless driver. The third-party adapter retains a loopback `pg.Pool` branch, but the
supported app configuration does not use it. No local database driver selection or URL rewriting
has been added to the app path.

The app's Neon pool profile remains unchanged: `max: 4`, `idleTimeoutMillis: 5000`,
`connectionTimeoutMillis: 30000`, and `maxUses: 7500`. Remote connection URLs pass through unchanged.

### `PAYLOAD_DB_PUSH=true`

The installed Payload 3.90.2 adapter source was inspected and is guarded by a local contract test:

1. `connect.js` skips the adapter's `dropDatabase()` call unless `PAYLOAD_DROP_DATABASE=true`.
2. On a missing database, the adapter's connection error handler may call `createDatabase()` unless
   `disableCreateDatabase` is true.
3. After `createExtensions()`, a non-production connection with `push !== false` calls
   `pushDevSchema()` unless `PAYLOAD_MIGRATING=true`.
4. The installed `pushDevSchema()` calls Drizzle Kit `pushSchema()`, applies the resulting plan,
   and records/updates the dev-push entry in `payload_migrations` (`batch = -1`). This is schema
   push, not execution of files from `src/migrations`.

Under `NODE_ENV=test`, `src/payload.config.ts` sets `push: false` unless
`PAYLOAD_DB_PUSH === 'true'`. The Neon setup clears any shell-provided push flag and only sets it
after all local opt-ins and Neon metadata checks pass. It also:

- rejects `PAYLOAD_DROP_DATABASE=true`;
- sets the resolved adapter's `disableCreateDatabase=true` before Payload initialization;
- removes configured read-replica URLs so no query can be sent to another branch; and
- verifies that the resolved adapter is `@payloadcms/db-vercel-postgres` and its primary
  `poolOptions.connectionString` exactly matches the approved Neon test URL.

The source-level path shows Drizzle Kit can generate/apply a schema on an empty database, but it is
**not proof** that bootstrap succeeds on a real empty Neon branch. No live branch was available to
verify that behavior. Schema push may warn about data loss on a non-empty schema and may prompt; do
not approve that prompt on an owner/production branch.

## 2. Fail-closed safety model

`tests/integration/neonFailClosedSetup.ts` runs before the integration spec imports
`payload.config.ts`. Local validation does not contact Neon. Only after it passes does the harness
make read-only calls to the Neon control-plane API; Payload's database connection is attempted only
after those metadata checks pass.

| Check                  | Required evidence                                                                                                               | Failure behavior                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Explicit target URL    | `POSTGRES_TEST_URL` is set and points to a Neon endpoint                                                                        | Fail; never fall back to `POSTGRES_URL`                         |
| Normal app endpoint    | `POSTGRES_URL` is set and points to a Neon endpoint                                                                             | Fail if missing, invalid, or not Neon                           |
| Different endpoint     | Test endpoint ID differs from the app endpoint ID                                                                               | Fail; a different database name is insufficient                 |
| Independent approval   | `NEON_TEST_BRANCH_ID`, `NEON_TEST_ENDPOINT_ID`, `NEON_TEST_DATABASE`, project IDs, and `NEON_API_KEY` are explicitly configured | Fail if any item is missing or mismatched                       |
| Disposable opt-in      | `NEON_TEST_BRANCH_DISPOSABLE=true`                                                                                              | Fail; names and host patterns are not evidence of disposability |
| Schema-change opt-in   | `PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE=true`                                                                                        | Fail before enabling `PAYLOAD_DB_PUSH`                          |
| Neon branch metadata   | Neon API confirms the requested branch/project IDs; branch is not default or protected                                          | Fail closed on any mismatch or API error                        |
| Test endpoint metadata | Neon API confirms the URL endpoint ID and normalized host match the approved read-write endpoint on that branch                 | Fail closed on mismatch                                         |
| App branch metadata    | Neon API maps the endpoint in `POSTGRES_URL` to a branch different from the approved test branch                                | Fail even if endpoint IDs differ but branch IDs match           |
| Push activation        | Only after all checks, the process is redirected to the verified test URL and `PAYLOAD_DB_PUSH=true` is set                     | Fail if the target or opt-ins changed                           |
| Database creation/drop | `PAYLOAD_DROP_DATABASE=true` is forbidden; Payload `disableCreateDatabase` is enabled                                           | No `DROP DATABASE` or `CREATE DATABASE` by this suite           |

The harness does not infer safety from the database name, a `test` substring, a hostname pattern,
or a different endpoint alone. The owner must explicitly designate the branch as disposable and
supply its branch/endpoint IDs independently; Neon API metadata must match those IDs and prove the
app and test URLs map to different branches. If Neon metadata is unavailable, the suite fails before
opening a database connection.

All errors are written without connection URLs, credentials, passwords, API keys, or query
parameters. The approved URLs stay in process memory for target comparison and for the real Payload
adapter only.

### Data isolation caveat

A Neon branch is a snapshot of its parent. A branch can have a different endpoint and branch ID yet
still contain copied production or development data. `NEON_TEST_BRANCH_DISPOSABLE=true` is an
explicit owner assertion; the harness verifies branch identity and metadata but does not claim the
branch has no inherited data. Create/approve a branch whose contents are safe for schema changes and
synthetic test writes. Do not use the normal production/development branch.

## 3. Integration behavior

`tests/integration/neonPayloadRequestContext.neon.int.spec.ts` is prepared to exercise the real
installed adapter and Payload runtime. After the verified adapter initializes, it:

- runs a Local API query against the real Neon database;
- sends an anonymous request through the committed GraphQL route and asserts the existing `401`,
  `cache-control: no-store`, and authorization error response;
- creates one synthetic form on the disposable branch, then posts an anonymous form submission
  through Payload's real REST catch-all route;
- checks the persisted submission through the Local API and asserts anonymous reads stay forbidden;
- suppresses Resend calls via the existing `PLAYWRIGHT_TEST` flag and `x-playwright-e2e` test header;
- calls `payload.db.destroy()` after the tests, but performs no data cleanup: it does not delete test
  rows, truncate tables, drop/create a database, or delete the branch.

Test rows (and any Payload startup records/schema) are left on the approved branch. The owner discards
that branch after review. The installed adapter's `destroy()` resets adapter state; it is not a
record cleanup or an explicit pool-close guarantee. No application
GraphQL authorization route or role check, anonymous GraphQL behavior, public form-submission REST
access, frontend behavior, or REST catch-all route was changed.

## 4. Environment required to run locally

Set these in the shell/process that runs `pnpm test:int:neon`. Do not print or paste any URL, token,
password, or API key. The existing `NEON_API_KEY` is used by this preflight only for read-only branch
and endpoint metadata requests.

| Variable                            | Required value / purpose                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_URL`                      | The normal application Neon URL. Required for endpoint and branch separation checks; the harness reads it, then replaces it with the approved test URL only after validation. |
| `POSTGRES_TEST_URL`                 | The pooled URL for the approved test branch and its already-existing database. No fallback is used.                                                                           |
| `NEON_API_KEY`                      | Neon API key available to the installed `@neon/sdk`; API errors are not printed.                                                                                              |
| `NEON_TEST_PROJECT_ID`              | Project ID containing the approved test branch.                                                                                                                               |
| `NEON_APP_PROJECT_ID`               | Project ID containing the endpoint in `POSTGRES_URL` (may equal the test project).                                                                                            |
| `NEON_TEST_BRANCH_ID`               | Independently copied `br-...` ID for the approved branch.                                                                                                                     |
| `NEON_TEST_ENDPOINT_ID`             | Independently copied `ep-...` read-write endpoint ID; must match both URL and Neon metadata.                                                                                  |
| `NEON_TEST_DATABASE`                | Exact existing database name in `POSTGRES_TEST_URL`; it is an identity check, not disposability evidence.                                                                     |
| `NEON_TEST_BRANCH_DISPOSABLE`       | Must be `true`: explicit owner approval that this exact branch is disposable.                                                                                                 |
| `PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE` | Must be `true`: explicit owner approval for schema push and synthetic test writes on that branch.                                                                             |
| `PAYLOAD_DB_PUSH`                   | **Do not set to `true` in the shell.** The harness clears it and enables it only after all safety checks; a pre-set `true` is refused.                                        |
| `PAYLOAD_DROP_DATABASE`             | Must not be `true`; the harness rejects it.                                                                                                                                   |
| `PAYLOAD_SECRET`                    | Optional; a random process-only secret is generated if absent.                                                                                                                |

`NODE_ENV=test` is required and set by Vitest. Read-replica environment variables are cleared by the
harness. Existing app variables such as `NEON_PROJECT_ID` and `NEON_BRANCH_ID` are for the admin
provider integration; the test uses the separate `NEON_TEST_*` values above.

### Run

1. In Neon, create and review a separate, non-default branch that the owner explicitly considers
   disposable. Use a parent whose copied data is safe for this test. Copy the branch ID, its read-write
   endpoint ID, project ID, and the existing database name independently from Neon metadata.
2. Configure the variables above locally. Keep the normal `POSTGRES_URL` present for comparison,
   but do not echo it. Remove any manually-set `PAYLOAD_DB_PUSH=true` before starting.
3. Run:

```bash
pnpm test:int:neon
```

No database-create command is part of the procedure. The target database must already exist; the
suite explicitly disables Payload's automatic database-create fallback. Schema push and the
synthetic form/submission writes occur only after the independent Neon verification and both opt-ins.

PowerShell uses the same environment-variable names; set them through your local secret/environment
manager and run `pnpm test:int:neon`. Do not put connection strings or secrets in shell history or
logs.

## 5. Verification status

### Verified locally without a database

- The application config and installed adapter remain the Vercel/Neon path; remote Neon URLs and
  pool settings are preserved.
- Installed Payload 3.90.2 schema-push and automatic database creation/drop behavior are covered by
  source-level contract assertions.
- Harness guard tests use synthetic URLs and a fake Neon metadata client; they make no API or
  database request.
- Running `pnpm test:int:neon` with no configured test URL fails with a clear
  `POSTGRES_TEST_URL is required` error. The Neon integration hooks do not proceed to metadata or a
  database connection.

### Pending owner-side validation

- Run against an approved disposable Neon branch with the exact variables above.
- Confirm `PAYLOAD_DB_PUSH` successfully bootstraps an actually empty schema on that branch.
- Exercise real adapter initialization, GraphQL authorization, and anonymous REST form-submission
  behavior against Neon.

**No live Neon integration success or empty-branch bootstrap is claimed.** A disposable Neon branch,
its read-write endpoint, and locally configured Neon API credentials are not available here.

## 6. Validation and boundaries

The no-database validation suite includes the Neon adapter configuration test, Neon harness guard
tests, Phase 0/1 GraphQL contract tests, and the existing `pnpm test:int` suite. TypeScript,
targeted ESLint/Prettier, and `git diff --check` are run locally for this Phase 2A.1 change. Exact
results are recorded in the completion report.

No local PostgreSQL/Docker test infrastructure was restored. No GraphQL feature, role check, route,
public REST behavior, or frontend behavior was changed. No remote CI, GitHub Actions, or hosted
workflow was run. No owner/production Neon branch was connected to or modified during this work.
