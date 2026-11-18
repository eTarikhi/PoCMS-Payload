# Phase 2A — PostgreSQL 16 integration foundation

**Status:** Foundation built and its failure paths verified. The success path has **not** been executed, because no PostgreSQL 16 server, Docker, or podman is available in the environment where this was written. Nothing in this document claims a passing database integration run.

This document records: the driver-selection investigation and its fix, the reproducible PostgreSQL 16 procedure, and the fail-closed test design.

---

## 1. Driver-selection investigation

### 1.1 The two hostname lists

| Owner             | Location                                                    | Local hosts                                          |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| This repository   | `src/lib/postgresAdapterConfig.ts` → `LOCAL_POSTGRES_HOSTS` | `localhost`, `127.0.0.1`, `::1`, `[::1]`, `postgres` |
| Installed adapter | `@payloadcms/db-vercel-postgres/dist/connect.js:15-18`      | `127.0.0.1`, `localhost`                             |

The adapter's list is hardcoded and is **not** configurable. Our list is wider because it drives pool _sizing_, and treating the Compose alias `postgres` as local for sizing is correct.

### 1.2 Actual runtime behaviour

`connect.js:13-24` is the only place the driver is chosen:

<!-- prettier-ignore -->
```js
        const connectionString = this.poolOptions?.connectionString ?? process.env.POSTGRES_URL;
        // Use non-vercel postgres for local database
        if (!this.forceUseVercelPostgres && connectionString && [
            '127.0.0.1',
            'localhost'
        ].includes(new URL(connectionString).hostname)) {
            client = new pg.Pool(this.poolOptions ?? {
                connectionString
            });
        } else {
            client = this.poolOptions ? new VercelPool(this.poolOptions) : sql;
        }
```

Measured, by executing that predicate against the real package:

| Hostname                   | Driver selected  | Connects over             |
| -------------------------- | ---------------- | ------------------------- |
| `localhost`                | `pg.Pool`        | plain TCP (node-postgres) |
| `127.0.0.1`                | `pg.Pool`        | plain TCP (node-postgres) |
| `postgres` (Compose alias) | **`VercelPool`** | **WebSocket**             |
| `[::1]`                    | `VercelPool`     | WebSocket                 |
| `*.neon.tech`              | `VercelPool`     | WebSocket                 |

`VercelPool` is `@neondatabase/serverless`'s `Pool` (`chunk-7IR77QAQ.js:123`), not a `pg.Pool` subclass — verified: `VercelPool.prototype instanceof pg.Pool === false`.

### 1.3 Why the discrepancy matters

For host `postgres`, the Neon driver resolved a WebSocket tunnel and attempted:

```
wss://postgres/v2
```

(Captured by installing a WebSocket constructor and reading the URL; `neonConfig.wsProxy` defaults to `<host>/v2`, `useSecureWebSocket` defaults to `true`.)

A stock `postgres:16-alpine` container serves plain TCP on 5432. It has no WebSocket endpoint, and the hostname `postgres` does not resolve outside the Compose network. So under the alias the connection could never succeed — while `isLocalPostgresUrl()` reported the URL as local and sized the pool for a local database. That combination is the defect.

**Verdict: yes, the discrepancy caused incorrect driver selection.** It is latent in normal use because `docker-compose.yml` sets `POSTGRES_URL` to the alias, but it makes a plain local PostgreSQL unreachable through Compose.

### 1.4 Two approaches that do _not_ work

Both were checked against installed source and rejected:

1. **`forceUseVercelPostgres: true`.** `connect.js:15` guards on `!this.forceUseVercelPostgres`, so setting it to `true` _forces the serverless driver_. It is the opposite of what a local fix needs. An initial attempt along these lines was caught by the new tests and reverted.
2. **The adapter's top-level `connectionString` argument.** It is declared in `types.d.ts` but never read — `grep connectionString dist/index.js` returns nothing. Only `pool.connectionString` is consulted.

### 1.5 The fix

`src/lib/postgresAdapterConfig.ts` gains three exported, tested pieces:

| Function                                  | Purpose                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `usesDriftedLocalHost(url)`               | `true` only when the URL is local to us but not to the adapter — i.e. the exact drift zone (`postgres`, `[::1]`)                     |
| `resolveLocalDriverConnectionString(url)` | Rewrites a drifted URL's host to `127.0.0.1`, preserving scheme, credentials, path and query; carries a non-default port as `?port=` |
| `resolvePoolOptions(env)`                 | Returns pool options with the rewrite applied, or the untouched options when there is no drift                                       |

