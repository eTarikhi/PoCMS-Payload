# Phase 1 — GraphQL security status

**Status:** Partial; not production-ready. No public `/api/fgql` endpoint or persisted-query registry is enabled.

## Independently verified work

- `POST /api/graphql` authenticates the incoming headers through Payload's `getPayload({ config }).auth(...)` and applies `hasAnyRole`, matching `Users.access.admin`. Unauthenticated requests receive `401`; authenticated users without an Admin-panel role receive `403`. Payload's existing `GRAPHQL_POST(config)` handler is called unchanged only after authorization.
- `/api/graphql-playground` uses the same authorization gate. Payload continues to decide whether the Playground is served in the current environment. GraphQL CORS preflight still uses the existing `REST_OPTIONS(config)` handler.
- The Admin GraphQL inspector still targets `/api/graphql` and includes browser credentials by default. The REST catch-all, `/api/form-submissions`, frontend readers, draft preview, CustomCode, media, Live Preview, and PostgreSQL schema were not changed.
- New route tests exercise unauthenticated rejection, roleless-user rejection, access for a non-Administrator user with an assigned role, Playground protection, and unchanged OPTIONS delegation. Test doubles are used for Payload authentication and the Payload route handlers; these tests do **not** prove real request authentication or GraphQL execution.
- The existing anonymous-access/schema tests still characterize public reads, restricted fields, the form POST, and the `Mutation.createFormSubmission` surface. No mutation was issued, so form hooks, email, and other side effects were not triggered.

## Verification run

- Vitest: 18 focused tests passed (5 route-gate, 8 schema-contract, 5 access-contract).
- TypeScript: `tsc --noEmit` passed.
- Targeted ESLint and Prettier checks passed; `git diff --check` passed.
- These are unit/config/schema checks, not a database-backed GraphQL integration run.

## Blockers before public GraphQL or deployment

1. **External `/api/graphql` consumers are unknown.** The repository's README and API documentation advertised the route, and the Admin inspector uses it. Vercel access telemetry could not be inspected because the Vercel connector is disconnected and the deployment telemetry credentials are absent. Do not infer that third-party clients are absent. The new Admin gate is incompatible with anonymous clients; inventory and approve that change before deployment.
2. **No disposable PostgreSQL instance is available.** Docker, Podman, PostgreSQL tools, a listener on port 5432, and `POSTGRES_URL`/`DATABASE_URL` are unavailable. Payload 3.90.2 request initialization, anonymous resolver access, and GraphQL execution have not been tested against a real request/database.
3. **Do not mount `GRAPHQL_POST(config)` directly at `/api/fgql`.** The installed Payload 3.90.2 request initializer classifies a request at that non-configured path as REST. The adapter and its request-context/execution tests remain unimplemented. Therefore `/api/fgql` is intentionally absent.
4. **No public operation allowlist exists.** Do not accept public query text or enable a public route until the real request-context proof is complete and a server-controlled exact SHA-256 allowlist has executable rejection tests. `createFormSubmission` remains a potential anonymous side-effect mutation on the current broad GraphQL schema; it was inspected statically but never executed.
5. **Shared rate limiting is unverified.** No shared rate-limit backend or supported gateway protection has been demonstrated. This is a release blocker for any future public endpoint; no distributed rate-limiting claim is made.
