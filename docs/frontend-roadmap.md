# Engineer’s Studio: implementation roadmap and research

Updated: 22 October 2026. Scope: public portfolio; the custom Payload admin is retained.

## Completed implementation

| Phase                     | Delivered                                                                                                             | Verification                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Existing-data redesign | Work-first homepage, responsive Studio typography/palette, expertise, profile, career, credentials and contact        | Component and browser tests                                       |
| 2. Writing                | `/articles`, URL-backed search, editorial article pages, shared navigation/footer, missing-article view               | Keyboard, mobile, reduced-motion and accessibility browser checks |
| 3. Projects               | `/projects`, search plus categories, screenshot dialog, full-width inspection, focus/scroll restoration               | Component and browser tests                                       |
| 4. Shareable state        | Query/category URLs, reload and Back/Forward restoration, reset, current-section cues                                 | History and URL-state tests                                       |
| 5. Reliability            | Shared error/retry and loading states; no sample fallback for failed CMS reads                                        | Component tests and explicit preview-state demonstrations         |
| 6. Discovery              | Canonical archives, `/robots.txt`, `/sitemap.xml`, more-writing recommendations                                       | Pure-function tests and Next compile route manifest               |
| 7. Public-query safety    | Anonymous access enforced on Local API reads, drafts/trash excluded, explicit unlimited-list limits, versioned caches | Mocked query-contract tests                                       |
| 8. Media configuration    | Optional Blob adapter, strict HTTPS image-origin allowlist, local-network image optimization disabled                 | Config tests and Next compile                                     |
| 9. Repeatable validation  | `test:frontend`, `test:preview`, TypeScript, clean lint, compile-only build                                           | Commands below                                                    |

## Remaining release gates — environment-dependent

These are not complete and are not replaced by the standalone preview:

1. Configure a real development/staging database using `POSTGRES_URL`, plus a private `PAYLOAD_SECRET`.
2. Run full `pnpm build` / production page generation against that environment. Compile-only mode is not a full deployable build.
3. Verify real CMS reads, uploaded media, remote image optimization and storage behavior.
4. Test save/delete cache revalidation on the homepage, archives, articles and sitemap.
5. Test authenticated article Live Preview inside Payload, including image relations and empty-body fallback.
6. Run the database integration/admin browser suites against an isolated test database.
7. Confirm personal/contact/work-permit text is current; review keyboard/screen-reader behavior manually.
8. Validate HTTP 404 behavior on Next itself. The Vite missing-page demonstration returns fallback HTML with HTTP 200.

No schema migration, database reset, seed, deployment, or credential change was performed.

## Documentation research and decisions

The supplied repository documentation was reviewed alongside the installed configuration.
Some older instructions described MongoDB, `DATABASE_URI`, `/graphql`, a separate
`server.ts`, and ready-made case studies. These do not describe this checkout.
Setup/API guides now identify the real environment names, routes and model limitations.

Official documentation was checked **at the installed Payload v3.90.2 tag**, not just
`main` (which now includes v4 behavior):

- [Local API](https://github.com/payloadcms/payload/blob/v3.90.2/docs/local-api/overview.mdx)
- [Local API access control](https://github.com/payloadcms/payload/blob/v3.90.2/docs/local-api/access-control.mdx)
- [Performance](https://github.com/payloadcms/payload/blob/v3.90.2/docs/performance/overview.mdx)
- [Uploads](https://github.com/payloadcms/payload/blob/v3.90.2/docs/upload/overview.mdx)

Findings developed into code:

- Payload v3 Local API bypasses access control by default. Public reads now explicitly
  use `overrideAccess: false`, with no authenticated user, so future access-policy
  restrictions cannot be silently bypassed by the shared frontend cache.
- `pagination: false` does not cancel an explicit positive limit. Full portfolio lists
  now also use `limit: 0`; singletons and exact article lookups remain bounded.
- Retain `getPayload({ config })` and the existing shared cache tag instead of adding
  an unnecessary client-side GraphQL dependency.
- Slug discovery projects only `slug` and `description`, avoiding media population.
  The body is still checked because this project intentionally has external-only articles.
- New “More field notes” discovery uses existing article categories and order, excludes
  the current article/duplicate destinations, and labels local versus external reading.
- Avoid new image-size fields or rich-text field migrations until a database-backed
  migration/content review can be tested. Safe image-host configuration needs no schema change.

## Deliberately deferred content-model extensions

These are future proposals, not completed functionality:

- Project summaries, featured selection, galleries, problem/approach/outcome case studies.
- Project-to-skill/service relationships for evidence-backed expertise.
- Migrating article bodies from plain text to Lexical rich text.
- Structured career dates and a dedicated hero headline/introduction.
- Updating the legacy Docker stack to PostgreSQL. Its Mongo service is incompatible
  with this config; the Vercel adapter also treats non-loopback hosts specially, so
  changing a Compose hostname alone is not sufficient.

Implement these with a reviewed content/migration plan and a disposable database.
Never invent testimonials, metrics, employment availability or case-study outcomes.

## Validation commands

```sh
pnpm test:frontend
pnpm exec tsc --noEmit
pnpm lint
pnpm build:compile
pnpm preview:studio
# Separate terminal; Chromium must be installed:
PLAYWRIGHT_BASE_URL=http://localhost:4173 pnpm test:preview
```

`test:frontend` is database-independent. `pnpm test` also runs the older database/admin
suites and requires a configured test environment. See the preview README for its
browser executable override and sample-data limitations.