`buildPostgresAdapterArgs` now uses `resolvePoolOptions` instead of `resolvePostgresPoolOptions`.

The non-default-port trick works because `pg` prefers `options.port` over the URL port (`pg/lib/connection-parameters.js`), so `postgres://…@127.0.0.1:5432/db?port=5433` still opens plain TCP to 5433.

**Production impact: none.** For every remote/Neon URL, `usesDriftedLocalHost` is `false`, so `resolvePoolOptions` returns the identical object and `forceUseVercelPostgres` is still never set. This is asserted by tests that compare adapter args byte-for-byte for remote hosts.

**Residual limitation, stated plainly:** this is a repo-side mitigation of a third-party behaviour. Code that constructs the adapter _without_ `buildPostgresAdapterArgs` / `resolvePoolOptions` still drifts. `src/payload.config.ts` currently builds its arguments inline (line 308) rather than through the builder, so the fix is **not** yet wired into the running application config — see §5.

---

## 2. Reproducible PostgreSQL 16 test environment

### 2.1 Why not reuse `docker-compose.yml` as-is

`docker-compose.yml` runs the **application** container alongside Postgres and mounts the repo. For integration tests that is wrong: it couples tests to a dev server, binds host 5432, and uses the `postgres` alias that triggers the driver issue. It is fine for manual development; it is not the test fixture.

**Decision:** reuse the same image (`postgres:16-alpine`), credentials and database conventions — no second database architecture — but expose the test server on a **dedicated host port (5433)** with **no application container**. The repo already uses this shape in `.github/workflows/ci.yml` (a `postgres:16-alpine` service).

### 2.2 Option A — Docker or Podman (any OS)

```bash
docker run --name pocms-pg16-test \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pocms_test \
  -p 127.0.0.1:5433:5432 \
  -d postgres:16-alpine
```

Podman: replace `docker` with `podman`, same flags.

Wait for readiness:

```bash
docker exec pocms-pg16-test pg_isready -U postgres -d pocms_test
```

Then:

```bash
export POSTGRES_TEST_URL='postgres://postgres:postgres@127.0.0.1:5433/pocms_test'
export PAYLOAD_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
pnpm test:int:pg
```

Teardown:

```bash
docker rm -f pocms-pg16-test
```

### 2.3 Option B — Windows 11, native PostgreSQL 16

No Docker required.

1. **Install PostgreSQL 16.** Download the installer from <https://www.postgresql.org/download/windows/>, or use winget:
   ```powershell
   winget install PostgreSQL.PostgreSQL.16
   ```
   Accept the default port **5432**, or use 5433 if 5432 is already taken. Keep the superuser password you set.
2. **Add `bin` to PATH** if the installer did not (typically `C:\Program Files\PostgreSQL\16\bin`), so `psql` and `pg_isready` work:
   ```powershell
   $env:Path += ';C:\Program Files\PostgreSQL\16\bin'
   ```
3. **Verify the version is 16** — this matters, because the harness asserts it:
   ```powershell
   psql --version
   ```
4. **Create the disposable database.** The name **must contain `pocms_test`** or the harness refuses to run:
   ```powershell
   psql -U postgres -h 127.0.0.1 -p 5432 -c "CREATE DATABASE pocms_test;"
   ```
5. **Set the environment for the session.** Use `127.0.0.1`, not `localhost`, to sidestep IPv6/`::1` resolution differences:
   ```powershell
   $env:POSTGRES_TEST_URL = 'postgres://postgres:postgres@127.0.0.1:5432/pocms_test'
   $env:PAYLOAD_SECRET   = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
   ```
6. **Run the suite:**
   ```powershell
   pnpm test:int:pg
   ```
7. **Clean up.** The suite drops and recreates the database itself, and drops it again in teardown. To remove it entirely:
   ```powershell
   psql -U postgres -h 127.0.0.1 -c "DROP DATABASE IF EXISTS pocms_test;"
   ```

> **Windows note:** if `psql` reports `no pg_hba.conf entry`, add `host all all 127.0.0.1/32 scram-sha-256` to `pg_hba.conf` and reload the service. If it reports the database is in use, close other `psql` sessions — the harness terminates stale backends but cannot drop a database another client holds a connection to.

### 2.4 Option C — no container, no service (`initdb`)

Only if neither of the above is possible; a throwaway cluster in a temp directory:

```bash
initdb -D /tmp/pocms-pg16 -U postgres --auth=trust
pg_ctl -D /tmp/pocms-pg16 -o "-p 5433 -k /tmp" -l /tmp/pocms-pg16.log start
createdb -h 127.0.0.1 -p 5433 -U postgres pocms_test
export POSTGRES_TEST_URL='postgres://postgres@127.0.0.1:5433/pocms_test'
pnpm test:int:pg
pg_ctl -D /tmp/pocms-pg16 stop
```

### 2.5 Required environment variables

| Variable                                                              | Required               | Purpose                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_TEST_URL`                                                   | **Yes**                | Disposable target. Loopback host only; database name must contain `pocms_test`. `POSTGRES_URL` is deliberately **not** read.                                                               |
| `PAYLOAD_SECRET`                                                      | Yes (≥16 chars)        | Payload boot. The pg setup substitutes a placeholder only if absent, which is not recommended for anything beyond a throwaway.                                                             |
| `NODE_ENV`                                                            | Set by Vitest (`test`) | Do not override.                                                                                                                                                                           |
| `PAYLOAD_DB_PUSH`                                                     | No                     | Under `NODE_ENV=test` the adapter disables schema push. The pg suite creates schema by booting Payload against an empty database; see §5 for why this needs confirmation on a real server. |
| `POSTGRES_URL`                                                        | **Not used**           | Intentionally ignored by `test:int:pg`.                                                                                                                                                    |
| `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEON_API_KEY`, `WHATEVER` | No                     | Optional integrations; the suite does not exercise them.                                                                                                                                   |

Nothing here is committed. `.env` stays git-ignored; export variables in the shell instead.

---

## 3. Fail-closed integration test design

### 3.1 The behaviour being separated

`tests/int/api.int.spec.ts` probes the database and calls `ctx.skip()` when it is unreachable. On a machine with no database, `test:int` therefore passes with a skipped test. That is a valid choice for a portable unit suite, and **it is preserved untouched**.

The problem is that a green `test:int` cannot tell you whether database behaviour works. `test:int:pg` is the separate, strict contract.

### 3.2 Guard rails

`tests/integration/postgresHarness.ts` refuses to proceed unless all of the following hold:

| Guard                                             | Refusal reason                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `POSTGRES_TEST_URL` is set                        | Never falls back to `POSTGRES_URL`, so a production string cannot be targeted |
| Host ∈ {`localhost`, `127.0.0.1`, `::1`, `[::1]`} | A remote or managed database can never be the disposable target               |
| Database name contains `pocms_test`               | Lifecycle operations DROP tables; an unmarked name is refused                 |
| Server reachable (`SELECT 1`)                     | No silent skip                                                                |
| `server_version_num` major = 16                   | A 13/14/15/17 server fails loudly                                             |

Failures throw `IntegrationEnvironmentError` from `failClosedSetup.ts` in `beforeAll`, so Vitest reports a failed file and never runs the specs.

### 3.3 Lifecycle

- **Before:** terminate stale backends → `DROP DATABASE IF EXISTS` → `CREATE DATABASE`. Always starts empty.
- **During:** boot real Payload, exercise real request handling.
- **After (`afterAll`):** `payload.db.destroy()` → `DROP DATABASE IF EXISTS`. Nothing leaks between runs, and a crashed run is cleaned by the next run's recreate.

Note: `payload.db.destroy()` only resets in-memory adapter state; it does not close the underlying `pg` pool. The database drop terminates remaining backends to compensate.

### 3.4 Verified failure paths (executed)

| Case                                    | Result                                              |
| --------------------------------------- | --------------------------------------------------- |
| `POSTGRES_TEST_URL` unset               | exit 1, "POSTGRES_TEST_URL is not set"              |
| Remote Neon host                        | exit 1, "not an allowed integration host"           |
| Database without `pocms_test`           | exit 1, "does not contain the required marker"      |
| Valid-looking target, nothing listening | exit 1, "Cannot reach PostgreSQL at 127.0.0.1:5433" |

### 3.5 Not verified

The **success path** — real Payload boot against a real PostgreSQL 16, schema creation, and the three integration assertions — **has not run**. No server was available. See §5.

---

## 4. Request-context requirements for a future real HTTP proof

Research only. `/api/fgql` is not implemented, and nothing below is claimed as verified.

### 4.1 The classification predicate

`payload/dist/utilities/createPayloadRequest.js`:

<!-- prettier-ignore -->
```js
    const isGraphQL = !config.graphQL.disable && pathname === formatAdminURL({
        apiRoute: config.routes.api,
        path: config.routes.graphQL
    });
