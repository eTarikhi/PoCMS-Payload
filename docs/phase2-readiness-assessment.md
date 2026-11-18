# Phase 2 — Readiness assessment

**Status:** Assessment only. No application route, access policy, schema, authentication behavior, or frontend code was changed to produce this document. No public GraphQL endpoint, anonymous GraphQL endpoint, or persisted-query endpoint is enabled or authorized by it.

**Evidence labels used throughout:**

- **[VERIFIED-EXEC]** — produced by running a command in this environment; the command and result are recorded.
- **[VERIFIED-SRC]** — read from installed dependency or repository source, with the file and line recorded.
- **[CI CONFIG]** — read from `.github/workflows/ci.yml`; describes what CI would do, not what has passed.
- **[UNVERIFIED]** — not established by any evidence available here. Must not be promoted without new executable proof.

---

## 1. Repository state

| Item                | Value                                      | Evidence                                                                           |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Branch              | `arena/4d099a79-pocms-payload`             | **[VERIFIED-EXEC]** `git branch --show-current`                                    |
| HEAD                | `80d424bf2c430456d3c9fc3c2326a149a8e38ad1` | **[VERIFIED-EXEC]** `git rev-parse HEAD`                                           |
| Expected HEAD       | `80d424bf2c430456d3c9fc3c2326a149a8e38ad1` | Match                                                                              |
| Remote SHA          | `80d424bf2c430456d3c9fc3c2326a149a8e38ad1` | **[VERIFIED-EXEC]** `git ls-remote origin refs/heads/arena/4d099a79-pocms-payload` |
| Working tree        | clean                                      | **[VERIFIED-EXEC]** `git status --porcelain` (empty)                               |
| Upstream configured | no                                         | `git rev-parse @{u}` fails; use `git ls-remote`                                    |

Phase 0 and Phase 1 commits present:

| Commit    | Phase | Subject                                                                         |
| --------- | ----- | ------------------------------------------------------------------------------- |
| `9f3ba14` | 0     | `[skip ci] test: add Phase 0 GraphQL schema contracts`                          |
| `7fa2419` | 0     | `[skip ci] docs: record Phase 0 GraphQL baseline`                               |
| `0da9a37` | 1     | `[skip ci] feat: gate Payload GraphQL routes by Admin role`                     |
| `6b6eb0b` | 1     | `[skip ci] test: prove GraphQL route method dispatch cannot bypass Admin gate`  |
| `80d424b` | 1     | `[skip ci] docs: record Phase 1 GraphQL method matrix and unverified consumers` |

**Checkout divergence, disclosed:** on session start the local checkout was at `9efab2f` with the Phase 0/1 work present only as uncommitted files. Before touching anything, every one of the 14 modified/untracked files was compared byte-for-byte against `origin/arena/4d099a79-pocms-payload` and reported `IDENTICAL`; the branch was then fast-forwarded to `80d424b` and the temporary stash dropped. No history was rewritten and nothing was discarded. **[VERIFIED-EXEC]**

Dependencies were absent from `node_modules` and were reinstalled with `corepack prepare pnpm@10.15.0 --activate` + `pnpm install --frozen-lockfile`; `pnpm-lock.yaml` is unchanged. **[VERIFIED-EXEC]**

---

## 2. Current verified architecture

### 2.1 Runtime route configuration

Executing the real committed config through `tsx` produced these values: **[VERIFIED-EXEC]**

| Config key                              | Value                         |
| --------------------------------------- | ----------------------------- |
| `routes.api`                            | `"/api"`                      |
| `routes.graphQL`                        | `"/graphql"`                  |
| `routes.admin`                          | `"/admin"`                    |
| Combined GraphQL pathname               | `"/api/graphql"`              |
| `graphQL.disable`                       | `undefined` (GraphQL enabled) |
| `graphQL.disablePlaygroundInProduction` | `true`                        |
| `NEXT_BASE_PATH`                        | unset                         |
| `NEXT_TRAILING_SLASH`                   | unset                         |

There is exactly **one** GraphQL endpoint in the application: `POST /api/graphql`. `src/payload.config.ts:384-387` adds `validationRules: () => [NoProductionIntrospection]` and `disablePlaygroundInProduction: true`; `NoProductionIntrospection` (`src/payload.config.ts:395-408`) rejects `__schema`/`__type` only when `NODE_ENV === 'production'`. **[VERIFIED-SRC]**

### 2.2 Route exports as they exist today

