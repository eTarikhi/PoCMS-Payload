# Overview

PoCMS is a full-stack portfolio and editorial Content Management System built on **Payload CMS 3.90.2** and **Next.js 16 App Router**, backed by **PostgreSQL** (Neon / standard Postgres) and **Vercel Blob** cloud storage.

## Key features

- **Payload CMS 3 + Next.js 16 App Router** in a single unified TypeScript deployment (`(frontend)` + `(payload)` route groups)
- **Editorial & Case-Study Publishing**: Drafts, scheduled publishing, version retention & pruning, custom Lexical rich-text blocks (Shiki code blocks, multi-file code tabs, callouts, KPI metrics, Mermaid-lite diagrams, resizable media), and Two-Block Media (`primaryMedia` + `detailMedia`)
- **Complete Technical SEO Suite**: Per-document SEO tabs (`2.A`), Archive Hub SEO (`2.B`), site-wide verification/social/`Person` JSON-LD (`2.C`), branded `1200×630` Dynamic Open Graph fallback cards (`GET /og`, `2.D`), `301`/`302` redirects, `/sitemap.xml`, `/robots.txt`, and `/feed.xml`
- **CMS-Managed Forms (`/contact` & `Request CV`)**: Powered by `@payloadcms/plugin-form-builder` with honeypot + rate-limiting protection
- **Self-Contained `mailInboxPlugin` (`/admin/inbox`)**: Resend inbound/outbound email, Svix HMAC webhook verification, private attachments, SSE live updates, and website form-submission threads
- **Two-Tier `databaseManagerPlugin` (`/admin/database`)**: PostgreSQL vitals, pure-TypeScript logical backups, AES-256-GCM encrypted Vercel Blob vault, transactional restores, and Neon / Supabase / Prisma Tier-2 adapters
- **Site-Wide `Codes` Global (`custom-code`)**: Governed `<head>`, CSS, after-footer, and `<body>` snippet injection with emergency env kill-switches
- **Granular RBAC & Audit Trail**: Role-based collection/global/capability permissions (`Users`, `Roles`, `AuditLogs`)
- **Automated Quality Gates**: TypeScript, ESLint, Vitest integration suites (`pnpm test:int`), Playwright + `@axe-core/playwright` E2E (`pnpm test:e2e`), and GitHub Actions CI (`.github/workflows/ci.yml`)

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.3 (App Router, React 19, Turbopack) |
| Headless CMS | Payload CMS 3.90.2 |
| Language | TypeScript 5.7 |
| Database | PostgreSQL 16 / Neon Serverless Postgres (`@payloadcms/db-vercel-postgres`, `pg`, `@neon/sdk`) |
| Object Storage | Vercel Blob (`@payloadcms/storage-vercel-blob`, `@vercel/blob`) with local `./media` fallback |
| Transactional & Inbound Email | Resend (`@payloadcms/email-resend` + `mailInboxPlugin` webhooks) |
| Testing | Vitest + Testing Library (`tests/int`), Playwright + `@axe-core/playwright` (`tests/e2e`) |
| Containerization & CI | Docker (`Dockerfile`, `docker-compose.yml`) & GitHub Actions (`.github/workflows/ci.yml`) |
