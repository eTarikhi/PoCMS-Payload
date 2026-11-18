# Phase 1 — GraphQL security status

**Status:** Partial; not production-ready. No public `/api/fgql` endpoint or persisted-query registry is enabled, and this audit authorizes none.

This document separates what was **verified**, by which method, from what remains **unverified**. Do not promote an unverified item to a verified claim without a new executable check.

## Independently verified work

- `POST /api/graphql` authenticates the incoming headers through Payload's `getPayload({ config }).auth(...)` and applies `hasAnyRole`, matching `Users.access.admin`. Unauthenticated requests receive `401`; authenticated users without an Admin-panel role receive `403`. Only after authorization, the route enforces a 1 MiB cap over observed request-stream bytes; bounded requests are replayed to Payload's existing `GRAPHQL_POST(config)` handler, while oversized bodies receive `413`.
- `/api/graphql-playground` uses the same authorization gate. Payload continues to decide whether the Playground is served in the current environment. GraphQL CORS preflight still uses the existing `REST_OPTIONS(config)` handler.
- The Admin GraphQL inspector still targets `/api/graphql` and includes browser credentials by default. The REST catch-all, `/api/form-submissions`, frontend readers, draft preview, CustomCode, media, Live Preview, and PostgreSQL schema were not changed.
- Route tests exercise unauthenticated rejection, roleless-user rejection, access for a non-Administrator user with an assigned role, body-size enforcement after authorization, Playground protection, and unchanged OPTIONS delegation. Test doubles are used for Payload authentication and the Payload route handler; a separate no-database test executes a small operation with GraphQL.js. These tests do **not** prove real Payload resolver execution or production authentication.
- The existing anonymous-access/schema tests still characterize public reads, restricted fields, the form POST, and the `Mutation.createFormSubmission` surface. No mutation was issued, so form hooks, email, and other side effects were not triggered.

## HTTP method matrix — `/api/graphql`

**How this was verified (not assumed):** the real `src/app/(payload)/api/graphql/route.ts` module is mounted in Next.js's own App Router route module (`next/dist/server/route-modules/app-route/module`), and every request below is driven through that module's real `handle()` entry point. Next.js's `autoImplementMethods()` builds the dispatch table; it fills every method the route does not export with a 405 handler, and it only delegates HEAD to GET when a GET export exists. `tests/int/graphql-method-dispatch.int.spec.ts` asserts accordingly. The 405 statuses are produced by Next.js dispatch, not by the test.

| Method    | Verified behavior                                                                                                                          | GraphQL execution        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `POST`    | Admin gate (`401`/`403`); authorized body streams over 1 MiB receive `413`; otherwise bounded bytes are replayed to `GRAPHQL_POST(config)` | Only after authorization |
| `GET`     | Next.js dispatch answers `405`; no `GET` export exists                                                                                     | None                     |
| `HEAD`    | Next.js dispatch answers `405`; HEAD delegation to GET does not apply because there is no `GET` export                                     | None                     |
| `OPTIONS` | Explicit `REST_OPTIONS(config)` export, delegated to Payload `handleEndpoints` for CORS preflight                                          | None                     |
| `PUT`     | Next.js dispatch answers `405`                                                                                                             | None                     |
| `PATCH`   | Next.js dispatch answers `405`                                                                                                             | None                     |
| `DELETE`  | Next.js dispatch answers `405`                                                                                                             | None                     |

For the unsupported methods the tests also assert that Payload's `getPayload`/`auth` are never invoked and that neither the GraphQL handler nor the OPTIONS handler is called. In other words, no unsupported method reaches userland code at all.

## HTTP method matrix — `/api/graphql-playground`

| Method   | Verified behavior                                                                                                  | Playground served                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `GET`    | Admin gate: `401` anonymous, otherwise Payload's Playground handler, which still applies its own environment check | Only after authorization and only when Payload enables it |
| `HEAD`   | Next.js delegates HEAD to the existing `GET` export, so the same Admin gate runs                                   | Only after authorization                                  |
| `PUT`    | Next.js dispatch answers `405`                                                                                     | None                                                      |
| `PATCH`  | Next.js dispatch answers `405`                                                                                     | None                                                      |
| `DELETE` | Next.js dispatch answers `405`                                                                                     | None                                                      |

### Coverage boundary of the matrix

The matrix above is **route-dispatch** coverage. It proves that method routing cannot bypass the Admin gate and that unsupported methods produce Next.js's 405. It is **not** full HTTP integration coverage: no `next build`/`next start` smoke request, no deployed edge/proxy behavior, and no database-backed execution were exercised. Payload 3.90.2 request initialization, anonymous resolver access, and GraphQL execution remain untested against a real request and database (see blocker 2).

## Request-body limit and GraphQL operation-cost assessment

### Request-body limit

The request path is now explicitly bounded at this route, rather than relying on Next.js's 10 MiB clone/proxy setting:

1. `withPayloadAdminPanelAuthorization` runs first. `payload.auth` receives headers only; unauthenticated (`401`) and roleless (`403`) requests return before the route reads `Request.body` or enters GraphQL parsing.
2. For an authorized `POST`, `withGraphQLRequestBodyLimit` reads the body stream in chunks and counts each chunk's actual byte length. It never uses `Content-Length`. Its geometrically grown buffer never exceeds **1,048,576 bytes**; zero-length chunks are not retained. The first byte beyond the limit returns a JSON `413` and cancels the remaining stream without waiting for its cancellation promise. Growth can briefly retain the prior buffer plus the replacement buffer, and the stream source has already allocated the current chunk; neither is an unbounded body accumulation.
3. The `413` carries `Cache-Control: no-store`, sets `Vary: Origin`, and uses Payload's `headersWithCors` with the original request headers and configured CORS options. Responses delegated to Payload continue to retain any existing CORS and `Vary` headers through the existing no-store wrapper.
4. For accepted bodies, the bounded bytes are reattached to a replacement `Request` with the original URL, method, headers, and signal. Payload's GraphQL handler can then keep its existing flow: it clones the request, Payload JSON hydration reads its request with `req.text()`, and graphql-http parses POST JSON from the clone. No unbounded buffering or request-body double consumption is introduced by the route limiter.

The selected 1 MiB threshold is based on the repository's generated Admin documents, not a claim about all external consumers. A no-database evaluation of `documentQuery` for the 32 configured collections and globals combined found that the largest generated single-document, depth-5 query takes **248,394 JSON bytes** when serialized as a `{ "query": ... }` body (no per-request variables); the cap is about **4.2 times** that size, leaving roughly 800 kB for variables and other request fields. A client whose complete JSON request exceeds 1 MiB—including large variables, custom documents, or mutation inputs—will now receive 413. External-consumer telemetry is unavailable, so that compatibility risk must be considered before deployment. The Admin's depth-5 generation setting is not a server-side GraphQL depth limit.

The route-only cap is tested against exact-boundary and over-boundary bodies, missing/malformed/misleading `Content-Length`, streaming requests, cancellation, authorization precedence, CORS/no-store headers, successful delegated GraphQL responses, and unchanged OPTIONS/method dispatch. A separate GraphQL.js test executes `query { message }` against a local schema and root value without a database. The cycle suite builds a small in-memory schema through Payload's `configToSchema`, composes Payload's installed rules with graphql-http 1.23.1, and verifies validation responses, resolver non-execution, valid fragment reuse, the 1000 threshold, and the existing multi-operation behavior. These tests do not execute this application's real Payload schema/resolvers or database, and do not exercise a deployed Next.js proxy.

### Payload's AST complexity rule

Payload 3.90.2 already applies `graphQL.maxComplexity`, whose default is **1000**. This application does not override it. Payload builds the rule from `fieldExtensionsEstimator()` followed by `simpleEstimator({ defaultComplexity: 1 })`; generated relationship and join fields usually carry a static complexity of 10.

The AST rule is a useful coarse selection-size check, but it is not a reliable resolver-work budget:

- No dedicated maximum-depth validation rule is configured. Nested selections add to the complexity score, but `maxComplexity` is not a strict depth cap; the Admin's depth-5 generator setting applies only to its own documents.
- Each alias is visited and charged separately; repeated acyclic fragment spreads are expanded and charged at each spread. Variables are supplied to the rule for coercion and `@include`/`@skip`, but the installed estimators do not use list arguments such as `limit` to multiply cost.
- Relationship/join weights are static (normally 10) and are not multiplied by parent list cardinality. Payload's collection `find` resolver passes a client-supplied `limit` through; `pagination: false` can result in a zero limit, which the installed Postgres adapter treats as unbounded. The fallback field cost therefore does not account for result count, nested resolver fan-out, access hooks, collection hooks, database selectivity, or arbitrary custom resolver work.
- The rule receives variables but not the selected `operationName`. Its implementation visits and accumulates complexity for every operation definition in a document, so an unused expensive operation can cause a selected cheap operation to be rejected (a compatibility false positive), though this behavior does not provide a limit bypass.
- Production introspection is already disabled by Payload's default and this config's `NoProductionIntrospection` validation rule (`__schema`/`__type`). That does not bound ordinary resolver execution.
- In the unpatched Payload 3.90.2 package, a no-database reproduction with GraphQL 16.14.2 showed that a cyclic spread made the recursive complexity visitor throw `RangeError: Maximum call stack size exceeded`. graphql-http 1.23.1 appends Payload's rule to GraphQL.js `specifiedRules` (which include `NoFragmentCyclesRule`), but GraphQL.js runs the rules in a combined visitor and reporting an error does not stop other rules. Payload's `OperationDefinition` visitor recursively expands spreads and can throw during that same validation pass, so validation-rule ordering alone cannot protect it. The exception escapes validation and graphql-http's Fetch adapter returns an empty HTTP 500.
- The checked-in pnpm patch for `@payloadcms/graphql@3.90.2` tracks fragment names on the active recursion path and skips only a spread that would re-enter that path. It threads the same path through fields and inline fragments, then removes names on return, so direct/indirect/longer cycles are bounded while valid nested and reused spreads are still evaluated at each occurrence. The standard `NoFragmentCyclesRule` remains enabled and returns the client validation error; invalid documents do not reach execution. With `Accept: application/graphql-response+json`, graphql-http returns HTTP 400. This narrow cycle guard does not change the complexity estimator or make it a resolver-work budget.
- The selected-cheap plus unused-expensive two-operation case is also covered: Payload 3.90.2 does not pass `operationName` into its complexity rule and accumulates scores across all operation definitions, so the expensive unused operation still rejects the document. This existing compatibility behavior is intentionally unchanged.

