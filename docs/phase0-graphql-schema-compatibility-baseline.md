# Phase 0 — GraphQL schema and compatibility baseline

**Recorded:** 2026-11-10 (UTC)

**Scope:** schema generation, static GraphQL operation validation, access-contract characterization, and the existing Local API/cache baseline. This phase does not migrate readers or change production behavior.

## Starting point and scope guard

- Branch at start: `arena/4d099a79-pocms-payload`
- Audited starting HEAD: `9efab2f112f9e3c9016a4c7214122425b7322cd2`
- The branch matched that HEAD and was clean before Phase 0 work began.
- No REST route, GraphQL route authorization, Payload config/access rule, frontend reader, database schema, form client, draft-preview behavior, CustomCode behavior, Live Preview, or deployment was changed.
- The only tracked changes for Phase 0 are the test command, focused tests, and this report. Generated schema/type/import-map files remain ignored artifacts.

## Environment and reproducible schema generation

### Environment observed

- Node.js `v22.22.3`; `.nvmrc` specifies Node 22.
- Corepack `0.34.6`; pnpm was not initially on `PATH`. The repository setup guide and CI select pnpm 10, so the repository-approved route was `corepack pnpm@10` (`10.34.9`).
- npm `10.9.8` was present but was not used to install packages.
- `node_modules` was absent initially. `corepack pnpm@10 install --frozen-lockfile` completed successfully without changing `pnpm-lock.yaml`.
- Installed top-level versions verified after install: Payload `3.90.2`, `@payloadcms/graphql` `3.90.2`, `@payloadcms/next` `3.90.2`, GraphQL.js `16.14.2`, and Next.js `16.3.8`.

### Generator and artifact handling

- `scripts/generate.mjs` maps `graphql` to Payload's `payload-graphql generate:schema` command and sets `PAYLOAD_CONFIG_PATH=src/payload.config.ts`.
- When the corresponding environment variables are absent, the existing generator supplies non-production placeholder values for `PAYLOAD_SECRET` and `BLOB_READ_WRITE_TOKEN`; these are code-generation inputs only. The generated artifact contains no runtime environment dump or credential value.
- `package.json` already provides `generate:graphQLSchema`. Phase 0 adds `test:graphql-contract`, which regenerates the schema before running the focused tests.
- `schema.graphql` is explicitly ignored at `.gitignore:59` and is not tracked. It was deliberately left ignored; it must be regenerated from the checked-in config/script rather than committed as a generated artifact. `src/payload-types.ts` and `src/app/(payload)/admin/importMap.js` were also generated for the TypeScript check and remain ignored.
- `src/app/(frontend)/data/schema.json` is the existing Schema.org Person JSON-LD document; it is not the Payload GraphQL schema.

### Generated schema fingerprint

- Status: generated successfully from the current Payload config using the installed locked packages.
- `schema.graphql`: 51,703 lines, 1,274,417 bytes.
- SHA-256: `168f23604fa897ee3fbdf51f8ee03d982952b06380794077b2f6944858579ef3`.
- Two consecutive runs of `corepack pnpm@10 run generate:graphQLSchema` produced the same hash.
- GraphQL.js `buildSchema` and `validateSchema` accepted the generated SDL.
- The SDL is the complete Payload schema, not a public allowlist: it contains internal/admin roots, `Form.emails`, and a `Mutation` root. Field/collection access is enforced by Payload at execution time; schema presence alone is not an authorization decision.

## GraphQL schema and compatibility tests

Added `tests/int/graphql-schema-contract.int.spec.ts` and `tests/int/graphql-access-contract.int.spec.ts`, plus the `test:graphql-contract` package script.

The schema-contract test reads the freshly generated `schema.graphql` and constructs/validates read-only query documents from the current Local API projection constants in `payload-source.ts` and `PUBLIC_FORM_SELECT`. It discovers root fields, list result types, arguments, and input types from the generated schema instead of guessing GraphQL operation names or input type names. For Payload `where` values it maps the existing Local API `and`/`or` keys to the matching names discovered in the generated GraphQL input objects.

Validated coverage:

- Public globals: Header, Navigation, Footer, and the generated `SiteSetting` type.
- Home profile: About, Skill, Experience, Education, Certificate, and Service.
- Article and Project card, detail, feed, and slug projections, including published/legacy filters and `draft: false`.
- Media relationship metadata selected by the existing `MEDIA_PUBLIC_POPULATE` projection.
- Forms and Redirects, with the actual generated block and relationship unions exercised through inline fragments.
- Article/Project Lexical `content` fields as GraphQL `JSON` scalars.
- Collection-list `docs` envelopes, `pagination`, `limit`, and pagination metadata.
- The public Forms projection omits `emails`; every operation in the proposed read contract is a query, not a mutation.

The access-contract test loads the built Payload config without initializing a Payload runtime or database. It calls the configured anonymous access functions, verifies the restricted fields and draft-preview rejection path, checks that the browser form client still posts to `/api/form-submissions`, and records the existing form-submission GraphQL mutation surface. These are config/schema checks, not execution of GraphQL resolver requests.

## Verified access contract

| Resource                                                                                                         | Anonymous behavior verified from the configured access functions                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `header`, `site-settings`, `navigation`, `footer`                                                                | Public read returns `true`; writes remain role/capability controlled.                                                                                                                                                                                                                                                                                    |
| `about`, `experiences`, `educations`, `certificates`, `services`, `skills`, `media`, `forms`, `redirects`        | Public collection read returns `true`. This does not make their write operations public. `About` retains its special create-while-empty rule.                                                                                                                                                                                                            |
| `articles`, `projects`                                                                                           | Anonymous read returns the existing `PUBLISHED_OR_LEGACY_WHERE`: status `published` or status absent for pre-draft legacy rows. Anonymous `readVersions` is false. Users with `read` permission retain the configured draft/version access. The current frontend draft readers continue to call Local API with `draft: isDraft` and no `overrideAccess`. |
| `custom-code` global and raw code fields                                                                         | Anonymous global read/readVersions/update and code-field create/update are false. Global reads require `custom-code: read`; updates require Administrator `fullAccess` or both `custom-code: edit` and `manageCustomCode`. The existing frontend reader remains a Local API call with no `overrideAccess` and catches a denied read as `null`.           |
| `forms.emails`                                                                                                   | The field exists in the generated schema, but its field-level read check is `can(user, 'forms', 'read')`; anonymous read returns false. `PUBLIC_FORM_SELECT` and the proposed public read operation omit it.                                                                                                                                             |
| `users`, `roles`, `audit-logs`, `form-submissions`, `mail-*`, Payload system collections, and Payload jobs stats | Anonymous read is denied by the current configured access functions. More specifically, Users are admin-or-self; Roles are Administrator-or-owned-role; AuditLogs require `viewAuditLog`; mail collections use RBAC; Payload system collections retain their own scoped/authenticated access.                                                            |
| `form-submissions` writes                                                                                        | Anonymous `create` returns true; `read`, `update`, and `delete` are false. The browser still submits through REST at `/api/form-submissions`.                                                                                                                                                                                                            |

**Existing GraphQL mutation surface to address in Phase 1:** the generated schema has `Mutation.createFormSubmission`, and the `form-submissions` collection grants anonymous create. The current `/api/graphql` route exports `GRAPHQL_POST(config)` without an additional route-level role gate. This combination is a potential existing public GraphQL submission path; no mutation was issued in Phase 0, so runtime reachability and hook effects were not exercised. The existing submission hooks can send email and bridge submissions to Mail Inbox. Phase 0 did not alter this behavior. The intended migration contract contains no mutation; Phase 1 must explicitly prevent public mutations on the proposed read-only endpoint while leaving the browser REST form path unchanged.

The draft-preview endpoint continues to allow only a caller with collection `read` permission or a matching `PAYLOAD_SECRET` query secret before it runs its existing `overrideAccess: true` lookup. A no-user request without that secret returned 401 before `payload.find` was called in the focused test. No new access bypass was introduced.

## Existing Local API output and cache contract

Frontend server reads still use Payload Local API through `src/app/(frontend)/lib/payload-source.ts`; they are not REST calls. The current typed raw home result is assembled as:

