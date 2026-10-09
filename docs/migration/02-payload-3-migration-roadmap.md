# 02 — Payload 3 migration roadmap

Goal: serve the vTarikhi resume site from the Payload 3 application in this repository, with
all content read from Payload collections and globals, and with the existing visual design,
DOM structure, and interactive behaviour preserved.

Companion documents:
- [01 — Architecture analysis](./01-vtarikhi-architecture-analysis.md) (what exists today)
- [03 — Refactoring specification](./03-refactoring-specification.md) (file-level plan, decisions, implementation sets)

## 1. Starting point

| Item | State |
| --- | --- |
| Payload | `payload` / `@payloadcms/*` **3.90.2** (the current npm `latest`) |
| Next.js | **16.3.3** (App Router). `next` latest on npm is 16.4.0; the repo pin is kept |
| React | 19.2.6 |
| Frontend route | `src/app/(frontend)/` is still the Payload blank template (`page.tsx`, `styles.css`) |
| Admin route | `src/app/(payload)/` (Payload admin and API routes) |
| Collections | `users`, `about`, `header`, `articles`, `certificates`, `educations`, `experiences`, `projects`, `services`, `skills`, `media` |
| Globals | `footer` (`Navigation` and `SiteSettings` exist as empty, 0-byte files) |
| Seed | `src/seed/*` already writes vTarikhi content into the collections (`pnpm seed`) |
| Package manager | pnpm. `pnpm-workspace.yaml` uses the `allowBuilds` key, which pnpm 9 rejects. **Use pnpm 10 or 11** (verified: pnpm 11.28.5 installs the lockfile) |

The data model is mostly ready. The migration is therefore primarily a **data-access and presentation port**,
not a schema redesign. The exceptions are listed in 03 §4 as decisions.

## 2. Target architecture

```
                    ┌────────────────────────── Payload 3 (same Next.js process) ───────────────────────────┐
  Browser  ──GET /──▶ src/app/(frontend)/page.tsx   (Server Component, public, cacheable)                     │
                    │      │                                                                                  │
                    │      ▼                                                                                  │
                    │  src/app/(frontend)/lib/portfolio/getPortfolioContent()   ← cached (unstable_cache, tag "portfolio")   │
                    │      │                                                                                  │
                    │      ▼                                                                                  │
                    │  payload-source.ts  →  getPayload({ config: @payload-config })  →  Local API find()     │
                    │      │                                                                                  │
                    │      ▼                                                                                  │
                    │  mappers.ts  (Payload docs → framework-free view models in types.ts)                    │
                    │      │                                                                                  │
                    │      ▼                                                                                  │
                    │  src/app/(frontend)/components/portfolio/*  (presentational; props only; no JSON imports)              │
                    │      │   client islands: Navigation, TypingEffect, ProgressBar, ProjectsGrid,           │
                    │      │                   EmailReveal, BackToTop, BootstrapClient                       │
                    └──────┴──────────────────────────────────────────────────────────────────────────────────┘
                                 ▲
  Editors ──▶ /admin ──▶ collection/global save ──▶ afterChange / afterDelete hook ──▶ revalidateTag("portfolio")
```

Principles:

1. **Single data seam.** Components never import `database.json` or call Payload. They receive view models.
2. **Server by default.** Only interactive leaves are `'use client'`. The page itself stays a Server Component.
3. **Local API, not HTTP.** Payload documentation recommends the Local API for React Server Components
   (`getPayload({ config })` with `@payload-config`). This avoids a self-HTTP round trip and keeps types end-to-end
   through `src/payload-types.ts`.
4. **Explicit query semantics.** Every query sets `depth`, `sort`, and pagination explicitly. See §4.
5. **No request-scoped APIs on the public page.** Do not call `headers()`, `cookies()`, or `payload.auth()` on `/`.
   The current placeholder page does, which makes it dynamic. The public page must stay cacheable.
6. **Parity by construction.** Components keep the original markup and class names. Only the data source changes.

## 3. Payload 3 and Next.js patterns used

### 3.1 Data access (verified against the Payload Local API docs)

- Import the config once with `import config from '@payload-config'` and call `getPayload({ config })` in server code.
  In development Payload keeps HMR in sync with config changes. In production, `getPayload` disables HMR-specific handling.
- The Local API bypasses access control by default (`overrideAccess: true`). The site is public, so this is acceptable,
  but every collection must still declare `access.read` explicitly. All current content collections already do
  (`read: () => true`). Admin writes stay protected by the default `create`/`update`/`delete` rules.