```

Executed against the real config, this yields `"/api/graphql"` as the only matching pathname. `/api/fgql`, `/api/graphql/` (trailing slash) and `/api/form-submissions` all classify as REST.

### 4.2 Everything that keys off `isGraphQL` / `payloadAPI`

| File                                 | Line     | Behaviour                                                  |
| ------------------------------------ | -------- | ---------------------------------------------------------- |
| `utilities/createPayloadRequest.js`  | 65, 83   | sets `payloadAPI`, forwards `isGraphQL` to auth            |
| `auth/executeAuthStrategies.js`      | 13       | passes `isGraphQL` to every strategy                       |
| `auth/strategies/jwt.js`             | 42, 103  | `depth: isGraphQL ? 0 : collection.config.auth.depth`      |
| `auth/strategies/apiKey.js`          | 43       | same depth switch                                          |
| `collections/operations/find.js`     | 114, 139 | `joins: payloadAPI === 'GraphQL' ? false : sanitizedJoins` |
| `collections/operations/findByID.js` | 94       | same joins switch                                          |
| `auth/operations/me.js`              | 14       | `pathname === '/api' + config.routes.graphQL`              |
| `auth/operations/refresh.js`         | 37       | `pathname === config.routes.graphQL`                       |

Two facts that constrain any adapter:

1. **`me.js` and `refresh.js` classify independently**, and disagree with each other — one prefixes `/api`, one does not. Satisfying only `createPayloadRequest` is insufficient.
2. **`graphql-http` ignores the URL path.** `graphql-http/lib/use/fetch.js` reads only method, headers and body. So a naive mount elsewhere _executes fine_ while Payload classifies the request as REST. That is the failure mode a proof must catch.

### 4.3 What a real proof must assert

Against a real PostgreSQL 16, with a real Payload instance — not mocks:

1. `req.payloadAPI === 'GraphQL'` for the alternate pathname, observed from inside the real request.
2. Auth strategies received `isGraphQL: true`, and auth `depth` is `0`.
3. `req.context`, `locale`/`fallbackLocale`, `query` and DataLoader state equal those of a request to `/api/graphql`.
4. `find`/`findByID` disable joins (`payloadAPI === 'GraphQL'`).
5. Anonymous access decisions and restricted-field behaviour match `/api/graphql`; no `overrideAccess` introduced.
6. Arbitrary query text, every mutation (including `createFormSubmission`), introspection regardless of `NODE_ENV`, batching, draft access and unbounded variables are all rejected.
7. REST `/api/form-submissions` still works, and `/api/graphql` still returns 401/403/200 exactly as Phase 1 established.

**Mocked tests cannot satisfy any of these.** They establish wrapper and dispatch behaviour only.

---

## 5. Remaining blockers

1. **No PostgreSQL 16 executed.** The success path of `test:int:pg` is unproven. This is the single hard prerequisite to close Phase 2A.
2. **Schema bootstrap under `NODE_ENV=test` is unconfirmed.** The adapter sets `push: false` when `NODE_ENV === 'test'` and `PAYLOAD_DB_PUSH !== 'true'`, and there are no tracked migrations (`src/migrations` does not exist). The pg spec currently assumes booting Payload against an empty database creates the schema; that assumption must be verified on a real server, and may require setting `PAYLOAD_DB_PUSH=true` deliberately or pre-pushing the schema.
3. **The driver fix is not wired into `src/payload.config.ts`.** The config builds its adapter arguments inline at line 308 rather than calling `buildPostgresAdapterArgs`, so `resolvePoolOptions` does not currently affect the running app. Switching it over is a one-line change but was left out of Phase 2A's scope to avoid altering production DB wiring in the same step as establishing the foundation.
4. **`me.js` / `refresh.js` inconsistency** is documented but undecided.
5. **External consumer inventory and deployed commit SHA** remain unknown (Vercel connector disconnected).

---

## 6. What Phase 2A did not do

No new GraphQL endpoint. No `/api/fgql`. No anonymous GraphQL. No persisted queries. No change to the existing Admin gate, REST catch-all, public form-submission permissions, access policies, schema, generated artifacts, authentication semantics, or frontend behavior. No existing test weakened, no timeout lowered, no test skipped to obtain a pass. No CI triggered.