```ts
{
  siteSettings: SiteSetting,
  navigation: Navigation,
  header: Header,
  about: About | null,
  skills: Skill[],
  experiences: Experience[],
  educations: Education[],
  certificates: Certificate[],
  articles: Article[],
  services: Service[],
  projects: Project[],
  footer: Footer,
  customCode: CustomCode | null,
}
```

`mapPortfolioContent` turns these documents into the existing presentation contract: `siteSettings`, `navigation`, nullable `header`, `headerStudio`, nullable `about`, `skills`, `experiences`, `educations`, `certificates`, `articles`, `services`, `projects`, nullable `footer`, and `customCode`. This is a source/type contract, not a captured database response; this environment has no content database.

Representative Local API reads/projections verified in source:

- Header, Navigation, Footer, and SiteSettings are separate `findGlobal` calls. Header and SiteSettings populate media with `url`, `alt`, `width`, `height`, `mimeType`, `blurDataURL`, `sizes`, `focalX`, and `focalY`.
- Home profile loads About with `limit: 1`; Skills, Experiences, Educations, Certificates, and Services are separate collection reads. The other profile lists use `pagination: false` with their existing sort order; Skills also disables joins.
- Article cards use `PUBLISHED_OR_LEGACY_WHERE`, `pagination: false`, sort `-publishedAt`, depth 1, and `ARTICLE_CARD_SELECT`. Project cards use the same filter, `pagination: false`, sort `_order`, depth 1, and `PROJECT_CARD_SELECT`.
- Article/Project detail readers use a slug filter, `limit: 1`, depth 2, and their detail projections. Public reads add the published/legacy predicate; draft reads retain the existing `draft: true` Local API path.
- Public forms use `pagination: false`, depth 1, sort `id`, and select `title`, `slug`, `fields`, submit/confirmation data, and redirect—never `emails`. Redirect reads select `from`/`to` and populate referenced Article/Project slugs.
- Local API collection `find` returns a result whose documents are read from `docs`; the frontend loaders often collapse it to an array or first-document-or-null. GraphQL collection queries instead return a list result object with `docs` and pagination fields, so a future adapter must unwrap `docs` and preserve explicit `pagination: false`/`limit` behavior. Payload defaults an omitted collection limit to 10 when pagination is enabled.

### Existing Next cache contracts

The readers are wrapped independently with `unstable_cache`; invalidation uses the current fine-grained tags in `revalidate.ts` and `revalidateTag(tag, 'max')`. The existing cache keys/tags must be preserved during any later reader replacement.

| Cached slice               | Key parts                                                    | Tags                                                                                                   |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| SiteSettings               | `portfolio-global-site-settings-v2`                          | `portfolio`, `portfolio:chrome`, `global:site-settings`                                                |
| Navigation                 | `portfolio-global-navigation-v2`                             | `portfolio`, `portfolio:chrome`, `global:navigation`                                                   |
| Header                     | `portfolio-global-header-v2`                                 | `portfolio`, `portfolio:chrome`, `global:header`, `home:header`                                        |
| Footer                     | `portfolio-global-footer-v2`                                 | `portfolio`, `portfolio:chrome`, `global:footer`                                                       |
| CustomCode                 | `portfolio-global-custom-code-v1`                            | `portfolio`, `portfolio:chrome`, `global:custom-code`                                                  |
| Home profile               | `portfolio-home-profile-v2`                                  | `portfolio`, `portfolio:home`, `home:profile`                                                          |
| Raw Article cards          | `portfolio-raw-article-cards-v2`                             | `portfolio`, `articles:list`, `home:articles`                                                          |
| Raw Project cards          | `portfolio-raw-project-cards-v2`                             | `portfolio`, `projects:list`, `home:projects`                                                          |
| Public forms               | `portfolio-public-forms-v1`                                  | `portfolio`, `forms:list`                                                                              |
| Redirects                  | `portfolio-redirects-v2`                                     | `portfolio`, `portfolio:redirects`                                                                     |
| Article detail / slug list | `portfolio-article-v4` + slug / `portfolio-article-slugs-v2` | `portfolio`, `articles:list`, `article:{slug}` for detail; slug list uses `portfolio`, `articles:list` |
| Project detail / slug list | `portfolio-project-v3` + slug / `portfolio-project-slugs-v2` | `portfolio`, `projects:list`, `project:{slug}` for detail; slug list uses `portfolio`, `projects:list` |

