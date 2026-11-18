# Phase 2A — Neon integration foundation

**Status:** Foundation built and its guard rails verified. **Neon integration has NOT been executed.** No disposable Neon branch or credential is available in the environment where this was written, so nothing here claims a passing Neon run.

**Architecture correction:** an earlier revision of this document described a local PostgreSQL/Docker testing story and added a local `pg.Pool` escape hatch. That was wrong. The application uses **Vercel/Neon PostgreSQL in every environment, including local development**: the developer runs the app locally, the database is a Neon branch. A local PostgreSQL server, a Docker PostgreSQL service, and a plain `pg.Pool` are **not** part of the supported architecture. Everything local-only has been removed from the required path.

---

## 1. Verified architecture

### 1.1 Adapter wiring (source-verified)

`src/payload.config.ts:308` constructs the database with `vercelPostgresAdapter` imported from `@payloadcms/db-vercel-postgres` (line 1). It is never `@payloadcms/db-postgres`.

The resolved config exposes a `db` object with `name: 'postgres'`, `defaultIDType: 'number'`, and an `init` function — confirmed by executing the real config.

### 1.2 Which driver runs, and where

`node_modules/@payloadcms/db-vercel-postgres/dist/connect.js:13-24`:

- **Production / any remote Neon host** → `VercelPool`, i.e. `@neondatabase/serverless`'s `Pool`, which tunnels over WebSocket (`wss://<endpoint>/v2`).
- **`127.0.0.1` / `localhost`** → a plain `pg.Pool`.

Because the supported database is always Neon, the effective production and local-development driver is the **Neon serverless driver**. The `pg.Pool` branch is reachable only for a loopback URL, which the supported architecture does not use. That branch is not tested or exercised by this repository's integration path, by design.

> Correction of an earlier claim: the Phase 2A revision treated the loopback/`pg.Pool` branch as a defect to fix and added URL rewriting to force it. That was wrong on two counts — it is not the runtime path, and forcing it would have moved the app _off_ the supported Neon driver. The rewriting is removed. `src/lib/postgresAdapterConfig.ts` is back to its pre-Phase-2A state.

### 1.3 Pool semantics that must not change (verified by tests)

| Setting                   | Neon/remote value             | Notes                                          |
| ------------------------- | ----------------------------- | ---------------------------------------------- |
| `max`                     | `4`                           | keeps serverless isolates off PgBouncer limits |
| `idleTimeoutMillis`       | `5_000`                       | releases WebSockets for scale-to-zero          |
| `connectionTimeoutMillis` | `30_000`                      | accommodates cold wake-ups                     |
| `maxUses`                 | `7_500`                       | —                                              |
| `push`                    | `false` under `NODE_ENV=test` | unless `PAYLOAD_DB_PUSH=true`                  |

---

## 2. What changed in this correction

### 2.1 Removed from the application path

| Removed                              | Why                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `usesDriftedLocalHost`               | Detects a local-vs-Neon hostname mismatch that cannot occur in the supported architecture |
| `resolveLocalDriverConnectionString` | Rewrote URLs to `127.0.0.1` to force `pg.Pool` — the opposite of the supported driver     |
| `resolvePoolOptions`                 | Applied that rewrite inside `buildPostgresAdapterArgs`                                    |
| `forceUseVercelPostgres` wiring      | Belongs to the local escape hatch; must never appear on the required path                 |

`buildPostgresAdapterArgs` is back to calling `resolvePostgresPoolOptions` directly, exactly as before Phase 2A.

### 2.2 Tests removed

| Removed                                                  | Why it did not belong                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `tests/int/postgres-driver-selection.int.spec.ts`        | Entirely about Compose-alias/`[::1]`/`localhost` → `pg.Pool` selection. That path is unused. |
| `tests/int/postgres-harness-guards.int.spec.ts`          | Guarded a local-PostgreSQL harness (loopback-only hosts, `DROP DATABASE`)                    |
| `tests/integration/postgresHarness.ts`                   | Created/dropped databases over a plain `pg` connection                                       |
| `tests/integration/failClosedSetup.ts`                   | Setup for the local harness                                                                  |
| `tests/integration/payloadRequestContext.pg.int.spec.ts` | Ran against a local disposable database                                                      |
| `vitest.pg.config.mts`                                   | Config for the removed suite                                                                 |

### 2.3 Tests retained / added

