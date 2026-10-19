# Progress reports

Dated development reports for the PoCMS admin programme. Each report comes as a PDF, a
self-contained HTML file with the same content (open it in a browser; the charts are inline SVG),
and a JSON file with the data behind every number.

| Date       | Report                                                                          | Data                                  |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| 2026-10-20 | [PDF](2026-10-20-progress-report.pdf) · [HTML](2026-10-20-progress-report.html) | [JSON](2026-10-20-progress-data.json) |

## 2026-10-20 at a glance

- **Delivered:** 81.1 engineer-days of estimated effort in 4 active days (16 to 19 October). The
  roadmap P0–P6 is 82% delivered by effort: 29 of 41 items done, 9 partial, 2 not started,
  1 deferred.
- **Current iteration (CR-12):** 7 of 12 items, 12.0 of 26.0 engineer-days. No planned item has
  landed since 19 October 06:13; the sessions since then went to unplanned fixes.
- **Quality:** CI is red since the 19 October revert (Tailwind prefix check), so its tests don't run.
  Locally: 51 integration tests pass, plus the dashboard, gallery and roles end-to-end suites.
- **Performance:** `/admin` ships 685.1 kB JS (+39.9 of the +150 kB budget) and 64.4 kB CSS
  (+19.2 of +40), measured on 20 October.
- **Forecast:** CR-12 complete on 22 October (range 21 to 23 October) if daily sessions resume on
  21 October. Two owner actions gate it: the CI decision and the Vercel environment variables.
- **Top risks:** red CI, no database migrations for production, Preview builds without secrets.

Charts: project and programme Gantt charts, plan against actual, roadmap scope coverage, velocity,
burn-up, commits and lines per day, tests, CI runs, bundle against budget, code size by area, CR-12
burn-down with forecast, dependency graph, forecast Gantt, roadmap position, remaining effort and a
risk heat map.

## Regenerating

```sh
node scripts/progress-report/build.mjs --pdf
```

- Measurements come from git and, for CI runs, the GitHub CLI (`gh`); `--offline` reuses the runs
  saved in the JSON file. The PDF needs Playwright's Chromium (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).
- The plan, item statuses, estimates, backlog and risks live in
  `scripts/progress-report/model.mjs`. For a new report, update it first: `meta.reportDate`,
  `measuredAt` and `nextSession`, the statuses, and the bundle numbers
  (`scripts/measure-admin-bundle.mjs` against a production build). Output files are named after
  `reportDate`, so earlier reports stay as they are.
- Charts are plain SVG drawn by `scripts/progress-report/svg.mjs`; the report loads nothing from
  the network.