`src/app/(payload)/api/graphql/route.ts` exports exactly `POST` (wrapped by `withPayloadAdminPanelAuthorization`) and `OPTIONS` (`REST_OPTIONS(config)`). `src/app/(payload)/api/graphql-playground/route.ts` exports exactly `GET` (wrapped). No `GET` export exists on the GraphQL route, and `@payloadcms/next` exports only `GRAPHQL_POST` and `GRAPHQL_PLAYGROUND_GET`. **[VERIFIED-SRC]**

### 2.3 Admin authorization behavior

`src/auth/requireAdminPanelAuthorization.ts` authenticates with `getPayload({ config }).auth({ headers: request.headers })` and then applies `hasAnyRole(user)` — the same predicate used by `Users.access.admin`. It returns `401` when there is no user, `403` when the user has no assigned role, and otherwise forwards the original `Request` to Payload's handler. Denials carry `Cache-Control: no-store`. **[VERIFIED-SRC]**

Note the policy is _role presence_, not full Administrator access: any user holding at least one role passes, and this is intentional and test-asserted. **[VERIFIED-EXEC]** (existing `graphql-route-access` spec)

### 2.4 HTTP method matrix (from Phase 1)

Established by mounting the real route exports in Next.js's own App Router route module and driving its real `handle()`, so the 405s come from Next.js dispatch: **[VERIFIED-EXEC]**

| Route                     | Method                                  | Behavior                                                | Executes GraphQL         |
| ------------------------- | --------------------------------------- | ------------------------------------------------------- | ------------------------ |
| `/api/graphql`            | `POST`                                  | 401 / 403 / forward to `GRAPHQL_POST(config)`           | Only after authorization |
| `/api/graphql`            | `GET`, `HEAD`, `PUT`, `PATCH`, `DELETE` | Next.js `405`, Payload never invoked                    | No                       |
| `/api/graphql`            | `OPTIONS`                               | `REST_OPTIONS(config)` → Payload `handleEndpoints` CORS | No                       |
| `/api/graphql-playground` | `GET`, `HEAD`                           | Admin gate, then Payload's environment check            | n/a                      |
| `/api/graphql-playground` | `PUT`, `PATCH`, `DELETE`                | Next.js `405`                                           | No                       |

### 2.5 Known internal GraphQL consumers

| Consumer                      | Location                                             | Reference form                             |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Admin GraphQL inspector       | `src/components/admin/views/GraphQL/index.tsx:32`    | endpoint `${routes.api}${routes.graphQL}`  |
| Admin Playground link         | `src/components/admin/views/GraphQL/index.tsx:21`    | `${routes.api}${routes.graphQLPlayground}` |
| DevTools menu Playground link | `src/components/admin/actions/DevTools/index.tsx:35` | same                                       |

The Admin inspector executes from the Admin surface, so it is expected to satisfy the gate. **[UNVERIFIED]** that the inspector's request actually carries a session that passes `hasAnyRole` at runtime — this was not exercised against a live server.

Frontend readers do **not** use GraphQL. They use the Payload Local API in `src/app/(frontend)/lib/hooks.ts`, `payload-source.ts`, and `forms-cache.ts`. Public form submission remains REST at `/api/form-submissions` via the form-builder plugin. **[VERIFIED-SRC]**

### 2.6 Deployment surface

- No `vercel.json` and no Vercel project config in the repository. Deployment is configured in Vercel project settings per `docs/deployment.md:3-17`.
- No `middleware.ts` / `src/middleware.ts`.
- No `rewrites()` or `redirects()` in `next.config.ts`; it configures only headers, images, webpack/turbopack, `allowedDevOrigins`, and `output: 'standalone'` when `DOCKER_BUILD=true`.
- Therefore there is no repository-controlled edge/rewrite/deny layer in front of `/api/graphql`. Any platform-level firewall, WAF, or rewrite rule would live entirely in Vercel settings. **[UNVERIFIED]** — not inspectable from here (`list_connector_tools` for `vercel` returned `disconnected` this session).

---

## 3. Deployment compatibility risks

### 3.1 Risk register

