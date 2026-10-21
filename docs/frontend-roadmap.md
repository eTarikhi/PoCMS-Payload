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
| 9. Repeatable validation  | `test:frontend`, `test:preview`, TypeScript, clean lint, full isolated production build                               | Commands below                                                    |

## Real-app release gates cleared in an isolated environment

A new, disposable loopback PostgreSQL 18.4 database now backs a complete Next
production build. No existing database was reset and no deployment was triggered.
See [integration instructions](integration-testing.md) for the guarded fixture setup.

- **Passed:** full production page generation and real Payload reads.
- **Passed:** actual local uploaded-media delivery and Next image optimization.
- **Passed:** homepage save invalidation and article create/rename/trash/restore/delete
  invalidation across article routes, writing archive, sitemap and RSS.
- **Passed:** authenticated admin UI login/dashboard/list/create form and article editor.
- **Passed:** actual unsaved article Live Preview, image relationships and empty-body fallback.
- **Passed:** real Next HTTP 404. Fixed a streaming-response bug by moving Studio
  pages/loading into `(studio)`; public URLs are unchanged.
- **Delivered after the release-gate work:** schema-free `/feed.xml`, stable document
  GUIDs, safe XML, bounded newest-first existing content, local/external destinations,
  footer subscription link and metadata discovery. Reuses anonymous tag-aware caching.

## Email reliability follow-up

Researched the installed-version email adapter and authentication-email documentation.
Implemented configurable sender settings, missing-key fail-closed behavior and trusted
absolute password-reset links. A guarded real-Payload lifecycle check validates
adapter serialization, reset/login, old-password rejection, single-use tokens and
unknown accounts without sending any email externally. Sixteen pure tests cover
configuration and unsafe origins. See [email operations](email.md). This does not
clear the real-provider delivery gate below and requires no collection migration.

## Remaining environment/content review gates

1. Verify remote Vercel Blob upload/delete and remote HTTPS image optimization in
   the intended hosted environment. Only local-disk media was exercised here.
2. Verify real email-provider delivery and perform deployment/provider-specific smoke checks.
   Application reset/adapter behavior is now verified separately with in-process capture.
3. Confirm personal/contact/work-permit text with the owner and review real content.
4. Perform manual keyboard/screen-reader and cross-browser review. Automated Chromium
   accessibility scans are useful, not an accessibility certification.

No production data, secrets or content models were changed. Integration fixtures and
random test secrets exist only in the disposable local environment. Deferred schema
extensions remain proposals requiring a reviewed migration/content plan.

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
- [Email adapters](https://github.com/payloadcms/payload/blob/v3.90.2/docs/email/overview.mdx)
- [Authentication email](https://github.com/payloadcms/payload/blob/v3.90.2/docs/authentication/email.mdx)
- [Trash](https://github.com/payloadcms/payload/blob/v3.90.2/docs/trash/overview.mdx)
- [Client-side Live Preview](https://github.com/payloadcms/payload/blob/v3.90.2/docs/live-preview/client.mdx)

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

Additional pinned-documentation findings validated in the application:

- `trash: true` includes trashed documents; it does not soft-delete by itself. Soft
  deletion sets `deletedAt`; restoration clears it. Cleanup uses one permanent delete.
- Live Preview sends form-state messages into its iframe. Existing client-side
  preview remains intentional for unsaved fields; required-field clearing must not
  crash the UI. Tests cover fallback and depth-one upload resolution, without adding
  draft/version schema changes or persisting unsaved form values.
- RSS reuses existing excerpts rather than inventing full bodies or parsing display
  dates back into timestamps. Publication dates are optional in RSS and omitted until
  a raw date is intentionally added to the view model. Unsafe outbound schemes and
  credentialed URLs are excluded; XML text is escaped and invalid controls removed.

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

`test:frontend` is database-independent. See [isolated integration testing](integration-testing.md)
for full builds and real-app/browser commands. `pnpm test` also runs the older database/admin
suites and requires a configured test environment. See the preview README for its
browser executable override and sample-data limitations.
