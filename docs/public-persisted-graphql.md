# Public persisted GraphQL surface — implementation & verification status

**Status: loopback PostgreSQL HTTP & Payload 3.90.2 integration gate verified; shared cross-instance rate limiting remains process-local unless enforced at the edge.** The repository includes an anonymous `POST /api/fgql` route, a fixed 16-operation server-owned read registry for public content, and frontend readers that dispatch those documents through Payload's GraphQL POST handler with authorized Local API fallbacks (`overrideAccess: false`).

## Public contract

`POST /api/fgql` accepts JSON with only an operation id and, for two detail reads, variables:

```json
{ "id": "public.article-detail.v1", "variables": { "slug": "example" } }
```

The 16 registered ids are:

- `public.site-settings.v1`
- `public.navigation.v1`
- `public.header.v1`
- `public.footer.v1`
- `public.projects-section.v1`
- `public.home-profile.v1`
- `public.article-cards.v1`
- `public.project-cards.v1`
- `public.article-detail.v1`
- `public.project-detail.v1`
- `public.article-slugs.v1`
- `public.project-slugs.v1`
- `public.article-feed.v1`
- `public.project-feed.v1`
- `public.forms.v1`
- `public.redirects.v1`

All collection roots, fields, filters, sorting, limits, draft behavior, and operation text are server-owned. Only article/project detail operations accept variables, exactly `{ slug }`, with a string length of 1–200 characters and no control characters. The route rejects arbitrary query text, unknown JSON keys, URL query parameters, batch arrays, non-JSON content, and unsupported methods. Operations are queries only; mutations, introspection, `CustomCode`, form notification recipients (`Forms.emails`), and form submissions are not in the registry. Form submission remains on the existing `POST /api/form-submissions` REST route.

Multi-row collection operations have a fixed server-side limit of 100; the `About` singleton and detail reads use fixed limits of 1. Server-side readers check `docs.length` against `totalDocs` before treating a list as complete; if a result is truncated or fails, they log the fallback via `logPersistedQueryFallback` and run the authorized Local API projection (`overrideAccess: false`), logging `logPersistedQueryFallbackFailure` if the fallback also fails. The response normalizer restores aliased union fields (`Text_defaultValue`), `blockType` markers, and Payload's `formatName`-encoded select enum option values (`front_end -> front-end`, `text_white -> text-white`, `_301 -> 301`) so raw documents and frontend mappers match Local API reads. Draft detail/preview reads and the privileged `CustomCode` read remain Local API paths, so public Next.js caches cannot contain unpublished drafts or restricted data. Cache keys and tags are unchanged.

## Media, images, documents, and folders boundary (REST preserved)

- **No binary or document retrieval over GraphQL:** Images, documents, and uploaded files are **not** served, downloaded, or streamed through GraphQL. All binary/file delivery remains on Payload's existing REST upload endpoint (`GET /api/media/file/:filename`), Vercel Blob URLs when configured, and static `/images/*` assets, alongside existing editor media endpoints (`GET /api/media-frame`, `GET /api/public-images`).
- **Folder and Media excluded as GraphQL data sources:** `Media` and `PayloadFolders` are not exposed as top-level queries in the persisted registry, `folder` / `_objectKey` fields are never selected, and `src/collections/Media.ts` (`folders: true`, upload sizes, WebP options, RBAC) and folder configurations are completely unchanged.
- **Why relational `Media` subselections include `filename`:** Where public content documents (`SiteSetting`, `Header`, `About`, `Certificate`, `Article`, `Project`) reference an uploaded `Media` relation, the subselection includes `filename` strictly as metadata alongside `url`, `alt`, `width`, `height`, `mimeType`, `blurDataURL`, `focalX`, `focalY`, and `sizes`. In Payload 3.90.2 (`payload/dist/uploads/getBaseFields.js` -> `generateFilePathOrURL`), `Media.url` and `Media.sizes.<variant>.url` are computed in `afterRead` from `data.filename || originalDoc.filename` (`'/api/media/file/' + encodeURIComponent(filename)`). Selecting `filename` in both the GraphQL subselection and `MEDIA_PUBLIC_POPULATE` is strictly required so Payload's `afterRead` hook preserves the existing REST file URLs rather than returning `url: null`.

## Request handling and limits