| #   | Risk                                                                                      | Status                                      | Impact                                                                                                      |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D1  | Anonymous or machine-token clients calling `POST /api/graphql` now receive `401`          | **[UNVERIFIED]** whether such clients exist | Breaking change for any such client                                                                         |
| D2  | Which commit is currently deployed to Vercel is unknown                                   | **[UNVERIFIED]**                            | Cannot say whether the gate is already live                                                                 |
| D3  | Vercel request logs / firewall events for `/api/graphql`                                  | **[UNVERIFIED]** — connector disconnected   | No evidence base for consumer inventory                                                                     |
| D4  | Vercel project firewall, WAF, or rewrite rules in front of the route                      | **[UNVERIFIED]**                            | Could mask or alter route behavior independently of the repo                                                |
| D5  | Admin inspector depends on a session that passes `hasAnyRole`                             | **[UNVERIFIED]** at runtime                 | Admin GraphQL tooling could regress                                                                         |
| D6  | Playground is disabled in production (`disablePlaygroundInProduction: true`)              | **[VERIFIED-SRC]**                          | Not a risk; confirms no production Playground surface to protect                                            |
| D7  | Production introspection is blocked only by a `NODE_ENV === 'production'` validation rule | **[VERIFIED-SRC]**                          | Preview/development deployments allow introspection; acceptable only because the whole route is Admin-gated |

### 3.2 Required Vercel access/log evidence (to close D1–D4)

None of the following is available in this environment. Each must be supplied by someone with Vercel project access:

1. **Production request logs** for `/api/graphql` covering a window long enough to include typical traffic (a full 30-day retention window if available), with status codes, request counts, and timestamps.
2. **Caller identity per request**: user-agent, source IP/ASN, and whether a `Cookie: payload-token` or Authorization header was present. This is what distinguishes "browser Admin UI" from "external client".
3. **Vercel Firewall / WAF event log** for the route, to establish whether any platform rule touches it.
4. **Project rewrite/redirect configuration as deployed**, to confirm no edge rule fronts the route.
5. **Inventory of API keys or service tokens** issued to external parties that might target Payload auth strategies (API-key strategy is enabled in Payload core).
6. **Confirmation of the deployed commit SHA**, to establish whether `0da9a37`+ is live.

### 3.3 Explicit non-claim

Repository search finds `/api/graphql` only in documentation, the Admin inspector/DevTools, and this session's tests. **This does not prove that no external consumer exists.** Absence of in-repository references is not evidence of absence of out-of-repository clients, and it must not be reported as such. Consumer inventory remains **[UNVERIFIED]** and is a release blocker for the Phase 1 gate.

---

## 4. PostgreSQL integration readiness

### 4.1 Existing Postgres 16 configuration

`docker-compose.yml` defines `postgres:16-alpine` with `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=pocms`, host port `5432`, a `pgdata` volume, and a `pg_isready` healthcheck; the `payload` service sets `POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` to `postgres://postgres:postgres@postgres:5432/pocms`. **[VERIFIED-SRC]**

**Important finding.** The adapter chooses its driver by hostname:

<!-- prettier-ignore -->
```js
// node_modules/@payloadcms/db-vercel-postgres/dist/connect.js
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

The Compose service hostname is `postgres`, which is **not** in that list, so inside Compose the adapter constructs a `VercelPool` (WebSocket-based `@vercel/postgres`) rather than a node-postgres `pg.Pool`. This is inconsistent with the repository's own pool-sizing helper, which _does_ treat `postgres` as local (`src/lib/postgresAdapterConfig.ts`, `LOCAL_POSTGRES_HOSTS`). **[VERIFIED-SRC]**

**Consequence for a disposable integration database:** use `127.0.0.1` or `localhost` in `POSTGRES_URL` so the adapter takes the plain `pg.Pool` path. Do not assume the Compose URL shape carries over.

### 4.2 Payload 3.90.2 database configuration

`src/payload.config.ts:308-318`: `vercelPostgresAdapter({ blocksAsJSON: true, push: NODE_ENV === 'test' ? PAYLOAD_DB_PUSH === 'true' : undefined, beforeSchemaInit: [phase1BeforeSchemaInit], migrationDir: <repo>/src/migrations, pool: resolvePostgresPoolOptions(), readReplicas: resolveReadReplicaUrls() })`. **[VERIFIED-SRC]**

Consequences that matter for a new integration harness:

- Under Vitest, `NODE_ENV` is `test` — confirmed by an executed probe returning `NODE_ENV= test`, `PAYLOAD_DB_PUSH= undefined`. **[VERIFIED-EXEC]** With `PAYLOAD_DB_PUSH` unset, `push` resolves to `false`, so `pushDevSchema()` is skipped (`connect.js`: push only when `NODE_ENV !== 'production' && PAYLOAD_MIGRATING !== 'true' && this.push !== false`). **A DB-backed Vitest run will not create the schema.** The schema must already exist, or `PAYLOAD_DB_PUSH=true` must be set deliberately.
- `migrationDir` points at `src/migrations`, which **does not exist** and has no tracked files (`findMigrationDir` falls back to the same path). **[VERIFIED-EXEC]** There is no tracked Payload migration ledger, so `payload migrate` is not a schema bootstrap path here.
- `connect()` installs extensions via `CREATE EXTENSION IF NOT EXISTS` for whatever `extensions` the adapter declares; the repository does not override that, and the actual extension set was not enumerated. **[UNVERIFIED]**

### 4.3 Existing integration test setup and its gaps

`vitest.config.mts` includes `tests/int/**/*.int.spec.ts` with a 60 s hook timeout and 30 s test timeout. `tests/int/api.int.spec.ts` is the only database-touching spec: it probes `POSTGRES_URL` with a 2.5 s (local) / 20 s (remote) connect timeout, and if unreachable it calls `ctx.skip()`. **[VERIFIED-SRC]**

Gaps that block "real Payload HTTP integration" today:

| Gap                              | Detail                                                                                                                                                                      | Evidence           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| No schema bootstrap              | `push` is `false` under Vitest; no tracked migrations                                                                                                                       | **[VERIFIED-SRC]** |
| No disposable database lifecycle | No create/drop of a per-run database, no truncate/reset between specs                                                                                                       | **[VERIFIED-SRC]** |
| Silent skip instead of failure   | Unreachable DB yields a green run with skipped tests                                                                                                                        | **[VERIFIED-SRC]** |
| Pool teardown unproven           | `payload.db.destroy()` is the Drizzle `destroy`, which only clears in-memory schema/enums/drizzle state and re-arms `initializing`; it does **not** end the underlying pool | **[VERIFIED-SRC]** |
| No HTTP-level test harness       | No spec drives the route through a real Next.js server with real Payload auth                                                                                               | **[VERIFIED-SRC]** |

### 4.4 What CI actually does

**[CI CONFIG]** In `.github/workflows/ci.yml`:

- The `validate` job declares **no** `services:` block, yet runs `pnpm run test:int` with `POSTGRES_URL: postgres://postgres:postgres@127.0.0.1:5432/pocms`. With no database listening, DB-dependent specs take the skip path. So the `validate` job provides **no** database-backed integration coverage, and its green state does not imply any.
- Only the `e2e` job declares a `postgres:16-alpine` service, then runs `pnpm run seed` with `NODE_ENV=development` (which pushes the schema) followed by Playwright.
- Neither job runs a Payload HTTP GraphQL request against a database.

Whether these workflows currently pass is **[UNVERIFIED]** — no CI was run or inspected, and none may be triggered by this work.

### 4.5 Minimum reproducible environment for real HTTP integration tests

Requirements, derived from the evidence above and from nothing else:

1. **PostgreSQL 16** reachable at a disposable database, addressed by `POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/<disposable_db>` — hostname must be `127.0.0.1`/`localhost` so the adapter uses `pg.Pool` (§4.1).
2. **`PAYLOAD_SECRET`** — at least 16 characters; 64-char hex recommended (`docs/deployment.md:9`, `.env.example:91`). `vitest.setup.ts` otherwise injects a placeholder.
3. **`NODE_ENV`** — `test` for Vitest, or `development` if schema push is wanted.
4. **`PAYLOAD_DB_PUSH=true`** — only if the harness intends Drizzle to push the schema itself; otherwise the schema must pre-exist. Under `NODE_ENV=test` this can prompt interactively on data-loss warnings (`pushDevSchema` calls `prompts`), so a pre-pushed schema is the safer path.
5. **`NEXT_PUBLIC_SITE_URL`** — not required for route-level tests, required by the app's URL composition generally.
6. **No cloud integrations required** — `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEON_API_KEY`, `CRON_SECRET`, etc. are optional; `.env.example` documents all 56 keys and their optionality. Note `src/payload.config.ts:388-392` constructs the Resend adapter with `apiKey: process.env.RESEND_API_KEY || ''`, so an empty key must not be treated as "email works".
7. **A schema bootstrap step** — because there are no tracked migrations, the only in-repo path that creates schema is `pnpm run seed` with `NODE_ENV=development`, or a deliberate `PAYLOAD_DB_PUSH=true` run.
8. **A real HTTP surface** — either `next dev`/`next build` + `next start` with a request client, or the Next.js route module driven directly with a real Payload instance behind it. The latter is cheaper but is _not_ full HTTP coverage; see §5.
9. **Git-ignored generated artifacts present before any suite runs.** This was demonstrated the hard way during this assessment: with a freshly installed `node_modules`, the contract suite failed with `ENOENT: no such file or directory, open '…/schema.graphql'` because the schema had not been generated. `pnpm run generate:graphQLSchema` (or `generate:all`) must precede the suites; `test:graphql-contract` already performs this internally. **[VERIFIED-EXEC]**

