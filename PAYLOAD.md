# PoCMS — Payload CMS 3 Architecture & Quick Reference

PoCMS runs **Payload CMS 3.90.2** embedded directly inside **Next.js 16 App Router**, backed by **PostgreSQL** (`@payloadcms/db-vercel-postgres` / Neon) and optional **Vercel Blob** object storage (`@payloadcms/storage-vercel-blob`).

---

## Local Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Generate a strong `PAYLOAD_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and verify `POSTGRES_URL` points to a local PostgreSQL 16 database or Neon branch.
3. Install dependencies, generate Payload artifacts, and start the dev server:
   ```bash
   pnpm install
   pnpm run generate:all
   pnpm dev
   ```
4. Open `http://localhost:3000` (public portfolio) or `http://localhost:3000/admin` (Payload Admin UI).
   - To populate initial portfolio content, run `pnpm run seed`.

---

## Docker Compose (PostgreSQL 16 + App)

To run PostgreSQL 16 and the Next.js/Payload dev server via Docker Compose:

```bash
cp .env.example .env
docker compose up -d
```

- PostgreSQL 16 listens on `localhost:5432` (`postgres://postgres:postgres@127.0.0.1:5432/pocms`).
- Inside the Compose network, the `payload` service connects automatically via `postgres://postgres:postgres@postgres:5432/pocms`.
- Production container builds (`docker build -t pocms .`) automatically set `DOCKER_BUILD=true` so `next.config.ts` emits `.next/standalone`.

---

## Core Collections, Globals & Custom Plugins

### Collections
- **Editorial & Portfolio**: `articles`, `projects` (drafts, scheduled publish, version retention pruning, two-block `primaryMedia` / `detailMedia`, Lexical case-study blocks, and tabbed SEO), `media` (focal points, WebP responsive sizes, `sharp` LQIP `blurDataURL`, hierarchical folders).
- **Profile Sections**: `about`, `experiences`, `educations`, `certificates`, `services`, `skills`.
- **Forms & Routing**: `forms`, `form-submissions` (`@payloadcms/plugin-form-builder` powering `/contact` and `Request CV`), `redirects` (`301`/`302` rules).
- **Governance & Mail**: `users`, `roles` (capability-based RBAC), `audit-logs`, `mail-threads`, `mail-messages`, `mail-labels`, `mail-attachments`.

### Globals (`Site settings` group)
- **`Header` (`header`)**: Hero profile configuration plus tabbed **Header Studio** presets (*Aurora Mesh*, *Blueprint Grid*, *Editorial Spotlight*, *Minimal*) and default archive layout modes.
- **`SiteSettings` (`site-settings`)**: Canonical metadata, Hub SEO (`/articles`, `/projects`), social/Twitter attribution, search verification tags, indexing controls, and `Schema.org/Person` JSON-LD fields.
- **`Navigation` (`navigation`) & `Footer` (`footer`)**: Split desktop/mobile navigation links, social links, and contact details.
- **`Codes` (`custom-code`)**: Admin-governed `<head>` meta/links, site-wide CSS, after-footer HTML, and `<body>` scripts protected by `DISABLE_CUSTOM_CODE_INJECTION` / `NEXT_PUBLIC_DISABLE_CUSTOM_CODE` emergency kill-switches.

### Custom Plugins (`src/plugins/`)
- **`mailInboxPlugin` (`src/plugins/mailInbox/`)**: Self-contained 3-pane Mail Inbox (`/admin/inbox`) with Resend outbound sending, Receiving API MIME + attachment ingestion, Standard Webhooks (`whsec_...`) HMAC-SHA256 verification (`POST /api/webhooks/resend`), PostgreSQL `LISTEN/NOTIFY` SSE real-time updates (`GET /api/mail/stream`), private RBAC attachments, and automatic `form-submissions` thread bridging.
- **`databaseManagerPlugin` (`src/plugins/databaseManager/`)**: Two-tier PostgreSQL console (`/admin/database`) featuring pure-TypeScript logical backups (`.json`, `.ndjson`, `.sql`, `.csv`), AES-256-GCM encrypted Vercel Blob vault storage, dry-run & transactional restores, bloat/sequence repair, and optional Tier-2 serverless adapters (`@neon/sdk`, Supabase, Prisma Postgres).
- **`auditLogPlugin` & `adminUIPlugin`**: Immutable audit trail, custom dashboard telemetry widgets (Vercel traffic/deployments, PageSpeed/CrUX, GitHub Actions CI, Content Health, Mail Inbox), `/admin/system`, and `/admin/jobs`.