- Pagination: a `find` without `pagination: false` or `limit: 0` returns **10 documents**. Payload docs state that
  `limit: 0` returns all matching documents and disables pagination, and that `pagination: false` with no limit returns all.
  The data layer must use one of these for the list collections (`skills`, `experiences`, `educations`, `certificates`,
  `articles`, `services`, `projects`). Otherwise lists will be silently truncated once content grows.
- Sorting: `defaultSort` is applied when no `sort` is passed, and a plain field name sorts ascending. The current
  `articles` and `certificates` defaults are therefore the wrong direction for articles (see F-11 in 01). The data
  layer always passes an explicit `sort`.
- Relationships and uploads: `depth: 1` resolves `profileImage`, `image`, and `uploadImages` to Media objects so that
  `url` and `sizes` are available. Use `depth: 1` rather than the default, to avoid over-fetching.
- Singletons: `header` and `about` are collections. The data layer uses `limit: 1` and treats a missing document as `null`.
  Converting them to globals is decision D-2 in 03.

### 3.2 Caching and revalidation (Next.js 16.3.3 APIs, verified in the installed package)

- The installed Next 16.3.3 exports `unstable_cache`, `cacheTag`, `cacheLife`, `updateTag`, and
  `revalidateTag(tag, profile)`. The second argument of `revalidateTag` is a cache-life profile (for example `'max'`)
  or `{ expire }`. Passing only the tag is a type error.
- `'use cache'` requires the top-level `cacheComponents` option. Enabling it changes how the whole app, including the
  Payload admin, is rendered. That is a larger risk than the benefit for this site.
  **Recommendation:** start with `unstable_cache` in `src/app/(frontend)/lib/portfolio/` (Set 6). Evaluate `'use cache'` separately.
- Invalidation: Payload global docs describe an `afterChange` hook as the place to "purge caches of your applications".
  Use the same mechanism on each content collection and global:
  - `afterChange` and `afterDelete` call `revalidateTag('portfolio', 'max')`.
  - Hooks run inside the save request, so keep them to a single `revalidateTag` call and catch and log any error so a cache failure never fails an editor's save.
- Images are not cached by the data layer. `next/image` optimizes them separately.

### 3.3 Rendering mode

| Route | Mode | Reason |
| --- | --- | --- |
| `/` | Static, refreshed by tag revalidation (the exact regeneration behaviour is verified in Set 6) | Public content, changes only when editors save |
| `/admin/*` | Dynamic | Payload admin |
| `/api/*`, `/api/graphql` | Dynamic | Payload |
| `/my-route` | Dynamic | Existing example route; leave unchanged |

## 4. Query contract (what the data layer must do)

| Source | Query | Notes |
| --- | --- | --- |
| `header` | `find({ limit: 1, depth: 1 })` | first doc or `null` |
| `about` | `find({ limit: 1, depth: 1 })` | first doc or `null` |
| `skills` | `find({ pagination: false, sort: 'order', depth: 0 })` | group by `group` in the mapper |
| `experiences` | `find({ pagination: false, sort: 'order', depth: 0 })` | |
| `educations` | `find({ pagination: false, sort: 'order', depth: 0 })` | join `institution` and `location` in the mapper |
| `certificates` | `find({ pagination: false, sort: 'issuedAt', depth: 1 })` | ascending, to match vTarikhi order |
| `articles` | `find({ pagination: false, sort: '-publishedAt', depth: 1 })` | newest first, to match vTarikhi order |
| `services` | `find({ pagination: false, sort: 'order', depth: 0 })` | |
| `projects` | `find({ pagination: false, sort: 'order', depth: 1 })` | |
| `footer` (global) | `findGlobal({ depth: 1 })` | `hiringCta` feeds the Services section (D-3) |

Every field the components need is selected explicitly where the collection is large. At the current content size,
selecting everything is acceptable, and the query shape is the contract.

## 5. Phased plan

| Phase | Sets | Output | Gate |
| --- | --- | --- | --- |
| **A. Foundation** | Set 1 | View models, mappers, Payload data source, unit tests, root tsconfig and ESLint exclude `vTarikhi/` | User approval |
| **B. Presentation port** | Sets 2–5 | Global CSS and assets, client islands, server sections, header and footer | Approval after each set |
| **C. Integration** | Set 6 | Home page composition, metadata and JSON-LD, caching and revalidation hooks | Approval |
| **D. Content and QA** | Set 7 | Seed fixes, Media sizes, icon options, HTML parity diff vs baseline, tests, README and docs | Approval; sign-off to retire `vTarikhi/` is a separate decision |