This environment has none of the runtime prerequisites: `docker`, `docker-compose`, `podman`, `psql`, `postgres`, `pg_ctl`, `pg_isready`, and `initdb` are all absent, no process listens on 5432, and `POSTGRES_URL`/`DATABASE_URL`/`PAYLOAD_SECRET` are unset with no `.env` file present. **[VERIFIED-EXEC]** No database integration is claimed, and none was executed.

---

## 5. Request-context proof requirements

The open question: **can an alternate GraphQL route preserve Payload's GraphQL request context?** Nothing below is implemented. `/api/fgql` does not exist and must not be added until tier 3 passes.

### 5.1 Tier 1 — source-code inspection (complete, read-only)

The classification predicate is exact string equality against one computed pathname:

<!-- prettier-ignore -->
```js
// payload/dist/utilities/createPayloadRequest.js
const isGraphQL = !config.graphQL.disable && pathname === formatAdminURL({
    apiRoute: config.routes.api,
    path: config.routes.graphQL
});
```

Executing that predicate against the real config gave: **[VERIFIED-EXEC]**

| Pathname                | `isGraphQL` | `payloadAPI` |
| ----------------------- | ----------- | ------------ |
| `/api/graphql`          | `true`      | `GraphQL`    |
| `/api/fgql`             | `false`     | `REST`       |
| `/api/graphql/`         | `false`     | `REST`       |
| `/api/form-submissions` | `false`     | `REST`       |
| `/api`                  | `false`     | `REST`       |

Downstream consumers of that classification, all **[VERIFIED-SRC]**:

| File                                 | Line     | What it keys on                                            | Consequence if misclassified           |
| ------------------------------------ | -------- | ---------------------------------------------------------- | -------------------------------------- |
| `utilities/createPayloadRequest.js`  | 65, 83   | sets `payloadAPI` and passes `isGraphQL` to auth           | —                                      |
| `auth/executeAuthStrategies.js`      | 13       | forwards `isGraphQL` to every strategy                     | —                                      |
| `auth/strategies/jwt.js`             | 42, 103  | `depth: isGraphQL ? 0 : collection.config.auth.depth`      | relationship depth differs             |
| `auth/strategies/apiKey.js`          | 43       | same depth switch                                          | same                                   |
| `collections/operations/find.js`     | 114, 139 | `joins: payloadAPI === 'GraphQL' ? false : sanitizedJoins` | joins executed when they should not be |
| `collections/operations/findByID.js` | 94       | same joins switch                                          | same                                   |
| `auth/operations/me.js`              | 14       | `pathname === '/api' + config.routes.graphQL`              | **hardcoded `/api` prefix**            |
| `auth/operations/refresh.js`         | 37       | `pathname === config.routes.graphQL`                       | **compares bare `/graphql`**           |

Two notes that must shape any adapter design:

1. `me.js` and `refresh.js` classify independently of `createPayloadRequest` and are **mutually inconsistent** (one prefixed with `/api`, one bare). An adapter that only satisfies the `createPayloadRequest` predicate will still misclassify inside those operations. This is a source fact, not a hypothesis.
2. `graphql-http`'s fetch handler (`graphql-http/lib/use/fetch.js`) ignores the URL path entirely — it only parses body/headers. So the _transport_ does not care about the mount point; **only Payload's own request classification does.** Mounting `GRAPHQL_POST(config)` elsewhere therefore yields working GraphQL execution with REST-classified request context. That is precisely the failure mode to prove against.

Tier 1 is sufficient to conclude: **a naive mount at `/api/fgql` is unsafe.** It is not sufficient to conclude anything about a properly written adapter.

### 5.2 Tier 2 — mock-based verification (not proof, and must not be reported as such)

Mocked tests can demonstrate the classification predicate and the wrapper's allow/deny logic. The existing `graphql-route-access.int.spec.ts` and `graphql-method-dispatch.int.spec.ts` are exactly this tier — Next.js dispatch is real, but Payload auth and the Payload handler are test doubles.

What tier 2 **cannot** establish, and therefore must never be cited for: that a real Payload instance classifies the request as GraphQL; that auth strategies actually receive `isGraphQL: true`; that `find` actually disables joins; that DataLoader, transaction, and locale context are intact; that access control behaves identically for anonymous callers; that no mutation is reachable.