| File                                                           | Type          | What it protects                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/int/neon-adapter-config.int.spec.ts`                    | config, no DB | `payload.config.ts` imports `@payloadcms/db-vercel-postgres` and **not** `@payloadcms/db-postgres`; the installed adapter is the Neon one; Neon pool sizing; remote URLs pass through byte-for-byte; `push` semantics |
| `tests/int/neon-harness-guards.int.spec.ts`                    | unit, no DB   | Every refusal in the Neon harness (see §3)                                                                                                                                                                            |
| `tests/integration/neonTestHarness.ts`                         | harness       | Target validation and destructive opt-in                                                                                                                                                                              |
| `tests/integration/neonTarget.ts`                              | helper        | Neon endpoint-id parsing                                                                                                                                                                                              |
| `tests/integration/neonFailClosedSetup.ts`                     | setup         | Validates, then redirects `POSTGRES_URL`, then re-asserts                                                                                                                                                             |
| `tests/integration/neonPayloadRequestContext.neon.int.spec.ts` | **real Neon** | Payload boots via the Neon adapter, real SQL, real anonymous GraphQL denial, REST form-submission read                                                                                                                |
| `vitest.neon.config.mts`                                       | config        | `test:int:neon`                                                                                                                                                                                                       |

The adapter guard is proven non-vacuous: swapping the import to `@payloadcms/db-postgres` makes it fail.

---

## 3. Safety model for the Neon integration suite

The dangerous case is specific and real. `payload.config.ts` builds its pool from `POSTGRES_URL`, which in a normal local dev environment points at the **owner's real Neon database**. Any integration suite that boots Payload without care would talk to production data.

`tests/integration/neonTestHarness.ts` therefore enforces, in order:

| #   | Guard                                                                                                                  | Refusal                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `POSTGRES_TEST_URL` must be set; `POSTGRES_URL` is never used as a fallback                                            | "POSTGRES_TEST_URL is not set"                                                  |
| 2   | Must not be byte-identical to `POSTGRES_URL`                                                                           | "identical to POSTGRES_URL"                                                     |
| 3   | Host must be a Neon host (`*.neon.tech`)                                                                               | "not a Neon host" — localhost, Docker aliases and other hosts refused           |
| 4   | Neon **endpoint id** must differ from the one in `POSTGRES_URL`                                                        | "same Neon endpoint" — a different database name on the same compute is refused |
| 5   | Database name must differ from the application's                                                                       | "same database name"                                                            |
| 6   | Database name must contain `pocms_test`                                                                                | name merely containing "test" is explicitly not accepted as proof               |
| 7   | Destructive operations need `PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE=true` **and** re-validate the target immediately before | "not set to \"true\"" / "changed during the run"                                |
| 8   | Before booting Payload, the process must be confirmed to point at the test database                                    | "would not use the disposable test database"                                    |

`POSTGRES_URL` is overwritten **only after** guards 1–6 pass, and guard 8 re-checks the result. The order is deliberate: overwriting first would risk Payload reading the application URL.

**The suite never drops, truncates or recreates a database.** The disposable branch is discarded by the operator. There is no `DROP DATABASE`, no `pg_terminate_backend`, and no plain-`pg` admin connection anywhere in the harness.

Two guards are necessary but not sufficient, and are documented as such: the `pocms_test` marker, and a "test"-looking name. Only the endpoint-id comparison (guard 4) is treated as independent evidence that a different Neon compute is being used.

---

## 4. Running the Neon integration suite

### 4.1 Create a disposable Neon branch

Use a branch, not a second database on the same branch. A branch gets its own endpoint id, which is what guard 4 checks. Create it in the Neon console, or:

```bash
neonctl branches create --name pocms-test --project-id <your-project-id>
```

Take the **pooled** connection string for that branch. Treat it as a secret: do not commit it, do not paste it into an issue, do not echo it into a shell history you share.

### 4.2 Run

```bash
export POSTGRES_TEST_URL='postgresql://<user>:<pass>@ep-<branch-id>-<n>-pooler.<region>.aws.neon.tech/pocms_test'
export PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE=true
export PAYLOAD_DB_PUSH=true
export PAYLOAD_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
pnpm test:int:neon
```

Notes:

- The database name **must** contain `pocms_test`. Create it on the branch first: `CREATE DATABASE pocms_test;` on that branch only.
- `PAYLOAD_DB_PUSH=true` is required: the adapter disables schema push under `NODE_ENV=test`, and this repository has no tracked migrations (`src/migrations` does not exist). Without it the branch has no tables and the spec refuses to run rather than reporting misleading failures.
- The harness compares `POSTGRES_TEST_URL` against your `POSTGRES_URL`. For that comparison to be meaningful, have `POSTGRES_URL` set to the real application database in the same shell — that is how guard 4 proves the targets differ.
- `PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE=true` is required because schema push mutates the branch.

### 4.3 Windows 11 (PowerShell)

```powershell
$env:POSTGRES_TEST_URL = 'postgresql://<user>:<pass>@ep-<branch-id>-<n>-pooler.<region>.aws.neon.tech/pocms_test'
$env:PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE = 'true'
$env:PAYLOAD_DB_PUSH = 'true'
$env:PAYLOAD_SECRET = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
pnpm test:int:neon
```

With a Neon-native workflow, `neonctl` is available in PowerShell too:

```powershell
neonctl branches create --name pocms-test --project-id <your-project-id>
```

### 4.4 Environment variables

| Variable                                            | Required              | Purpose                                                                                                     |
| --------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POSTGRES_TEST_URL`                                 | **Yes**               | Disposable Neon branch, database containing `pocms_test`. Never falls back to `POSTGRES_URL`.               |
| `POSTGRES_URL`                                      | For safety comparison | The application database. Used **only** to prove the test target is a different endpoint. Never written to. |
| `PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE`                 | Yes (`true`)          | Opt-in for schema-mutating operations.                                                                      |
| `PAYLOAD_DB_PUSH`                                   | Yes (`true`)          | Enables schema push under `NODE_ENV=test`.                                                                  |
| `PAYLOAD_SECRET`                                    | Yes (≥16 chars)       | Payload boot.                                                                                               |
| `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_BRANCH_ID` | No                    | Only for the `/admin/database` Tier-2 tooling; the suite does not use them.                                 |

