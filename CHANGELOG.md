# Changelog

What changed in PoCMS, newest first. Grouped by the change requests (CR-12) of the admin
modernisation programme; every entry links the roadmap item it closes
(`docs/ui-modernization/shadcn-payload-ui-analysis.md` §9).

## Unreleased

### Added

- **A database tools page at `/admin/database`.** A new `manageDatabase` capability (a checkbox on
  the role, migration `20261022_140000_database_tools_capability`) unlocks a page that shows every
  table in the public schema with rows, size, dead rows and last vacuum; a table browser with
  columns, primary keys, indexes and constraints and a read-only page of rows; a logical backup
  (`.sql` that Postgres renders itself with `format('%L', …)`, or `.json`) for the whole database,
  the table being browsed, or the schema alone; a restore that inspects the file first and refuses
  to touch a database with content unless the admin types `restore`; `ANALYZE`, `VACUUM`,
  `VACUUM ANALYZE` and `REINDEX CONCURRENTLY` of invalid indexes; and health checks with narrow,
  idempotent fixes — sequences behind their rows (`setval`), relation rows whose parent is gone
  (`DELETE`), invalid indexes (`REINDEX`), tables without planner statistics (`ANALYZE`). On Neon,
  `NEON_API_KEY` adds branch backups, point-in-time restore (which replaces the branch and keeps
  the current state under a name) and branch deletion through the Neon API, because neither branch
  creation nor history lives in SQL. Every endpoint needs the capability (`403` otherwise), every
  destructive action is written to the audit log, and no message is a raw query or a connection
  string. Backups restore with `psql -f` or the new `pnpm db:restore <file> --yes`, which was
  verified round-trip into a fresh database (44 tables, 186 rows, migration history intact). Tests:
  `tests/int/database-tools.int.spec.ts` (live SQL + the Neon client against a fake `fetch`);
  see the plugin entry under Changed for the packaging and its tests.
- **`pnpm admin:create` and `pnpm admin:status`.** The first account normally comes from the
  admin's "Create first user" screen, but that cannot help when a database already has a user row
  whose password is unknown, or an account with no role (the admin refuses those at
  `/admin/unauthorized`). `admin:create` is idempotent — it creates an Administrator for a new
  address, or sets the password and adds the role to an existing one — and takes the password from
  a hidden prompt, `--password`, or `ADMIN_PASSWORD`. `admin:status` lists the accounts and their
  roles and exits non-zero when nobody can open the admin. `--migrate` runs `pnpm migrate` first
  when the database has no schema, so a brand-new Neon/Vercel database can be set up and given its
  first account in one command. Tested against the real database in
  `tests/int/admin-accounts.int.spec.ts`, and end to end on an empty database in a production
  build (migrate, create, log in, open `/admin`).