Any new adapter test at this tier should be labelled as wrapper/classification coverage only.

### 5.3 Tier 3 — real HTTP integration verification (required; not done)

The proof must run against a real PostgreSQL 16 database with a real Payload instance, and must assert at minimum:

1. **Classification** — for the alternate pathname, `req.payloadAPI === 'GraphQL'` and the auth strategies received `isGraphQL: true`, observed from inside the real request (e.g. via an `afterError`/hook or resolver instrumentation), not inferred from a mock.
2. **Same-context equivalence** — for an identical query, the alternate route and `/api/graphql` produce equal `req.context`, `locale`/`fallbackLocale`, `query`, and DataLoader-bearing `req` state.
3. **Access parity** — anonymous access decisions and restricted-field behavior match `/api/graphql` exactly; no `overrideAccess` is introduced.
4. **Join/depth parity** — `find`/`findByID` observe `payloadAPI === 'GraphQL'` (joins disabled) and the GraphQL auth depth of `0`.
5. **Transport restrictions** — arbitrary query text rejected, every mutation (including `createFormSubmission`) rejected, introspection rejected regardless of `NODE_ENV`, batching and draft access rejected, unbounded variables bounded.
6. **No leakage** — no upload temp-file or transaction residue; `unlinkClientUploadTempFile` still runs on the error path.
7. **Untouched behavior** — REST `/api/form-submissions` still works anonymously, and `/api/graphql` still 401/403/200s exactly as Phase 1 established.

Tier 3 additionally requires resolving the §4.5 environment items and the `me.js`/`refresh.js` inconsistency (§5.1 note 1).

---

## 6. Go / no-go criteria for the next phase

### 6.1 Go criteria — all must be true before writing any adapter code

| #   | Criterion                                                                                                            | Current state                                           |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| G1  | Disposable PostgreSQL 16 reachable at `127.0.0.1`/`localhost`, schema bootstrapped, teardown proven                  | **NO** — no database tooling available                  |
| G2  | A DB-backed test harness exists that fails (not skips) when the database is absent                                   | **NO** — current specs skip                             |
| G3  | External `/api/graphql` consumer inventory obtained from Vercel logs, or explicitly accepted as unknown by the owner | **NO** — connector disconnected, telemetry inaccessible |
| G4  | Deployed commit SHA confirmed, so the Phase 1 gate's live status is known                                            | **NO**                                                  |
| G5  | `me.js` / `refresh.js` classification inconsistency understood and decided                                           | **PARTIAL** — documented, undecided                     |
| G6  | Tier 3 proof plan agreed, including the seven assertions in §5.3                                                     | **PARTIAL** — assertions enumerated, not agreed         |

### 6.2 No-go conditions — any one blocks the phase

- No disposable database, or a harness that can pass with the database down.
- Any claim of "request-context verified" resting on mocks or source reading alone.
- Any proposal to mount `GRAPHQL_POST(config)` at a new path without tier 3 evidence.
- Any public route enabled before a server-controlled exact allowlist exists with executable rejection tests.
- Any weakening of the existing Admin gate, method matrix, access rules, or schema to make an adapter easier.
- Any change to the REST catch-all, `/api/form-submissions`, frontend Local API readers, draft preview, CustomCode, Live Preview, or cache boundaries.

### 6.3 Recommended sequencing for the next phase

1. Stand up the disposable PostgreSQL 16 environment and a harness that fails loudly without it (§4.5, G1–G2).
2. Collect or formally waive the Vercel evidence in §3.2 (G3–G4).
3. Write the tier 3 proof _before_ the adapter, and require it to fail against a naive mount — that failing test is the specification (G6).
4. Only then implement the adapter, and re-run §5.3 items 1–7 plus the existing 33 Phase 0/1 tests, unchanged.

---

## 7. What this assessment did and did not do

**Did:** verified repository state; executed the real Payload config and the real classification predicate; read the installed Payload/Next/adapter sources with file and line references; inventoried helper mock and CI configuration; enumerated the exact deployment and database evidence that is missing.

**Did not:** modify any route, access policy, schema, generated artifact, authentication behavior, or frontend code; add dependencies; add a database architecture; implement `/api/fgql`; enable any public or anonymous GraphQL or persisted-query endpoint; run, trigger, or request any CI workflow; access unavailable credentials; fabricate telemetry; claim database integration, request-context verification, or absence of external consumers.
