# Changelog

What changed in PoCMS, newest first. Grouped by the change requests (CR-12) of the admin
modernisation programme; every entry links the roadmap item it closes
(`docs/ui-modernization/shadcn-payload-ui-analysis.md` §9).

## Unreleased

### Added

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