## 6. Verification strategy

| Level | Check | When |
| --- | --- | --- |
| Types | `tsc --noEmit` on the root project (must be clean; currently fails because of `vTarikhi/`, F-01) | Every set |
| Lint | `eslint .` with `vTarikhi/` excluded | Every set |
| Unit | Vitest, mappers only, using `database.json` as the oracle for display strings | Set 1 onwards |
| Build | `next build` with the root project, which needs `POSTGRES_URL` and `PAYLOAD_SECRET` set | Set 6 |
| Parity | HTML text and structure diff of `/` against the baseline snapshot in `/tmp/parity` (see 01 §0) | Sets 4–7 |
| E2E | Playwright. The existing `tests/e2e/frontend.e2e.spec.ts` asserts a template title that does not exist and currently fails (see §8). It is replaced in Set 7. | Set 7 |
| Runtime data | Seed against a real Postgres and load `/` | Set 6–7 (requires a database) |

## 7. Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-1 | Images blocked by `images.localPatterns` (F-02) | High if unhandled | High (no images) | Extend `localPatterns` in Set 2 and test `/images/*` through `next/image` |
| R-2 | Lists silently truncated at 10 | High if default pagination is used | High | Explicit `pagination: false` in every list query (§4) |
| R-3 | Wrong date order (ascending defaults) | Medium | Medium | Explicit `sort` in every query (§4) |
| R-4 | Public page becomes dynamic because of auth or `headers()` in layout | Medium | Medium | Ban request APIs on `/` (§2 principle 5); check build output for `ƒ` vs `○` |
| R-5 | Stale content after an editor saves | Medium | Medium | `revalidateTag` hooks (§3.2) |
| R-6 | Root `next build` type-checks `vTarikhi/` and fails (F-01) | Certain today | High | Exclude `vTarikhi/` in tsconfig (Set 1) |
| R-7 | Client-only libraries (Bootstrap JS, framer-motion) break server rendering | Medium | Medium | Client islands only; `'use client'` at leaves; `Collapse.getOrCreateInstance` instead of `require` |
| R-8 | Font download fails in restricted build environments | Certain in the sandbox | Low (build only) | Keep `next/font/google` (parity). Build in an environment with Google Fonts access, or switch to `next/font/local` if approved |
| R-9 | Editor enters a free-text icon name that renders nothing (F-13) | Medium | Low | Convert to `select` (Set 7) |
| R-10 | Payload admin changes after switching `(frontend)` layout | Low | Medium | Keep `(payload)` layout untouched; verify `/admin` in Set 6 |

## 8. Pre-existing issues found during analysis (not caused by the migration)

1. Root `tsc --noEmit` fails with 49 errors, all in `vTarikhi/components/` (F-01).
2. `tests/e2e/frontend.e2e.spec.ts` expects the title `Payload Blank Template` and the heading
   `Welcome to your new project.`. Neither exists in the current `(frontend)/page.tsx`, so the test already fails.
3. `src/seed/articles.ts` contains corrupted characters in one excerpt (F-15).
4. `pnpm-workspace.yaml` (`allowBuilds`) requires pnpm 10 or newer. The `pnpm` section in `package.json`
   (`onlyBuiltDependencies`) is ignored by pnpm 11 and emits a warning.
5. `docs/getting-started.md` and `docs/deployment.md` describe `.env` values, but no `.env.example` exists in the repo.
   The `PAYLOAD_SECRET`, `POSTGRES_URL`, and `BLOB_READ_WRITE_TOKEN` values are required for the app to function.
6. `vTarikhi/package-lock.json` is out of sync (F-18).
7. `pnpm lint` cannot run: `eslint.config.mjs` imports `@eslint/eslintrc`, which is not a declared dependency (F-23).

## 9. Environment prerequisites

| Variable | Needed for | Notes |
| --- | --- | --- |
| `PAYLOAD_SECRET` | Payload auth and seeding | Required by `pnpm seed` |
| `POSTGRES_URL` | `vercelPostgresAdapter` | Required to run the app, seed, or run integration tests |
| `BLOB_READ_WRITE_TOKEN` | `vercelBlobStorage` plugin, which is `enabled: true` | Without it, Media uploads fail. This affects the seed step that uploads images |
| Network access to `fonts.googleapis.com` | `next/font/google` at build time | Not available in this sandbox |

Set 1 does not need a database. Its unit tests are pure functions. Runtime checks of the data source need Postgres
(Set 6–7).
