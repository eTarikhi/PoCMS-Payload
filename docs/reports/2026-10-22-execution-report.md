# Execution report — 22 October 2026

What this session delivered on `arena/358e1c87-pocms-payload`, how it was verified, and what is
left. The programme report of 20 October (`2026-10-20-progress-report.html`) still describes the
plan; this one is the record of the work itself.

## Summary

The session closed the content track and then spent its remaining time on the two things that
made the project hard to work on: a database that fails opaquely, and a CI gate that never ran.

| Area | Delivered |
| --- | --- |
| SEO | Payload's SEO plugin on Articles and Site settings, with fallbacks, generators, counters, a preview and an accessible admin treatment |
| Crawlability | `/sitemap.xml` and `/robots.txt` as Next metadata routes, fed by the same cache tag as the pages |
| Developer experience | A database-readiness check in `onInit` and a `pnpm preflight` step before `next dev` |
| CI | The visual-invariants gate now actually runs; the migration registry no longer references missing files |

Commits: `c142eaf`, `c9eeaf0`, `8225cbc`, `e9e6223`, `6265f8c`, `ec58cd6` (plus the owner's
`f60c4b4` and `32860bf`). 41 files, +2,277 / −33 lines in the SEO and sitemap work alone; 6 test
files added or extended.

## 1. SEO metadata (Payload's SEO plugin)

`@payloadcms/plugin-seo@3.90.2` adds a `meta` group (title, description, image) to Articles and the
Site settings global. The integration is deliberately *additive*: an empty group renders exactly the
metadata the site had before.

- **Schema.** Migration `20261022_090000_seo_meta` adds `articles.meta_title`,
  `meta_description`, `meta_image_id` (FK → media, `set null`), the matching `_articles_v` columns
  for drafts, and `site_settings.meta_*`.
- **Reading.** `buildArticleMetadata` prefers `article.seo.*` and falls back to the article's title,
  excerpt and cover; `buildSiteMetadata` overlays the settings group on the constants in
  `lib/seo.ts` and always sets `metadataBase`. Empty strings count as unset, which is what clearing
  a field writes.
- **Writing.** The plugin's *Auto-generate* buttons call `seoGenerate` — the same functions the seed
  uses — so the preview matches the page. `tabbedUI` is off: it would move the article's sidebar
  fields into a new "Content" tab.
- **Admin accessibility.** The plugin's widgets failed the axe gate: instruction lines at `#9A9A9A`
  (2.6:1), white on red/orange/green pills (1.9–4:1), and a mock preview whose links stay focusable
  (one unnamed, one under 24px). `AdminDomFixes/seo.ts` marks the nodes, `payload-overrides.css`
  darkens the pill fills to ≥ 7.5:1 with white text, and the preview is hidden from assistive
  technology and removed from the tab order.

## 2. Sitemap and robots

- `/sitemap.xml` lists the home page and every article that has a page — the same "slug and body"
  rule the route uses (`hasArticlePage`) — with `lastmod` from `updatedAt`. Drafts, trashed
  documents and link-only articles are absent, so nothing in the sitemap 404s.
- `/robots.txt` allows the site, disallows `/admin`, `/api` and `/preview`, and names the sitemap.
- Both are Next metadata routes backed by the shared `portfolio` cache tag, so saving content
  refreshes them with the pages. The rules live in `lib/sitemap-entries.ts` — a `lib/sitemap.ts`
  would be picked up as a route — and `robots.ts` sits at the app root because the file convention
  does not match route groups. Both facts are pinned by tests.

## 3. A database that says what is wrong

Reported symptom (from the browser):

```text
Runtime Error · Failed query: select "users"."id", … from "users" …
```

The cause — `error: relation "users" does not exist` — only appeared in the server log. With
`push: false`, an unmigrated database is a normal state (fresh clone, reset container, restored
dump), so this was a trap rather than an edge case.

- `src/lib/database-readiness.ts` reads `to_regclass` for the core tables and the history in
  `payload_migrations`, then classifies the database: `missing`, `unmanaged`, `pending`,
  `unreachable` or `ready`. Only "missing" throws; a stale column warns and keeps serving.
- `onInit` runs it and stops with a message naming the command: `pnpm migrate`, or
  `pnpm migrate:adopt` for a database created by the old schema push.
- `pnpm dev` now runs `pnpm preflight` first, so the failure happens in the shell, before Next
  starts, instead of in the browser where only "This page couldn't load" is visible.
- Connection failures are classified rather than lumped together: `ECONNREFUSED` (nothing
  listening), `ECONNRESET` / `Connection terminated unexpectedly` (accepted, then closed — a
  stopped container, a server still starting, a proxy, or TLS), `ENOTFOUND`, `ETIMEDOUT`, `28P01`
  and `3D000` each get their own advice. Preflight retries a transient failure four times before
  giving up, and `onInit` stops on an unreachable database instead of serving pages that can only
  fail.

## 4. CI that actually runs its gate

CI had been red since 19 October. The quality job passed; every run failed at *Visual invariants*.
The step called Playwright directly, without the `--import=tsx/esm` loader that the package scripts
set, so Playwright could not resolve `next/cache` through the Payload config and reported
"No tests found". The gate that proves the admin still looks like itself had never executed in CI.

- Added `pnpm test:invariants` (loader + explicit spec path) and pointed the workflow at it.
- Reproduced the old behaviour locally (`No tests found`) and the fix (7/7 invariants passing).

The owner's `32860bf` then committed a `src/migrations/index.ts` that imports nine migration files
that were never pushed (the folder was in `.gitignore`), which broke typecheck, preflight, migrate
and the build. `ec58cd6` restores the registry to the files in the repository and removes
`/src/migrations` from `.gitignore`: migrations are how a schema change reaches production, so they
have to be committed. If those nine migrations are real, they need to be added and the registry
regenerated (`pnpm generate:all` does not touch it; `payload migrate:create` does).

## Quality evidence

| Check | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean (ESLint) |
| `pnpm test:int` | 22 files, **210 passed** |
| `pnpm test:e2e` (production build) | **83 passed, 3 skipped** (8.3 min) |
| `pnpm test:invariants` | **7/7** |
| `pnpm test:e2e a11y` | **4/4** (light + dark, axe + skip link) |
| `next build` | OK |
| Route smoke test | `/`, `/admin`, `/sitemap.xml`, `/robots.txt` all 200 |
| CI run [39708768767](https://github.com/eTarikhi/PoCMS-Payload/actions/runs/39708768767) | **success** — both jobs, on the final commit (`dc9023f`) |

New tests: `tests/int/seo.int.spec.ts` (8), `tests/int/sitemap.int.spec.ts` (5),
`tests/int/database-readiness.int.spec.ts` (18), `tests/e2e/seo.e2e.spec.ts` (3),
`tests/e2e/sitemap.e2e.spec.ts` (3), plus four SEO cases in
`tests/int/admin-dom-fixes.int.spec.ts`.

## Open items

1. **The nine local migrations.** Either commit them (`src/migrations` is no longer ignored) and
   regenerate the registry, or confirm they were experimental and drop them. Until then the
   registry matches the repository.
2. **Deployed database.** `20261022_090000_seo_meta` (and anything after it) still has to run
   through *Actions → Migrate database* once the deploy carries it.
3. **CI history.** `ec58cd6` is green (run 39704391765, both jobs). Earlier runs are red: 32860bf
   for the missing migration files, before that for the loader.
4. **Backlog.** Unchanged: the Payload 4 migration (P7) and the remaining hardening items in the
   20 October report.
