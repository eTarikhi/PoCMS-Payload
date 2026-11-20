# API & Endpoints Reference

## Public Machine-Readable & Media Routes

| Route | Method | Description |
| --- | --- | --- |
| `/sitemap.xml` | `GET` | Dynamic XML sitemap covering `/`, `/articles`, `/projects`, `/contact`, and indexed detail pages |
| `/robots.txt` | `GET` | Dynamic crawler rules honoring global `SiteSettings.allowIndexing` (disallows `/admin` and `/api`) |
| `/feed.xml` | `GET` | Escaped RSS 2.0 + Atom feed of published on-site articles and project case studies |
| `/og` | `GET` | Branded `1200×630` PNG Open Graph card generator (`?kind=article\|project\|hub&title=...`) |

## Payload REST & Admin GraphQL APIs

- **REST Collections**: `GET /api/<collection>` and `GET /api/<collection>/:id` (e.g., `/api/articles`, `/api/projects`, `/api/media`).
- **REST Globals**: `GET /api/globals/<slug>` (e.g., `/api/globals/site-settings`, `/api/globals/header`).
- **Form Submissions**: `POST /api/form-submissions` (public visitor submission endpoint protected by honeypot validation and IP rate limiting).
- **Admin GraphQL Endpoint**: `POST /api/graphql` requires an authenticated user accepted by `Users.access.admin` (`hasAnyRole`). The Admin GraphQL inspector uses this route.
- **GraphQL Playground**: `GET /api/graphql-playground` has the same authorization gate. This app serves it in development and disables it in production; production introspection remains disabled.
- **Public persisted GraphQL**: `POST /api/fgql` exposes a fixed 16-operation server-owned read registry for public content; arbitrary query text, batching, introspection, and mutations are rejected, and authentication headers are stripped. Documents, images, and uploaded files continue to be served via REST (`GET /api/media/file/:filename`), and `Folder` / `Media` are excluded as GraphQL data sources. Verified against Payload 3.90.2 on an isolated loopback PostgreSQL instance (`pnpm test:int:postgres`); rate limiting in-app is process-local (not a distributed/global limiter) unless paired with edge rate limiting. See [Public persisted GraphQL status](./public-persisted-graphql.md).

## Webhook & Custom Admin Endpoints

All `/api/admin-*`, `/api/mail/*`, and `/api/dev-*` endpoints enforce session authentication and RBAC capability checks (`hasCapability`):

| Endpoint | Capability / Auth | Purpose |
| --- | --- | --- |
| `POST /api/webhooks/resend` | Svix HMAC-SHA256 (`RESEND_WEBHOOK_SECRET`) | Ingests Resend `email.received` and outbound delivery telemetry events |
| `GET /api/mail/inbox`, `POST /api/mail/send`, `GET /api/mail/stream` | `manageInbox` | Powers the `/admin/inbox` 3-pane workspace, outbound composer, and SSE live updates |
| `GET/POST /api/admin-database/*` | `manageDatabase` | Powers `/admin/database` diagnostics, encrypted backups, restores, repairs, and provider controls |
| `GET/POST /api/admin-jobs` | `manageJobs` | Inspects, queues, runs, and cancels Payload Jobs Queue tasks |
| `GET/POST /api/admin-versions` | Admin / Editor | Inspects version counts and prunes old document revisions |
| `GET /api/system-info` | `viewSystem` | Supplies runtime, integration readiness, and environment health for `/admin/system` |
| `GET /api/media-frame`, `GET /api/public-images` | Authenticated editor | Generates framed `16:9` WebP media cards and browses `/public/images` |