**Recommendation:** keep Payload's existing default 1000 unchanged as defense-in-depth, but do not raise/lower it or claim it prevents expensive operations. The fragment-cycle patch is limited to terminating recursive cycle expansion; do not add a home-grown AST estimator or arbitrary depth/list/alias limits in this increment. A separate resolver-aware policy would need to account for collection limits, nested relationships and hook costs, while checking external-client compatibility. The size cap limits JSON bytes only: it does not bound expensive operations that fit within 1 MiB, slow uploads, authentication cost, or request rates. This increment is **not production DoS protection**.

## Verification run

- `pnpm run test:graphql-contract`: 53 focused tests passed (15 method-dispatch, 9 route/access, 10 body-limit/GraphQL.js, 8 schema-contract, 5 access-contract, 6 complexity/cycle).
- TypeScript: `tsc --noEmit` passed after generating the ignored Payload types/import map required by this clean clone.
- Targeted ESLint and Prettier checks passed; `git diff --check` passed.
- No Neon/database suite, live database, hosted CI, or GitHub workflow was run. These are unit/config/schema/route-dispatch checks, not a database-backed Payload GraphQL integration run.

## Unverified — external consumers

**External `/api/graphql` consumer compatibility remains UNVERIFIED.**

- Vercel telemetry and request logs are **inaccessible**: the Vercel connector is disconnected and no deployment telemetry credentials are present in this environment.
- Repository inspection does **not** establish whether external clients depend on GraphQL. The only in-repository references are documentation (`README.md`, `docs/api.md`, `docs/getting-started.md`, `docs/project-structure.md`), the Admin GraphQL inspector and DevTools links, this session's tests, and lockfile dependency entries. Those references describe and consume the route from inside the product; they say nothing about third-party or out-of-repository clients.
- The new Admin gate is therefore **incompatible with any anonymous client that may exist**. Absence of evidence is not evidence of absence: do not treat the repository search as proof that no external consumer exists.
- Inventory and approval of external consumers must happen before deployment. This audit does not and cannot supply that approval.

## Blockers before public GraphQL or deployment

1. **External `/api/graphql` consumers are unknown.** See the unverified section above; the gate must be reconciled with real consumer inventory before release.
2. **No disposable PostgreSQL instance is available.** Docker, Podman, PostgreSQL tools, a listener on port 5432, and `POSTGRES_URL`/`DATABASE_URL` are unavailable. Payload 3.90.2 request initialization, anonymous resolver access, and GraphQL execution have not been tested against a real request/database. `docker-compose.yml` defines `postgres:16-alpine`, but it cannot be started in this environment, and no integration result is claimed.
3. **Do not mount `GRAPHQL_POST(config)` directly at `/api/fgql`.** The installed Payload 3.90.2 request initializer classifies a request at that non-configured path as REST (`isGraphQL: false`, `payloadAPI: 'REST'`). The adapter and its request-context/execution tests remain unimplemented and **unverified**. Therefore `/api/fgql` is intentionally absent.
4. **No public operation allowlist exists.** Do not accept public query text or enable a public route until the real request-context proof is complete and a server-controlled exact SHA-256 allowlist has executable rejection tests. `createFormSubmission` remains a potential anonymous side-effect mutation on the current broad GraphQL schema; it was inspected statically but never executed.
5. **Shared rate limiting is unverified.** No shared rate-limit backend or supported gateway protection has been demonstrated. This is a release blocker for any future public endpoint; no distributed rate-limiting claim is made.

## Scope explicitly authorized by this audit

- Admin-gating the existing `POST /api/graphql` and `GET /api/graphql-playground` only.
- Enforcing the documented request-body cap on the existing authorized GraphQL POST only; OPTIONS, method dispatch, and unrelated REST routes remain unchanged.
- Regression coverage proving unsupported methods cannot execute GraphQL and cannot bypass the gate.

Nothing else. This audit does **not** authorize a public GraphQL endpoint, an anonymous persisted-query endpoint, an anonymous GraphQL route, or any change to REST, form-submission permissions, Payload access policies, the GraphQL schema, or generated artifacts.