The full home loader fans out eight cached slices in a `Promise.all`; the profile slice itself fans out six Local API collection reads in a second `Promise.all`. Counting the call graph gives up to 13 Local API operations for a cold `getCachedPortfolioContent()` path (three globals, six profile reads, Article list, Project list, Footer, and CustomCode). This is a source-level concurrency estimate only—not a measured SQL statement count or whole-route request count. Cache options show tags but no explicit numeric `revalidate` interval; actual warm/cold hit behavior was not run.

## Measurements and blockers

| Measurement                                      | Result                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema generation size/hash                      | Measured artifact only: 51,703 lines, 1,274,417 bytes; SHA-256 above. This is not a GraphQL HTTP response size.                                                                                                                                                                                               |
| Cold/warm request latency                        | Not measured: no frontend/API runtime was started.                                                                                                                                                                                                                                                            |
| SQL statement count and Drizzle-selected columns | Not measured: no database connection or SQL capture. Source `select`/`populate` projections are listed above, but are not proof of emitted SQL.                                                                                                                                                               |
| Returned rows/response bytes                     | Not measured: no PostgreSQL dataset or live request.                                                                                                                                                                                                                                                          |
| Next cache hit/miss behavior                     | Not measured: cache wrappers were inspected, but no Next runtime/cache store was exercised.                                                                                                                                                                                                                   |
| Home-loader concurrency                          | Static call-graph estimate only: eight top-level cached loaders, six parallel profile reads, up to 13 Local API calls for that loader path.                                                                                                                                                                   |
| Pool resolver in this sandbox                    | No `POSTGRES_URL`, pool overrides, or replica variables were set. `resolvePostgresPoolOptions()` returned no connection string, `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 10000`, `maxUses: 7500`; no read replicas. This is the resolver's local fallback, not a connected/live pool. |
| PostgreSQL availability                          | `POSTGRES_URL`/`DATABASE_URL` were unset; no TCP listener was present on `127.0.0.1:5432`; `pg_isready` and Docker were unavailable. No database operation, migration, seed, SQL plan, production connection, or deployment was attempted.                                                                    |

The remote/serverless pool defaults in `src/lib/postgresAdapterConfig.ts` are `max: 4`, idle timeout `5,000` ms, connection timeout `30,000` ms, and `maxUses: 7,500`; they were not active in this environment. The active resolver fallback was **max 10**, not max 5.

## Remaining technical blockers / risks

1. A local PostgreSQL 16 database with a representative, disposable fixture dataset is required to capture actual Local API outputs, row counts, emitted SQL, latency, cache behavior, and end-to-end access enforcement. Those results must not be inferred from the schema test.
2. The generated SDL is broad and includes internal roots and mutations. `Form.emails` being absent from the intended operation is necessary but not a substitute for testing Payload's field access through the real GraphQL route.
3. The existing anonymous `createFormSubmission` access plus the un-gated `/api/graphql` handler is a potential public mutation surface. It was deliberately not changed because Phase 0 excludes GraphQL route authorization changes; it must be dealt with explicitly in route/security design before expanding public GraphQL use.
4. A direct `GRAPHQL_POST(config)` mounted at `/api/fgql` is not sufficient: with Payload's configured `/api/graphql` path, request creation classifies `/api/fgql` as REST (`payloadAPI: 'REST'`, `isGraphQL: false`). Phase 1 needs a tested adapter that preserves GraphQL request context, auth, validation, DataLoader, and transaction behavior. Do not create a second Payload config/schema casually; Payload's GraphQL schema cache is global.
5. No dedicated server-side depth/alias/cost limit or custom application IP rate limiter was established by the prior source audit. Any public persisted-query endpoint needs explicit query/variable bounds and an operational rate-limit decision; hosting/WAF behavior remains unverified.

## Precise Phase 1 plan (not executed)

