# Dashboard integrations and admin tools (research, 2026-10-19)

Two questions from the owner: can external reports (Vercel Analytics, page views, page speed) be
shown on the admin dashboard, and which development and administration tools would give full
control of the project from the admin. Nothing here is implemented yet; each item notes what it
needs.

## 1. External reports on the dashboard

**Yes.** Payload's dashboard widgets are React Server Components that receive the request
(`WidgetServerProps`), and Payload's docs name analytics and error reporting as typical widgets
([Dashboard Widgets](https://payloadcms.com/docs/custom-components/dashboard)). A widget can call an
external API on the server, so tokens never reach the browser, cache the answer, and draw it with
the existing `WidgetCard`, sparkline and chart. The site already loads Vercel Web Analytics and
Speed Insights (`src/app/(frontend)/layout.tsx`), so the data is being collected today.

### Sources

| Report | Source and API | Access | Notes |
| --- | --- | --- | --- |
| Page views, visitors, top pages, referrers, countries, devices | **Vercel Web Analytics API** (public since May 2026): `GET https://api.vercel.com/v1/query/web-analytics/visits/count` and `…/visits/aggregate`, grouped `by` day, route, country, referrer, device and more, with OData filters; `events/*` for custom events ([changelog](https://vercel.com/changelog/web-analytics-api), [guide](https://vercel.com/docs/analytics/web-analytics-api)) | Vercel access token, `projectId`, `teamId` for team projects | Same numbers as the Vercel dashboard. Aggregates are limited to the plan's reporting window; count endpoints read production data ([guide](https://vercel.com/docs/analytics/web-analytics-api)). Best fit: no new tracking. |
| Raw page view events | **Web Analytics Drains** to a custom HTTPS endpoint ([reference](https://vercel.com/docs/drains/reference/analytics), [drains](https://vercel.com/docs/drains)) | Drain configured in team settings | Only needed for history beyond the reporting window or custom joins; we would store events ourselves. |
| Real-user speed from Vercel (LCP, INP, CLS, FCP, TTFB) | **Speed Insights**: no public REST query API. `vercel metrics` queries it from the CLI ([docs](https://vercel.com/docs/speed-insights/accessing-metrics-with-vercel-cli)); Drains need Speed Insights Plus ([drains](https://vercel.com/docs/drains), [schema](https://vercel.com/docs/drains/reference/speed-insights)) | Plus plan for drains | For a widget: a drain into our own endpoint and table, or use CrUX below. |
| Real-user Core Web Vitals from Chrome | **CrUX API**: `records:queryRecord` (28-day p75 and good/needs-improvement/poor shares) and `records:queryHistoryRecord` (weekly series, up to 40 periods) for an origin or a URL ([CrUX API](https://developer.chrome.com/docs/crux/api), [History API](https://developer.chrome.com/docs/crux/history-api)) | Google Cloud API key; free, 150 queries per minute | Needs enough Chrome traffic: a small site may get origin data only, or a 404 (no data). |
| Lab performance, accessibility and SEO scores | **PageSpeed Insights API v5**: `GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=…&strategy=mobile` with `category=performance,accessibility,seo,best-practices` ([reference](https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed), [get started](https://developers.google.com/speed/docs/insights/v5/get-started)) | API key recommended; free, about 25,000 requests a day ([guide](https://wpadminify.com/docs/google-pagespeed-insights/api-key-configuration)) | One run takes many seconds (Lighthouse), so run it as a scheduled job and store results. Google plans to drop CrUX field data from this API; read field data from the CrUX API ([DebugBear](https://www.debugbear.com/blog/pagespeed-insights-api)). |
| Search clicks, impressions, CTR, position, top queries | **Search Console API** `searchanalytics.query` by query, page, country, device, date ([reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)) | Service account with `webmasters.readonly`, added as a user of the property ([guide](https://getagenttools.com/tools/google-search-console-api/)) | 16 months of data; useful for the articles. |
| Alternatives | GA4 Data API `runReport` (token quotas, 200,000 a day on a standard property, [owox](https://www.owox.com/blog/articles/google-analytics-api-comparison)); Plausible `POST /api/v2/query` ([docs](https://plausible.io/docs/stats-api)); Umami `/api/websites/:id/stats`, `/pageviews`, `/metrics` ([docs](https://docs.umami.is/docs/api/website-stats)) | Each service's key | Only if the site moves off Vercel Analytics. |

### Proposed widgets

1. **Site traffic** (Vercel Web Analytics API): visitors and page views for 7/30/90 days with the
   trend, top pages, top referrers and countries. Top article and project routes link to their
   edit view (route `/articles/[slug]` → the article with that slug), so editors see which content
   is read. Widget fields: range and metric.
2. **Page speed**: CrUX p75 LCP, INP and CLS for the origin and the home page with the
   good/needs-improvement/poor split and the weekly trend; Lighthouse scores per key page from a
   nightly PageSpeed run.
3. **Search** (optional, Search Console): clicks, impressions and the top queries per article.

### How they would be built

- One server-only client per provider (`src/integrations/vercel.ts`, `google.ts`) reading
  environment variables: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `GOOGLE_API_KEY`
  and, for Search Console, a service account JSON. Values never reach the client.
- Responses cached on the server (`fetch` with `next: { revalidate: 900, tags: ['analytics'] }`),
  so dashboard visits don't use up rate limits, plus a refresh action for admins.
- PageSpeed runs as a Payload Jobs task with a `schedule`, results stored in an admin-only
  collection the widget reads ([Payload jobs queue](https://payloadcms.com/docs/jobs-queue/queues),
  [tasks](https://payloadcms.com/docs/jobs-queue/tasks)). On Vercel, a cron calls Payload's job
  endpoints because there is no long-running process
  ([overview](https://github.com/payloadcms/payload/blob/main/docs/jobs-queue/overview.mdx)).
- A widget without its keys tells admins which variable to set and stays hidden for editors.
- Server components plus the existing sparkline and chart: next to no client JavaScript, so the
  admin bundle budget is unaffected.

## 2. Development and administration tools

Already in the admin: the developer tools menu (code generators, migration status, create
migration, restart the dev server, reset the bundler cache, refresh the site cache, purge pages,
GraphQL Playground, permissions and session JSON), the command menu and the dashboard health
checks. Proposals, in a suggested order:

| # | Tool | What it shows or does | Source | Needs |
| --- | --- | --- | --- | --- |
| 1 | **Deployments** widget | Latest production and preview deployments with state (building, ready, error), commit and author; links to logs; admins can redeploy or roll back with a confirmation | Vercel `GET /v6/deployments` filtered by project, state and target ([reference](https://vercel.com/docs/rest-api/deployments/list-deployments)) | `VERCEL_TOKEN` |
| 2 | **CI status** | Last GitHub Actions run per workflow for `main` and the current branch, failing checks first | GitHub REST API, [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs) | GitHub token (read-only) |
| 3 | **System** view | Versions (app commit, Node, Next, Payload), environment (development, preview, production), which integrations are configured (database, Blob, email, Vercel, Google; set or missing, never values), newer Payload or Next releases on npm | Process info, npm registry | Nothing |
| 4 | **Jobs** panel | Queued, running and failed Payload jobs with retry and cancel; schedules. First jobs: empty old trash, nightly PageSpeed run, broken link check, image size regeneration | Payload Jobs (`payload-jobs` collection, `jobs.autoRun`, `schedule`) ([docs](https://payloadcms.com/docs/jobs-queue/queues)) | Jobs config; a cron on Vercel |
| 5 | **Audit log** | Who created, changed, trashed or deleted what, and when; a dashboard widget and a filterable list | `afterChange` / `afterDelete` hooks into an admin-only collection; Vercel team audit events through an Audit Log drain ([drains](https://vercel.com/docs/drains/using-drains)) | Schema addition |
| 6 | **Database** health | Database and table sizes, row counts, connections, pending migrations | Postgres statistics views, Payload migrations table | Admin-only endpoint |
| 7 | **Storage** | Blob usage, largest uploads, media files no document uses | `@vercel/blob` `list()`, Local API | `BLOB_READ_WRITE_TOKEN` |
| 8 | **Content QA** | Broken external links, images without alt text, missing SEO fields; extends "Needs attention" | Local API, scheduled job | Jobs (4) |
| 9 | **Error tracking** | Unresolved errors with counts and links | Sentry for Next.js and Payload's Sentry plugin, Sentry API | Sentry project |
| 10 | **Uptime** | Up or down and response time of the public site | Uptime service API, or a cron pinging a health endpoint | Service or cron |
| 11 | **Email** | Send a test email, recent sends | Resend API (the adapter is installed) | `RESEND_API_KEY` |
| 12 | **Maintenance mode and redirects** | A switch the site reads to show a maintenance page; a redirects manager | `SiteSettings` global (empty today), Payload redirects plugin | Schema addition |
| 13 | **Sessions and security** | Active sessions per user with revoke, failed logins | Payload auth sessions on Users | Users config |

### Suggested order

1. Site traffic widget (Vercel Web Analytics API): quick, and useful to every editor.
2. Page speed widget: CrUX now, PageSpeed history once jobs exist.
3. Deployments and CI status.
4. Jobs panel with its first jobs (trash clean-up, PageSpeed, link check).
5. Audit log.
6. System view, then the rest as needed.

Each tool is admin-only unless noted, reads secrets on the server only, and caches external calls.