### 4.5 Cleanup

The suite leaves the branch alone. When you are done:

```bash
neonctl branches delete pocms-test --project-id <your-project-id>
```

### 4.6 `docker-compose.yml`

Unchanged. It remains an optional way to run the **application** container, and it is not a test fixture. It is not referenced by any test command, and no test requires Docker.

---

## 5. Verified vs pending

### Verified by execution in this environment

| Item                                            | Evidence                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Config uses the Vercel/Neon adapter             | `neon-adapter-config` source + resolved-config assertions (7 tests)                                                           |
| Adapter replacement is caught                   | Swapping to `@payloadcms/db-postgres` fails the guard                                                                         |
| Neon pool sizing and remote URL pass-through    | 7 config tests                                                                                                                |
| All 8 harness refusals                          | 15 guard tests                                                                                                                |
| Neon suite fails closed                         | 5 live invocations: no URL, non-Neon host, identical to `POSTGRES_URL`, same endpoint, missing `PAYLOAD_DB_PUSH` — all exit 1 |
| GraphQL Admin gate unchanged                    | 33 Phase 0/1 contract tests                                                                                                   |
| No regression in the general suite              | 27 files, 180 passed, 1 pre-existing skip                                                                                     |
| Typecheck, ESLint, Prettier, `git diff --check` | all clean                                                                                                                     |

### Pending — requires a disposable Neon branch

| Item                                                | Why it is pending                           |
| --------------------------------------------------- | ------------------------------------------- |
| Payload boots against Neon through the real adapter | No Neon branch or credential available here |
| Schema push creates tables on an empty branch       | Same                                        |
| Real anonymous GraphQL denial against Neon          | Same                                        |
| REST form-submission read against Neon              | Same                                        |

**No Neon integration run is claimed.** Until `pnpm test:int:neon` has been executed against a genuinely separate disposable branch, the Neon integration path is unproven.

---

## 6. Remaining blockers

1. **No Neon integration execution.** Needs a disposable Neon branch and its connection string. This is the single hard prerequisite to close Phase 2A.
2. **Schema bootstrap on a fresh branch is unconfirmed.** `PAYLOAD_DB_PUSH=true` is the assumed path because no tracked migrations exist. Verify on a real branch.
3. **The `pg.Pool` branch in the third-party adapter remains untested here** — intentional, since the supported architecture never reaches it. Anyone pointing `POSTGRES_URL` at a loopback host is outside the supported configuration and will hit the WebSocket-vs-TCP mismatch documented in the Phase 2 readiness assessment.
4. **`me.js` / `refresh.js` request-context inconsistency** remains documented but undecided; it blocks a future `/api/fgql` proof, not this phase.
5. **External `/api/graphql` consumer inventory and deployed commit SHA** remain unknown (Vercel connector disconnected).

---

## 7. Boundaries held in this correction

No change to GraphQL authorization routes or role checks. No anonymous GraphQL. No `/api/fgql`. No persisted-query feature. No change to public form-submission REST access. No test weakened, no failure converted to a skip, no timeout lowered. No production or owner Neon database contacted. No connection string, password, token or sensitive query parameter printed or committed. No CI triggered.