1. **Bring up an isolated test database first.** Use a disposable local PostgreSQL 16 database and deterministic fixtures for all public globals/profile collections, published and draft Articles/Projects, media relationships, forms with notification targets, and both redirect reference types. Do not reuse a production URL. Capture the actual pool resolver output from the chosen test environment and keep secrets out of fixtures/logs.
2. **Prove the route request context before adding a public route.** Add a focused test around the installed `@payloadcms/next` handler/request creation showing that the proposed `/api/fgql` request is treated as GraphQL and retains the expected anonymous request, Payload access checks, validation, DataLoader, and transaction context. Implement a supported adapter based on that test; do not merely mount `GRAPHQL_POST(config)` at the new path and do not introduce `overrideAccess`.
3. **Establish the route boundary.** Keep `/api/[...slug]` and all Admin REST behavior unchanged. Make `/api/graphql` an explicitly Admin-gated GraphQL surface while preserving the Admin GraphQL UI. Add `/api/fgql` as POST-only and persisted-operation-only: allow only the validated public read operations; reject arbitrary query text, every mutation (including `createFormSubmission`), introspection, batching, draft access, credential-based elevation, and unbounded variables. Do not expose CustomCode, `Forms.emails`, internal collection roots, or submission mutations through the public allowlist.
4. **Port only approved read slices.** After the route tests pass, replace only the approved Local API reads behind the existing cache boundaries—principally `payload-source.ts` and the public form-read path in `forms-cache.ts`. Keep cache keys/tags and invalidation behavior stable. Translate list semantics explicitly (`pagination: false`, `limit: 1` for singleton-like About/detail reads, published/legacy filters, sort order, and `.docs` unwrapping). Keep form submission REST, draft readers/preview authorization, CustomCode Local API access, Live Preview, and media endpoints unchanged.
5. **Run parity and authorization tests against the disposable database.** For each fixture, compare existing Local API output and the proposed GraphQL result after the existing mapper. Assert public published rows only; anonymous draft, internal collection, CustomCode, and `Forms.emails` reads fail; public form submission remains REST; the public GraphQL allowlist contains no mutation. Verify the Admin GraphQL gate separately.
6. **Measure before and after on identical fixtures.** Record cold/warm latency, SQL/Drizzle statement counts and selected columns, returned rows and response bytes, cache hits/misses, and one-request/concurrent home-loader behavior. Use the resolver's actual pool values; do not set an assumed max of 5. Define comparison thresholds from the first real baseline rather than inventing performance claims now.
7. **Gate cutover and rollback.** Do not switch readers until schema/operation validation, database parity, access tests, and measured baseline comparisons pass. Keep the existing Local API reader path available behind a reversible switch for the initial rollout; roll back by returning to those readers without touching REST forms, draft preview, CustomCode, or Admin REST.

## Commands and results

Final focused verification:

| Command                                                                                                                    | Exit | Result                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm@10 install --frozen-lockfile`                                                                               |    0 | Installed from lockfile; no lockfile update.                                                                                                                                                      |
| `corepack pnpm@10 run generate:graphQLSchema` (twice)                                                                      |    0 | Generated identical schema hash both times.                                                                                                                                                       |
| `corepack pnpm@10 run generate:types`                                                                                      |    0 | Generated ignored `src/payload-types.ts` for type checking.                                                                                                                                       |
| `corepack pnpm@10 run generate:importmap`                                                                                  |    0 | Generated ignored Payload Admin import map required by the repository TypeScript check.                                                                                                           |
| `corepack pnpm@10 run test:graphql-contract`                                                                               |    0 | 2 files passed; 13 tests passed (8 schema-contract, 5 access-contract).                                                                                                                           |
| `corepack pnpm@10 exec eslint tests/int/graphql-schema-contract.int.spec.ts tests/int/graphql-access-contract.int.spec.ts` |    0 | No lint output/warnings.                                                                                                                                                                          |
| `corepack pnpm@10 exec tsc --noEmit`                                                                                       |    0 | Passed after the ignored types/import map were generated. The first attempt returned 2 only because the ignored Admin import map had not yet been generated; generation followed by rerun passed. |

The full `test:int` suite, E2E, build, live GraphQL request execution, PostgreSQL measurements, migrations, deployment, and remote CI were not run.