The public route is POST-only, returns `Cache-Control: no-store`, and applies the existing 1 MiB GraphQL actual-byte body cap and 15-second body-read deadline plus an anonymous process-local token bucket. That bucket is global per loaded route module/worker, not per-client and not a distributed/global cross-instance rate limiter; serverless cold starts and multiple Node workers maintain independent buckets unless paired with edge/gateway rate limiting. The request dispatcher retains only `Origin` and `Accept-Language`, deliberately strips cookies and `Authorization`, and rewrites the internal `Request` pathname to Payload's configured `/api/graphql` pathname before calling `GRAPHQL_POST` so Payload's pathname-based GraphQL classification runs cleanly.

The existing Admin-gated `POST /api/graphql`, `GET /api/graphql-playground`, and Admin REST catch-all (`/api/[...slug]`) routes remain unchanged; Admin GraphQL continues to require an authenticated user accepted by `Users.access.admin`.

## Verification completed

### 1. Static schema, contract, and unit checks

- `pnpm test:graphql-contract` (157 tests across 10 files) and full `pnpm test:int` (333 tests across 35 files) covering schema validity against `schema.graphql`, single-query registry enforcement, exclusion of `Media`/`PayloadFolder`/`CustomCode`/`FormSubmissions` root queries and `folder`/`emails` fields, variable/slug bounds, union & enum normalization, response-envelope completeness, process-local anonymous rate limiting, Admin GraphQL route/access/resource-limit contracts, and all frontend/CMS suites.
- `pnpm generate:all`, `tsc --noEmit`, ESLint, and Prettier check completed cleanly.

### 2. Real loopback PostgreSQL HTTP & Payload 3.90.2 integration proof (`pnpm test:int:postgres`)

Executed against an isolated disposable PostgreSQL 18.7 database on `127.0.0.1` via `POSTGRES_LOCAL_TEST_URL` (`tests/integration/persistedGraphqlPostgres.postgres.int.spec.ts`, no Neon or production database touched, zero mocks on Payload's GraphQL handler or PostgreSQL adapter) and cross-checked against a live Next.js HTTP server:

1. **Request context & credential stripping**: Instrumentation on `payload.authStrategies` and `Articles.config.access.read` during real HTTP `POST /api/fgql` calls carrying a valid signed Administrator `Cookie` and `Authorization: JWT ...` confirmed `isGraphQL === true`, `req.payloadAPI === 'GraphQL'`, `req.pathname === '/api/graphql'`, `req.user === null`, `Cookie`/`Authorization` absent on the internal request, `Origin` and `Accept-Language` preserved, `req.payloadDataLoader.load` populated, and `req.transactionID === null` on read operations.
2. **Access, restricted-surface isolation & REST media boundary**: All 16 registered operations succeeded over HTTP with `200` and `Cache-Control: no-store`. Synthetic unpublished `Articles` and `Projects` drafts were excluded from list, slug, feed, and detail responses; `Forms.emails` was absent from `public.forms.v1`; `CustomCode` private markup and `form-submissions` were unreachable through `/api/fgql`; populated `Media` relations preserved `/api/media/file/<filename>` URLs while actual image bytes continued to be served via REST `GET /api/media/file/<filename>`.
3. **Zero-fallback parity with Local API**: Every frontend reader (`getPortfolioContent`, `getSiteChromeContent`, `getPublishedArticlesList`, `getPublishedProjectsList`, `fetchPublishedArticleSlugs`, `fetchPublishedProjectSlugs`, `fetchArticleBySlug`, `fetchProjectBySlug`, `fetchPublishedForms`, `fetchRedirects`, `fetchFeedSourceDocs`) matched the authorized Local API mappers, 301/302 redirects, sitemap entries, and RSS XML with spies asserting zero calls to `logPersistedQueryFallback` or `logPersistedQueryFallbackFailure`. Draft preview (`{ draft: true }`) continued to resolve unpublished drafts via Local API.
4. **HTTP guardrails**: Arbitrary `query` strings, mutations, introspection (`__schema`), batch arrays, URL query parameters, invalid/overlong `slug` variables, unknown operation IDs (`404`), non-JSON media types (`415`), non-POST methods (`405`), and >1 MiB bodies (`413`) were rejected over HTTP with `Cache-Control: no-store`.
5. **Coexistence & cache hooks**: Anonymous `POST /api/graphql` returned `401`, authenticated Admin `POST /api/graphql` returned `200` (including draft queries), anonymous `POST /api/form-submissions` returned `201` while `GET /api/form-submissions/:id` returned `403`, and real PostgreSQL `Articles` / `Footer` mutations emitted the expected scoped Next.js `revalidateTag` tags while skipping pure draft autosaves.