- **Per-document SEO metadata (Payload's SEO plugin).** Articles and the Site settings global get a
  `meta` group — title, description and an image — with a character counter, a search-result
  preview and an *Auto-generate* button per field. The generators fill in what the site would use
  anyway (the article title with the site name, the excerpt, the cover), so the group is optional:
  with an empty group the page renders exactly as before. Metadata is read where the tags are
  built — `buildArticleMetadata` prefers the group and falls back to the article's fields, and the
  root layout's `generateMetadata` merges the Site settings group over the constants in `seo.ts`,
  which makes the site title and description editable without a deploy. Drafts keep their metadata
  in the version row (`_articles_v`), so a preview shows the editor's values. Migration
  `20261022_090000_seo_meta`; the seed writes the generated values. `tabbedUI` is off on purpose:
  it would move the article sidebar fields into a new "Content" tab.
- **A sitemap and a robots policy.** `/sitemap.xml` lists the home page and every article that has a
  page — slug and body, the same rule as the route — with `lastmod` from `updatedAt`, so a listed
  URL never 404s. `/robots.txt` allows the site, keeps crawlers out of `/admin`, `/api` and
  `/preview`, and names the sitemap. Both are Next metadata routes fed by the shared `portfolio`
  cache tag, so a save in the admin refreshes them with the pages. The rules live in
  `lib/sitemap-entries.ts` and are covered by `tests/int/sitemap.int.spec.ts` and
  `tests/e2e/sitemap.e2e.spec.ts`; the e2e spec also requests every listed URL.
- **Media folders (beta).** `folders: true` on Media turns on Payload's folder feature: the sidebar
  gains **Browse by Folder** at `/admin/browse-by-folder`, the library is grouped by where an image
  is used, and folders nest. The seed creates *Project covers*, *Article covers* and *Certificates*
  and files every upload into its folder. Only Media uses folders, so a root-config collection
  override hides Payload's "Folder Type" select and defaults it to `media` — creating a folder asks
  for a name only, and the API fills the type. Migration
  `20261021_163000_media_folders` adds the hidden `payload-folders` collection, its type join table,
  `media.folder_id` and the lock row; the folder tables are cleared after media in the seed. The
  feature ships with the accessibility fixes below and with
  `tests/e2e/folders.e2e.spec.ts` + `tests/int/media-folders.int.spec.ts`; both folder surfaces join
  the axe sweep.
- **An accessibility gate for the whole admin (P6.2).** `tests/e2e/a11y.e2e.spec.ts` scans sixteen
  admin surfaces in both themes against the WCAG 2.2 AA tags and fails on any serious or critical
  finding that is not one of Payload's own, with the upstream ones listed by rule, node count and
  component, so an upgrade that fixes them is noticed. It also checks what axe cannot: one main
  landmark and one `<h1>` per screen, a document title, a language, and a skip link that is the
  first tab stop and moves focus to main (a real keyboard test in both themes). Reports land in
  `test-results/a11y-<theme>.json`; the gaps and the remaining manual screen-reader pass are
  documented in `docs/ui-modernization/a11y.md`. The fixes it found are in Fixed below.
- **Documentation refresh (P6.3).** `AGENTS.md` now records the accessibility gate, the orderable
  convention and the DOM-fix pattern for new work; the README points at the component gallery (the
  old `/admin/ui-kit` path) and at `docs/ui-modernization/a11y.md`, and lists drafts, Live Preview,
  orderable lists and the media pipeline among the features.
- **Visual invariants in CI (P6.1).** `tests/visual/invariants.visual.spec.ts` runs in the workflow
  beside the captures and asserts what is the same on every machine: tokens load, no screen
  scrolls sideways at 1440/768/375px in either theme, thumbnails load, dark mode stays navy and
  the dashboard keeps its heading and widget cards. The pixels stay platform-specific; these
  invariants gate the build.
- **Drafts and scheduled publishing on Articles (CNT / P5.5).** Articles keep versions with drafts:
  an editor can write for days, save a draft and publish later, and the public site keeps showing
  only published work — anonymous REST reads filter on `_status`, and the frontend queries add the
  same condition because the Local API bypasses access control. A new `publishAt` sidebar field
  feeds the daily `publish-scheduled` task, which publishes the drafts whose time has come with
  their own field values (Payload merges an update over the published document, so a status-only
  write would publish stale content). The jobs endpoint expires the site cache when the run
  finishes, since the task runs outside a request. Migration
  `20261020_231332_drafts_and_scheduled_publishing` backfills existing articles to `published`.
  Tests: `tests/e2e/drafts.e2e.spec.ts`.
- **Live Preview for drafts.** The edit view's Live Preview used to point at the public article
  page, which is prerendered and published-only — a draft's preview landed on "Article not found".
  It now opens `/preview/articles/[slug]`, a dynamic `noindex` route that renders the published
  article when there is one and an empty article shell otherwise, which the preview component fills
  from the editor's form state. Access control still decides what the preview's own requests may
  see.
- **Task-based acceptance tests (P5.6).** Three editor tasks — publish an article with a cover
  image, write a draft and publish it in a second step, and replace a cover with an external URL —
  run through a `TaskMeter` that counts steps and time, compared with
  `tests/acceptance-baseline.json` (two extra steps and 60% more time allowed). A redesign that
  adds clicks to a routine task has to change the baseline in the same commit.
- **Component tests for the admin primitives (P2.6).** Testing Library and jsdom in the existing
  Vitest run cover the element each primitive renders, the ARIA state of tabs, toggle groups and
  progress bars, a dialog's focus handling, the sparkline geometry and the status components'
  text. `pnpm test:unit` runs only these.
- **Drag-and-drop ordering on every ordered list (P5.5).** `orderable: true` replaces the manual
  `order` number with Payload's hidden fractional-index `_order` on Skills (the pilot) and then on
  Educations, Experiences, Projects and Services: each list gets drag handles, the site sorts by the
  same key, and the seed appends documents one at a time. `src/fields/order.ts` is gone. Migrations
  `20261021_001500_skills_orderable` and `20261021_150000_orderable_profile_and_services` backfill
  the keys from the old numbers and drop the column.

### Changed

- **The database tools are a Payload plugin.** The page, its eight endpoints and its sidebar link
  now come from one `databaseTools({ … })` call in `plugins:`, the layout Payload documents in
  *Build your own plugin*: a typed factory `(options) => (config) => config` in
  `src/plugins/databaseTools` that appends the view to `admin.components.views`, the link to
  `afterNavLinks` and the endpoints to `config.endpoints`. The host supplies what only it knows —
  `access` (the `manageDatabase` capability), `audit` (the audit log), `migrations` (what the
  migration check should expect) and an optional `navigation.visible` for the link, which renders
  without a request — and everything else has defaults: paths, titles, the 25 MB restore limit, the
  100,000-row dump cap, `NEON_*` from the environment, and `restore: false` / `neon: false` to drop
  whole cards. The resolved options reach the server components as `serverProps`, so the page and the
  link use the same rule as the endpoints. `src/database` and `src/endpoints/database*.ts` moved into
  the plugin; `DATABASE_TOOLS_CAPABILITY` is now the single definition of the capability the Roles
  screen shows. The components and the endpoint URLs are unchanged, as is what the page does. Tests:
  `tests/int/database-tools-plugin.int.spec.ts` covers the packaging (12), `tests/int/database-tools`
  the SQL (36). Docs: `docs/plugins/database-tools.md`.

### Added

- **`pnpm db:status` and `pnpm db:reset`.** A migration that dies partway — a serverless database
  suspending mid-run, a stopped container — leaves its earlier `CREATE TYPE` statements behind, and
  every retry then fails with `type "enum_articles_category" already exists`. That state is now
  recognised: the readiness check reports `partial` (with the object counts) instead of "no schema",
  `onInit` stops on it, and `db:status` shows the tables, types and applied migrations from outside
  the app (it works when Payload will not start). `db:reset --yes` drops the public schema, prints
  what it dropped, refuses to delete rows without `--force`, and then runs `pnpm migrate`.

### Fixed

- **The migration folder and its registry are kept equal.** `src/migrations/index.ts` is generated
  from every `.ts` file in the folder, so an unregistered file joins the registry on the next
  `migrate:create`. Twelve such files were in the tree: eight that predate the baseline and create
  the whole schema themselves, three alternative generations of the roles work, and
  `20261022_000244`, the generated duplicate of the hand-written `20261021_163000_media_folders`.
  Registering them would run two migrations that create the same tables — a fresh database would
  fail halfway. They now live in `src/migrations/archive/` (their `.json` snapshots stay, because
  `migrate:create` diffs against the newest one), `src/migrations` is not ignored, and
  `tests/int/migrations.int.spec.ts` asserts registry ↔ files. Verified by migrating an empty
  database from scratch.

- **CI is green again.** The `Build and end-to-end tests` job had failed on every run since 19
  October. Two causes: the visual-invariants step called Playwright without the `tsx` loader (below),
  and, on 22 October, a migration registry that imported files the repository did not contain
  (fixed by `ec58cd6`, which also stops ignoring `src/migrations`). Run
  [39704391765](https://github.com/eTarikhi/PoCMS-Payload/actions/runs/39704391765) is the first
  green run.
- **CI's visual-invariants gate actually runs.** The step called `playwright test visual/invariants`
  directly, without the `tsx` loader the other Playwright scripts set. Playwright could not resolve
  `next/cache` through the Payload config, reported “No tests found”, and failed the build — the gate
  had never run in CI. The step now uses `pnpm test:invariants`, which sets the loader and names the
  spec file.
- **An unmigrated database no longer fails with a raw SQL error.** With schema push off, a database
  without the schema answered the first request with Drizzle's `Failed query: select "users" …` and
  left the cause (`relation "users" does not exist`) in the server log. `onInit` now reads the
  tables and the migration history (`src/lib/database-readiness.ts`) and stops with a message naming
  the case and the command: `pnpm migrate`, `pnpm migrate:adopt` for a database from the old push,
  or the connection error and what to check. Pending migrations are a warning with the list, not a
  failure. `pnpm dev` also runs the check before Next starts (`pnpm preflight`,
  `scripts/preflight.ts`), so the common case — a fresh clone, a reset container — fails at the
  shell with the command to run instead of in the browser. Documented under Troubleshooting in
  `docs/development.md`.
- **A database that resets the connection says so, in its own words.** `ECONNRESET` (and `pg`'s
  code-less `Connection terminated unexpectedly`) is what a stopped container's port mapping or a
  server that is still starting returns, and it used to print the generic “check POSTGRES_URL” hint
  and let `next dev` start into a broken admin. The failure is now classified — `ECONNREFUSED`,
  `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `28P01`, `3D000` — each with its own advice;
  `pnpm preflight` retries a transient failure four times before giving up, then stops instead of
  continuing. `onInit` treats an unreachable database like a missing schema: it stops with the
  message rather than serving pages that can only fail.
- **The SEO plugin's fields, from the accessibility gate.** Its instruction lines are inline
  `#9A9A9A` (2.6:1), its length pills white on the CSS keywords red/orange/green (1.9–4:1), and its
  search-result preview is a mock (`pointer-events: none`) whose links are still focusable — one
  with no name, one under the 24px target size. `AdminDomFixes/seo.ts` marks the notes and pills
  (coloured by `payload-overrides.css`: the muted token, and dark fills that keep the status hue
  with white text at 7.5:1 or better) and hides the preview from assistive tech, unlinking its
  anchors. The article and site-settings screens pass axe in both themes.
- **The folder browser's accessibility gaps.** Payload 3.90's folder view renders the grid/list
  toggles and the folder "…" menu without a name, its card thumbnails without `alt` (fourteen
  images on the seeded library), the "Create folder" control as a `<div type="button">` that takes
  no focus, and its section titles and "Media" chips under 3:1. `AdminDomFixes/folders.ts` names
  the controls, fills the alt text from the file name and turns the create control into a real
  button (Enter/Space included); the two labels use the muted token instead of elevation-400 with
  50% opacity.
- **Admin accessibility findings, from the new gate.** The dashboard and every list now have a main
  landmark and the shell a skip link (`providers/AdminDomFixes`), and the dashboard and sign-in
  screens an `<h1>` (`views/PageTitle`). Payload's row-selection checkboxes (`aria-label=""`), its
  icon-only document controls (the "…" menu, edit/remove on an upload, clear on a date field) and
  the hidden select chevron/clear control are named or taken out of the tab order in the DOM, the
  document tab row loses list semantics it does not honour, and the Versions tab stops hiding its
  visible count from voice control. Contrast: list-header labels, upload hints and upload metadata
  use the muted token (2.6–3.65:1 before); the inactive image-source tab no longer inherits
  Payload's grey button fill (2.59:1 in dark). Target size: sort arrows and the date clear button
  are 24×24 CSS pixels.
- **The seed publishes its articles.** Articles keep drafts, and a document created without a
  status is a draft, so `pnpm seed` left the public site empty.
- **The system page test no longer assumes `users` is one of the twelve largest tables.** It is not
  on a freshly seeded database (one row), so the test now checks the shape of the snapshot and a
  content table that dominates on any seeded database.
- **Public pages follow edits immediately.** `revalidatePortfolio` now calls
  `revalidateTag('portfolio', { expire: 0 })` and `revalidatePath` for the home page and the saved
  article's page. Next 16's `revalidateTag(tag, 'max')` only marked entries stale for
  stale-while-revalidate, so an edited article kept its old page and a trashed or deleted one kept
  answering 200 until the cache happened to turn over. Found by the new editor journey test; the
  revalidate-site endpoint and the jobs endpoint already used `{ expire: 0 }`.
- **Admin accessibility (WCAG 2.2 AA).** Payload's pagination arrows now have accessible names
  (`Previous page`, `Next page`) through `providers/PaginationLabels`; the account menu's summary
  carries its visible initials in its name; a destructive badge uses the new `destructive-emphasis`
  token so it passes contrast on its own tint in dark mode (`check:contrast` covers the pair); table
  containers are keyboard-scrollable (`tabIndex`); the Deployments and CI status widgets no longer
  widen the page on phones because their screen-reader-only suffixes sat in unpositioned truncated
  lines. The axe tests now also cover the audit log, jobs, system page and terminal.
- **E2E suite runs in this environment.** `@sparticuz/chromium` plus the Amazon Linux 2023 NSS
  libraries extracted from it give Playwright a working browser; the whole suite runs against a
  production build (see `docs/ui-modernization/admin-ui-guide.md`, "Running Playwright where
  browsers are not installed"). Fixes in the process: the audit log test looked for a `searchbox`
  (Payload's filter is a text field) and scanned a `main` landmark the admin has; the system page
  test assumed particular tables among the 12 largest.

### Added

- **Admin translations with a completeness test (P4.5).** The admin's own strings live in
  `src/i18n/en.ts` under the `custom` namespace and are registered through `i18n` in
  `payload.config.ts`: dashboard widget labels, their field labels and options, the image source
  control and the pagination labels now resolve through Payload's `t`. `customLabel()` and
  `useCustomT()` narrow the typed `t` in one place (Payload's `t` only knows its own keys), and a
  test scans the source for every `custom:` key so a missing string fails CI instead of rendering
  the key.
- **One control for two image sources (P5.2).** Articles, Projects and the Header show the upload
  field as `ImageSourceField`: a *Media library* / *External URL* tab pair, a preview, and a line
  naming which source the site uses. The upload tab renders Payload's own `UploadField`, and the
  URL inputs write the existing sibling fields, which stay in the API but are hidden in the form.
- **Navigation and site settings globals, with a maintenance page (CNT / P3.4).** The two 0-byte
  orphan files under `src/globals` are real globals now. **Navigation** stores the brand and the two
  link lists that render around it; empty sides fall back to the original links, so a fresh database
  keeps its bar. **Site settings** stores the site name, a support address and a maintenance switch:
  while it is on, every public route renders `MaintenancePage` (title, message, an *Email us*
  button) from the public layout, while `/admin` and the REST API stay reachable. Both globals are
  read from the `portfolio` cache tag, so a save refreshes the pages immediately. Migration
  `20261020_223003_navigation_and_site_settings`; seed in `src/seed/navigation.ts` and
  `src/seed/siteSettings.ts`; tests in `tests/int/navigation-mapper.int.spec.ts` and
  `tests/e2e/site-settings.e2e.spec.ts`.
- **Visual captures in CI.** The workflow runs `pnpm test:visual` against the production build and
  uploads every baseline screen (light/dark, desktop and phone) as an artifact for review; pixel
  comparisons stay on the machine that owns the baselines, because screenshots are platform
  specific.
- **Terminal (E7).** Admin › Terminal (`useTerminal`, development only) runs an allow-listed
  package script — lint, typecheck, both admin checks, `generate:all`, `migrate:status`,
  `test:int` — through `POST /api/dev/terminal` and streams its output. Production builds answer
  404; the allow-list is compiled and the endpoint spawns `pnpm` without a shell. Security review in
  `docs/ui-modernization/terminal-security.md`.
- **System page (E6).** Admin › System (`viewSystem`) shows the environment and commit, Node,
  Next.js, Payload and React versions, which integrations are configured (never their values), the
  database's size, tables, connections and applied/pending migrations (read-only SELECTs), and the
  newest `payload`/`next` releases on npm (cached a day).
- **Audit log (E5).** Admin › Audit log (`viewAuditLog`) records creations, changes, trash, restores,
  permanent deletes and sign-ins for every collection and global, with a per-field change list that
  omits secrets. Entries are append-only and written inside the caller's transaction by
  `src/plugins/auditLog.ts`; a new collection is audited without code. A dashboard widget shows the
  newest entries. Migration `20261020_182625_audit_log`.
- **Scheduled jobs (E4).** Admin › Scheduled jobs (`/admin/jobs`, `manageJobs` capability) lists the
  maintenance tasks with their schedule and last run, runs one on demand and cancels queued runs.
  The queue is the `job-runs` collection; `GET /api/jobs/cron` is the Vercel Cron entry point
  (daily, `CRON_SECRET`). Tasks: empty the trash after `TRASH_RETENTION_DAYS`, store Lighthouse
  results for phones and desktops, and the Monday broken-link crawl of the public pages.
- **Page speed history (E4b).** The Page speed widget draws the performance score of the stored
  Lighthouse runs (90 days) as a sparkline, with the change over the window and the best and worst
  score. **Run again** starts the report job; the endpoint then expires the `pagespeed` cache tag,
  so the live lab test runs again as well.
- **Database migrations (MIG).** `src/migrations` is committed: a baseline for the whole schema and
  a second migration for the job tables. `pnpm migrate`, `migrate:status`, `migrate:create` and
  `migrate:adopt` (records the baseline on a database whose schema came from development push).
  The manual **Migrate database** GitHub workflow is the deploy step; nothing runs at build time.
- `vercel.json`: the daily cron and the 60 s function limit for the API route.
- `.env.example`: `CRON_SECRET` and `TRASH_RETENTION_DAYS`.

### Fixed

- **CI is green again (DEC).** The Tailwind prefix check read the right side of a comparison as a
  class name, so `tone === 'running'` looked like the utility `running` (animation-play-state) and
  the pipeline stopped before the tests ran. Conditions are no longer scanned as classes, only the
  class side of `&&`/`||`/`??`, concatenations on `+`; a five-case self-test guards the parser and
  runs before every scan.

### Changed

- Jobs and Page speed reports are admin-only collections (`Admin` group, hidden from the sidebar);
  the `/admin/jobs` page is their interface. Writes go through the runner with `overrideAccess`, so
  a run record is always a truthful log.
