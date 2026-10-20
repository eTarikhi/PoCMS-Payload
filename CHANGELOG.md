# Changelog

What changed in PoCMS, newest first. Grouped by the change requests (CR-12) of the admin
modernisation programme; every entry links the roadmap item it closes
(`docs/ui-modernization/shadcn-payload-ui-analysis.md` §9).

## Unreleased

### Fixed

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
