# Project structure

```text
PoCMS-Payload/
├── .github/workflows/
│   └── ci.yml                 # GitHub Actions CI (typecheck, lint, Vitest, build, Playwright E2E)
├── public/                    # Static portfolio assets, icons, and webmanifest
├── scripts/
│   ├── generate.mjs           # Payload types, importMap, DB schema & GraphQL generator
│   └── generate-nav-icons.mjs # Scoped admin sidebar CSS icon generator
├── src/
│   ├── access/                # Capability-based RBAC, role helpers, and orderable/draft hooks
│   ├── app/
│   │   ├── (frontend)/        # Public Next.js portfolio, /articles, /projects, /contact & styles
│   │   ├── (payload)/         # Payload Admin UI (/admin/*), REST (/api/*) & GraphQL (/api/graphql)
│   │   ├── feed.xml/          # RSS 2.0 + Atom syndication route (/feed.xml)
│   │   ├── og/                # Branded 1200x630 Dynamic Open Graph ImageResponse route (/og)
│   │   ├── robots.ts          # Dynamic robots.txt route
│   │   └── sitemap.ts         # Dynamic sitemap.xml route
│   ├── blocks/                # Lexical custom blocks (Code, CodeTabs, Callout, Metrics, Diagram, Media)
│   ├── collections/           # Payload collections (Articles, Projects, Media, Users, Roles, AuditLogs, …)
│   ├── components/admin/      # Custom Admin views (/admin/inbox, /admin/database, /admin/system, /admin/jobs) & widgets
│   ├── endpoints/             # Custom authenticated REST endpoints (jobs, versions, media-frame, devtools)
│   ├── fields/                # Reusable Payload field builders (mediaBlocks, richText, color, url)
│   ├── globals/               # Site-wide singletons (Header, SiteSettings, Navigation, Footer, CustomCode)
│   ├── integrations/          # Server-side Vercel, Google PageSpeed/CrUX & GitHub Actions clients
│   ├── jobs/                  # Payload Jobs Queue tasks & schedules
│   ├── lib/                   # Security headers, secret validation, system diagnostics & stream helpers
│   ├── plugins/               # Modular Payload plugins:
│   │   ├── databaseManager/   #   PostgreSQL console, AES-256-GCM backups, restores & Neon/Supabase/Prisma adapters
│   │   ├── mailInbox/         #   Resend inbound/outbound 3-pane inbox, Svix webhooks, SSE & form bridge
│   │   ├── adminUI.ts         #   Admin navigation, custom views & dashboard widget registration
│   │   ├── auditLog.ts        #   Automatic collection/global mutation audit logging
│   │   ├── formBuilder.ts     #   Contact & Request-CV form builder with honeypot & rate limiting
│   │   └── seoAndRedirects.ts #   Tabbed per-document SEO fields & 301/302 redirects
│   ├── seed/                  # Idempotent portfolio & forms database seeder
│   └── payload.config.ts      # Root Payload CMS configuration
├── tests/
│   ├── int/                   # Vitest integration & UI test suites
│   └── e2e/                   # Playwright browser & @axe-core/playwright accessibility specs
├── .env.example               # Comprehensive documented environment variable template
├── Dockerfile                 # Multi-stage standalone production container
├── docker-compose.yml         # Local PostgreSQL 16 + Next.js/Payload stack
└── next.config.ts             # Next.js 16 + withPayload configuration & security headers
```

## Architectural boundaries

- **Frontend / Admin Style Isolation**: `src/app/(frontend)` uses Bootstrap 5 + scoped `.pocms-*` / CSS Modules without loading Tailwind CSS, while `src/components/admin` uses `acn:`-prefixed Tailwind v4 utilities so Payload Admin styles never collide.
- **RSC Projection Discipline**: All frontend database reads go through `src/app/(frontend)/lib/payload-source.ts` with explicit `select` projections and granular Next.js cache tags (`revalidateTag`), keeping static/ISR pages fast and decoupled from Admin mutations.
- **Modular Plugins**: Subsystems such as `mailInboxPlugin` and `databaseManagerPlugin` encapsulate their own collections, endpoints, workflows, and Admin views cleanly via Payload's plugin API.
