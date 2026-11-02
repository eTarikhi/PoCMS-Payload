# PostgreSQL & Neon Database Architecture (`@payloadcms/db-vercel-postgres`)

This document serves as the architectural reference, **Phase 0–3 Optimization Audit**, failure-classification registry, and prioritized corrective roadmap for the PoCMS database layer running on **Payload CMS v3.90.2** (`@payloadcms/db-vercel-postgres` / Drizzle ORM) backed by **Neon Serverless PostgreSQL**.

---

## 1. Runtime Topology & Connection Lifecycle

| Layer | Connection String | Transport | Pool Sizing & Timeouts |
| :--- | :--- | :--- | :--- |
| **Vercel Serverless / Next.js Runtime (`src/payload.config.ts`)** | `POSTGRES_URL` (`-pooler.` PgBouncer transaction-mode endpoint) | `@vercel/postgres` (`@neondatabase/serverless` WebSocket Pool) + Node DNS / DoH resilience (`src/lib/nodeDnsFallback.ts`) | `max: 5` (default serverless), `idleTimeoutMillis: 15_000`, `connectionTimeoutMillis: 10_000`, `maxUses: 7_500` (`src/lib/postgresPoolConfig.ts`) |
| **Admin Database Workspace & Online Optimization (`src/plugins/databaseManager/`, `scripts/migrate-neon.mjs`)** | Prefers `POSTGRES_URL_NON_POOLING` (direct PostgreSQL session) and falls back to `POSTGRES_URL` | Dual-driver resilient executor: native TCP TLS (`pg.Client` on `:5432`) with automatic HTTPS `:443` Neon HTTP SQL fallback when local ISPs/firewalls drop `:5432` | Dedicated single-client session (`max: 1`) for `VACUUM`, `REINDEX`, `ANALYZE`, `CREATE INDEX CONCURRENTLY`, and Drizzle-aligned data migrations (`pnpm db:optimize`) |

### Key Runtime Invariants (`Phase 0`, `R-01`–`R-05`)
1. **Explicit Serverless Pool Bounds (`R-01`):** `@payloadcms/db-vercel-postgres` defaults to `pg.Pool({ max: 10 })` per Node isolate if `pool` is omitted. Passing `buildVercelPostgresPoolConfig()` caps each Fluid Compute / Lambda worker at `max: 5` and recycles idle sockets before Neon scale-to-zero suspend windows (`15s`).
2. **Non-Blocking Request Telemetry (`R-02`):** Login success/failure audit entries (`src/collections/Users.ts`) and `/api/mail/webhooks/resend` receipt/signature-rejection events (`src/plugins/mailInbox/endpoints/webhookEndpoint.ts`) are dispatched via `enqueueAuditLog()` (`queueMicrotask`) so audit inserts never block user-facing HTTP responses or commit inside an open parent transaction.
3. **Bounded Schema Introspection & Streaming Exports (`R-03`, `R-04`):**
   - `/admin/database` aggregates columns, primary keys, foreign keys, and row estimates across **3 catalog queries total** (`O(1)` round-trips regardless of table count) instead of `3 × N` per-table queries.
   - `exportStreamingSqlDump()` and `exportStreamingNdjsonDump()` stream table rows in keyset-paginated `500`-row chunks (`WHERE "id" > $cursor ORDER BY "id" ASC LIMIT 500`), keeping Node.js V8 heap usage flat.
4. **Payload v3 Drizzle Schema Alignment (`R-06`, `R-08a`, `R-09a`, `R-10`, `R-13a`):**
   - `phase1BeforeSchemaInit` (`src/lib/postgresSchemaHooks.ts`) mutates Payload's `adapter.rawTables` **before** Drizzle table materialization, making `src/payload-generated-schema.ts`, `pnpm dev` (`pushDevSchema`), and `pnpm db:optimize` **100% identical** with zero index or foreign-key churn:
     - `mail_messages.thread_id` (`NOT NULL`) enforces `ON DELETE CASCADE` (`R-06`).
     - `form_submissions.form_id` drops `.notNull()` at the SQL column level so `ON DELETE SET NULL` succeeds (`R-06`).
     - All 7 `*_texts` tables build composite `(parent_id, path, "order")` B-tree indexes (`R-08a`).
     - High-selectivity composite/covering B-tree indexes replace standalone boolean B-trees across `mail_threads`, `mail_messages`, `_articles_v`, `_projects_v`, and `payload_jobs` (`R-08a`, `R-09a`), while `mail_messages` and `mail_webhook_events` set `lockDocuments: false` (`R-09a`).
   - `blocksAsJSON: true` on `vercelPostgresAdapter` (`R-10`) stores Form Builder polymorphic blocks in a single `forms.fields` `jsonb` column instead of 9 sparse `forms_blocks_*` join tables.
   - `phase3BeforeSchemaInit` (`R-13a`) registers `mail_message_bodies` in both `schema.tables` and `adapter.rawTables` so cold MIME payloads (`sanitized_html`, `quoted_history_text`, `headers_snapshot`) live in a lazy-loaded 1:1 sidecar table (`ON DELETE CASCADE`) with private Vercel Blob cold archival (`archiveColdMailBodies`).

---

## 2. Active Drizzle-Native PostgreSQL DDL Reference

All active indexes below are declared in `src/lib/postgresSchemaHooks.ts` (`beforeSchemaInit`), reflected verbatim in `src/payload-generated-schema.ts`, and idempotently ensured online via `pnpm db:optimize` / `pnpm db:optimize-indexes` (`CREATE INDEX CONCURRENTLY IF NOT EXISTS` over `POSTGRES_URL_NON_POOLING`):

```sql
-- 1. All 7 Payload hasMany text tables (projects, _projects_v, about, services, header, site_settings, footer)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "<table_name>_parent_path_order_idx"
  ON "public"."<table_name>" ("parent_id", "path", "order");

-- 2. Version pruning & latest-draft lookup composites
CREATE INDEX CONCURRENTLY IF NOT EXISTS "_articles_v_parent_updated_idx"
  ON "public"."_articles_v" ("parent_id", "updated_at");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "_projects_v_parent_updated_idx"
  ON "public"."_projects_v" ("parent_id", "updated_at");

-- 3. Mail Inbox folder counts, timeline pagination & thread message ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "mail_threads_counts_cover_idx"
  ON "public"."mail_threads" ("folder", "is_read", "is_starred");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "mail_threads_folder_last_msg_idx"
  ON "public"."mail_threads" ("folder", "last_message_at");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "mail_messages_thread_sent_idx"
  ON "public"."mail_messages" ("thread_id", "sent_at");

-- 4. Payload Jobs queue lookup composite
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payload_jobs_queue_wait_created_idx"
  ON "public"."payload_jobs" ("queue", "wait_until", "created_at");
```

---

## 3. Comprehensive Phase 0–3 Audit Report (`completed`, `undone`, and `deferred`)

Every action and sub-step across **Phase 0 through Phase 3** — including the deferred items **`R-11`** and **`R-14`** — has been audited against official **Payload CMS v3.90.2** documentation (`docs/database/migrations.mdx`, `docs/database/postgres.mdx`, `docs/fields/join.mdx`) and **`@payloadcms/drizzle@3.90.2` / `drizzle-kit@0.31.7`** source & runtime behavior.

### 3.1 Failure & Compatibility Classification Taxonomy

| Classification Tag | Meaning |
| :--- | :--- |
| **`violation conflict`** | Directly violates an explicit rule in official Payload CMS v3.90.2 documentation (`docs/database/migrations.mdx`: *"do not mix 'push' and migrations"*). |
| **`incompatible with payload docs`** | Alters or proposes altering a Payload-managed table/column into a PostgreSQL structure unsupported by `@payloadcms/drizzle` / `drizzle-kit` (e.g., `relkind = 'p'` declarative partitioned collection table, overriding child array `varchar('id')` ObjectID PKs to `bigint identity`, or replacing `*_texts` tables with raw `text[]` columns out-of-band). |
| **`schema-push conflict`** | Valid PostgreSQL DDL created out-of-band via raw SQL without registering matching Drizzle `pg-core` builders in `afterSchemaInit` (`extendTable`), causing Drizzle `pushDevSchema()` (`pnpm dev`) to drop or overwrite those indexes on startup. |
| **`compatible (content-model refactor)`** | Supported natively by Payload 3 (`relationship` + virtual `join` collections, `json` fields, `Users.legacyRoles` retirement), but alters REST/Local API & GraphQL document shapes (`string[]` -> populated relationships) and requires coordinated frontend/seed migrations. |
| **`compatible (zero-drift SQL tuning)`** | Safe PostgreSQL catalog optimization (`ALTER SEQUENCE <serial_seq> CACHE 64` on owned `serial` sequences) that `drizzle-kit` ignores during `pushDevSchema()` and `migrate:create`. |

---

### 3.2 Master Step-by-Step Audit Matrix (Phases 0–3, Including `R-11` & `R-14`)

| Phase | ID | Action / Optimization Sub-Step | Primary Files | Audit Status | Classification (`undone` / `deferred`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 0** | `R-01` | Bounded serverless Neon WebSocket pool configuration (`max: 5`, `idleTimeoutMillis: 15_000`, `connectionTimeoutMillis: 10_000`, `maxUses: 7_500`) wired into `vercelPostgresAdapter({ pool })` | `src/lib/postgresPoolConfig.ts`, `src/payload.config.ts` | **`completed`** | — |
| **Phase 0** | `R-02` | Asynchronous `enqueueAuditLog()` (`queueMicrotask`) decoupling audit-log writes from auth hooks and Resend webhook responses | `src/lib/auditLogQueue.ts`, `src/collections/Users.ts`, `src/plugins/mailInbox/endpoints/webhookEndpoint.ts` | **`completed`** | — |
| **Phase 0** | `R-03` | Batched 3-query PostgreSQL catalog introspection (`O(1)` round-trips) + `preferUnpooled` direct session routing for maintenance DDL in `/admin/database` | `src/plugins/databaseManager/core/{introspect,pgDirect,repair}.ts` | **`completed`** | — |
| **Phase 0** | `R-04` | Constant-memory keyset-paginated (`500`-row cursor) streaming SQL & NDJSON logical backup generators | `src/plugins/databaseManager/core/backup.ts` | **`completed`** | — |
| **Phase 0** | `R-05` | Single-query `GROUP BY folder` aggregate counts (`getMailFolderCounts`) replacing 14 sequential `payload.count()` calls per inbox poll | `src/plugins/mailInbox/services/folderCounts.ts` | **`completed`** | — |
| **Phase 1** | `R-06.1` | Fix `mail_messages.thread_id` (`NOT NULL`) FK contradiction from `ON DELETE SET NULL` to `ON DELETE CASCADE` in both `beforeSchemaInit` and SQL `DO $$` guard | `src/lib/postgresSchemaHooks.ts`, `src/lib/phase1SqlOptimizations.ts` | **`completed`** | — |
| **Phase 1** | `R-06.2` | Drop SQL `NOT NULL` on `form_submissions.form_id` in `beforeSchemaInit` and SQL `DO $$` guard so `ON DELETE SET NULL` succeeds while preserving Admin UI `required: true` | `src/lib/postgresSchemaHooks.ts`, `src/lib/phase1SqlOptimizations.ts` | **`completed`** | — |
| **Phase 1** | `R-07a` | Neon-aware CLI wrapper (`pnpm db:migrate*`, `pnpm db:optimize*`) promoting `POSTGRES_URL_NON_POOLING`, dual TCP `:5432` / HTTPS `:443` Neon HTTP fallback, and DNS/DoH + Node 24 `ws` `ErrorEvent` resilience (`fs.realpathSync` anchor preserving Next.js 16 Turbopack pure-ESM `serverExternalPackages` for `@payloadcms/db-vercel-postgres`, skipped on `VERCEL=1`) | `scripts/migrate-neon.mjs`, `scripts/dns-fallback.mjs`, `src/lib/nodeDnsFallback.ts` | **`completed`** | — |
| **Phase 1** | `R-07b` | Committing custom `src/migrations/20261031_001_*` snapshots and deleting `payload_migrations` `batch = -1` dev sentinel while local `pnpm dev` runs Drizzle `push` | `src/migrations/*` *(removed)*, `scripts/migrate-neon.mjs`, `.gitignore` | **`undone`** | **`violation conflict`** |
| **Phase 1** | `R-08a` | 13 Drizzle-native composite/covering B-tree indexes in `beforeSchemaInit` (`7` `*_texts_parent_path_order_idx`, `_articles_v_parent_updated_idx`, `_projects_v_parent_updated_idx`, `mail_threads_counts_cover_idx`, `mail_threads_folder_last_msg_idx`, `mail_messages_thread_sent_idx`, `payload_jobs_queue_wait_created_idx`) + online `CONCURRENTLY` sync | `src/lib/postgresSchemaHooks.ts`, `src/lib/phase1SqlOptimizations.ts`, `/admin/database` | **`completed`** | — |
| **Phase 1** | `R-08b` | 6 out-of-band raw SQL partial `WHERE` & `pg_trgm` GIN expression indexes (`idx_articles_public_feed`, `idx_projects_public_feed`, `idx_articles_v_latest_updated`, `idx_projects_v_latest_updated`, `idx_mail_threads_search_trgm`, `idx_payload_jobs_runnable`) | `src/lib/phase1SqlOptimizations.ts` *(pruned & undone)* | **`undone`** | **`schema-push conflict`** |
| **Phase 1** | `R-09a` | Prune standalone low-selectivity boolean B-tree indexes in `beforeSchemaInit` (`is_read`, `is_starred`, `has_attachments`, `direction`, `status`, `autosave`, `processing`, `has_error`) and set `lockDocuments: false` on `mail-messages` & `mail-webhook-events` | `src/lib/postgresSchemaHooks.ts`, `src/plugins/mailInbox/collections/{MailMessages,MailWebhookEvents}.ts` | **`completed`** | — |
| **Phase 1** | `R-09b` | Replace Payload's 19 standard `payload_locked_documents_rels_*_id_idx` indexes with 21 out-of-band raw SQL `WHERE "<col>_id" IS NOT NULL` partial indexes (`idx_pld_rels_*_nn`) | `src/lib/phase1SqlOptimizations.ts` *(pruned & standard Drizzle indexes restored)* | **`undone`** | **`schema-push conflict`** |
| **Phase 2** | `R-10` | Enable official `blocksAsJSON: true` on `vercelPostgresAdapter` + lossless idempotent backfill from legacy `forms_blocks_*` tables into `forms.fields` `jsonb` | `src/payload.config.ts`, `src/lib/phase2And3SqlOptimizations.ts` | **`completed`** | — |
| **Phase 2** | `R-11a` | Normalize shared taxonomies (`Projects.categories`, `Articles.category`, `Projects.techStack` <-> `Skills` / `SiteSettings.knowsAbout`) via Payload `relationship` + virtual `join` fields and retire `Users.legacyRoles` (`users_roles`) | `src/collections/{Projects,Articles,Skills,Users}.ts`, `src/globals/SiteSettings.ts` | **`deferred`** | **`compatible (content-model refactor)`** |
| **Phase 2** | `R-11b` | Collapse Payload `hasMany: true` `text` tables (`projects_texts`, `about_texts`, `services_texts`, `header_texts`, `site_settings_texts`, `footer_texts`) into native PostgreSQL `text[]` columns | `src/collections/{Projects,About,Services}.ts`, `src/globals/{Header,SiteSettings,Footer}.ts` | **`deferred (do not apply as raw text[])`** | **`incompatible with payload docs`** |
| **Phase 2** | `R-12` | Automated Payload Jobs retention tasks (`pruneMailWebhookEvents` daily `15 3 * * *` >30d, `prunePayloadJobsHistory` daily `45 3 * * *` >7d/>30d, `pruneAuditLogs` daily `30 3 * * *` >180d with optional NDJSON.gz Vercel Blob export) | `src/payload.config.ts`, `src/plugins/mailInbox/jobs/maintenanceTasks.ts`, `src/jobs/auditLogRetention.ts` | **`completed`** | — |
| **Phase 3** | `R-13a` | Cold MIME `mail_message_bodies` 1:1 sidecar table registered in `beforeSchemaInit` (`schema.tables` + `adapter.rawTables`), lazy read/write store, lossless backfill, and weekly Vercel Blob cold archival (`archiveColdMailBodies` at `20 4 * * 0`) | `src/lib/postgresSchemaHooks.ts`, `src/plugins/mailInbox/services/messageBodiesStore.ts`, `src/lib/phase2And3SqlOptimizations.ts` | **`completed`** | — |
| **Phase 3** | `R-13b` | Convert Payload-managed `audit_logs` collection table into a PostgreSQL declarative `PARTITION BY RANGE (created_at)` parent table (`relkind = 'p'`) with composite PK `(id, created_at)` and monthly child partitions | `src/lib/phase2And3SqlOptimizations.ts` *(replaced by lossless `restoreAuditLogsHeapIfPartitioned`)*, `src/payload.config.ts` | **`undone`** | **`incompatible with payload docs`** |
| **Phase 3** | `R-14a` | Convert live child array/block `varchar('id')` primary keys (16 tables: `articles_detail_media_items`, `projects_gallery`, `users_sessions`, `payload_jobs_log`, etc.) to `bigint GENERATED BY DEFAULT AS IDENTITY` or `UUIDv7` | `@payloadcms/drizzle` child array tables (`src/payload-generated-schema.ts`) | **`deferred (do not apply)`** | **`incompatible with payload docs`** |
| **Phase 3** | `R-14b` | Tune `CACHE 64` on high-write PostgreSQL `serial` primary key sequences (`audit_logs_id_seq`, `payload_jobs_id_seq`, `_articles_v_id_seq`, `_projects_v_id_seq`, `mail_webhook_events_id_seq`, `mail_messages_id_seq`) | `src/lib/phase2And3SqlOptimizations.ts` *(candidate)* | **`deferred`** | **`compatible (zero-drift SQL tuning)`** |

---

### 3.3 Detailed Technical Justifications for Every `undone` Step

#### 1. `R-07b` — Mixing Drizzle `push` Mode with Tracked Migrations & Deleting `batch = -1`
- **Status:** `undone`
- **Failure Classification:** **`violation conflict`**
- **Technical Root Cause:**
  1. Payload CMS v3.90.2 (`docs/database/migrations.mdx`) explicitly mandates: *"do not mix 'push' and migrations with your local development database"*.
  2. When `push` is left at its default in `vercelPostgresAdapter`, `pnpm dev` invokes `@payloadcms/drizzle`'s `pushDevSchema()`, which writes a sentinel record (`name = 'dev'`, `batch = -1`) into `payload_migrations` so Payload warns before executing static migrations against a `db push`-mutated database.
  3. Previously, `scripts/migrate-neon.mjs` executed `DELETE FROM "payload_migrations" WHERE "batch" = -1` and committed hand-authored migration snapshots under `src/migrations/`, silently bypassing Payload's schema-drift safety check while `/src/migrations` was simultaneously ignored per repository configuration (`01ba587`) and `pnpm dev` continued running `pushDevSchema()`.
- **Undo & Restoration Applied:**
  - Removed tracked `src/migrations/*` files (keeping `/src/migrations` in `.gitignore`), removed the `DELETE FROM "payload_migrations" WHERE "batch" = -1` bypass from `scripts/migrate-neon.mjs`, and added idempotent `batch = -1` dev-sentinel restoration during `pnpm db:optimize` whenever no positive-batch production migrations remain.

#### 2. `R-13b` — Declarative Monthly Range Partitioning (`PARTITION BY RANGE (created_at)`) on `audit_logs`
- **Status:** `undone`
- **Failure Classification:** **`incompatible with payload docs`**
- **Technical Root Cause:**
  1. **Drizzle Catalog Introspection Blind Spot:** `@payloadcms/drizzle` delegates schema diffing (`pushDevSchema` and `payload migrate:create`) to `drizzle-kit@0.31.7`, which queries `pg_class` filtering `c.relkind IN ('r', 'v', 'm')` (ordinary heap tables, views, materialized views). Converting `audit_logs` to a partitioned parent changes `pg_class.relkind` to `'p'` and creates child partitions (`audit_logs_default`, `audit_logs_yYYYYmMM`) as separate `relkind = 'r'` tables. On the next `pnpm dev` start, Drizzle believes `audit_logs` does not exist, attempts `CREATE TABLE "audit_logs"` (failing with `42P07: relation "audit_logs" already exists`), and attempts to drop all child partitions.
  2. **Composite Primary Key & Foreign Key Mismatch:** PostgreSQL requires every `UNIQUE` / `PRIMARY KEY` constraint on a partitioned table to include all partition key columns (`PRIMARY KEY (id, created_at)`), whereas Payload 3 collections assume a single-column `PRIMARY KEY (id)` referenced by single-column foreign keys (such as `payload_locked_documents_rels.audit_logs_id -> audit_logs(id)`), which PostgreSQL rejects with `SQLSTATE 42830`.
- **Undo & Restoration Applied:**
  - Restored `AuditLogs` to standard Payload collection locking defaults, removed the `maintainAuditLogPartitions` cron task (automatically cleaning up any historic `task_slug = 'maintainAuditLogPartitions'` rows in `payload_jobs` / `payload_jobs_log` so Drizzle enum updates succeed cleanly), retained daily retention + optional NDJSON.gz archival via `pruneAuditLogs` (`R-12`), and added transactional `restoreAuditLogsHeapIfPartitioned()` in `pnpm db:optimize` to losslessly convert any partitioned `audit_logs` (`relkind = 'p'`) back into a standard heap table (`relkind = 'r'`) with `PRIMARY KEY (id)` and restored sequence ownership.

#### 3. `R-08b` — Out-of-Band Raw SQL Partial (`WHERE`) & `pg_trgm` GIN Expression Indexes
- **Status:** `undone`
- **Failure Classification:** **`schema-push conflict`**
- **Technical Root Cause:**
  1. Payload 3 provides two distinct Drizzle schema hooks (`docs/database/postgres.mdx`):
     - `beforeSchemaInit`: Mutates `adapter.rawTables` (`RawTable` JSON objects) before Drizzle builds `pgTable` instances. `RawIndex` in `@payloadcms/drizzle` only supports `{ name, on, unique }` (standard B-tree column lists) — it cannot represent partial `WHERE` predicates (`sql\`...\``) or `.using('gin', ...)`.
     - `afterSchemaInit`: Mutates materialized Drizzle tables via `extendTable({ table, extraConfig })`, where full `drizzle-orm/pg-core` index builders (`index(...).where(...)`, `.using('gin', ...)`) ARE supported during `pushDevSchema()` and `migrate:create`.
  2. Because the 6 `R-08b` indexes (`idx_articles_public_feed`, `idx_projects_public_feed`, `idx_articles_v_latest_updated`, `idx_projects_v_latest_updated`, `idx_mail_threads_search_trgm`, `idx_payload_jobs_runnable`) were created purely via out-of-band raw SQL in `phase1SqlOptimizations.ts` without matching `afterSchemaInit` `extendTable` declarations, `drizzle-kit` `pushSchema` saw 6 unknown indexes in `pg_indexes` on every `pnpm dev` startup and generated `DROP INDEX` statements for all 6.
- **Undo & Restoration Applied:**
  - Removed all 6 out-of-band partial/GIN index definitions from `buildPhase1OptimizationPlan()`, normalized `_articles_v_parent_updated_idx`, `_projects_v_parent_updated_idx`, and `mail_threads_folder_last_msg_idx` to match Drizzle's column order, and added `DROP INDEX [CONCURRENTLY] IF EXISTS` cleanup in `pnpm db:optimize` so zero out-of-band indexes remain to conflict with `pushDevSchema()`.

#### 4. `R-09b` — Out-of-Band Partial `WHERE <col>_id IS NOT NULL` Indexes on `payload_locked_documents_rels`
- **Status:** `undone`
- **Failure Classification:** **`schema-push conflict`**
- **Technical Root Cause:**
  1. Payload 3 automatically generates 19 standard single-column B-tree indexes (`payload_locked_documents_rels_<entity>_id_idx`) in `adapter.tables.payload_locked_documents_rels` for every collection with document locking enabled.
  2. `phase1SqlOptimizations.ts` previously dropped those 19 Drizzle-managed indexes out-of-band and created 21 partial `idx_pld_rels_<entity>_nn` (`WHERE "<col>_id" IS NOT NULL`) indexes via raw SQL. On every subsequent `pnpm dev` start, Drizzle `pushDevSchema()` dropped all 21 `idx_pld_rels_*_nn` indexes and recreated all 19 `payload_locked_documents_rels_*_id_idx` indexes, causing continuous DDL churn between `pnpm db:optimize` and `pnpm dev`.
- **Undo & Restoration Applied:**
  - Updated `phase1SqlOptimizations.ts` to drop all 21 `idx_pld_rels_*_nn` partial indexes and ensure the exact 19 standard Drizzle `payload_locked_documents_rels_<entity>_id_idx` indexes (`lockDocuments: false` remains active on `mail_messages` and `mail_webhook_events` via `R-09a`), eliminating 100% of index drift with `src/payload-generated-schema.ts`.

---

### 3.4 Comprehensive Technical & Payload v3.90.2 Assessment of `R-11` & `R-14`

#### 1. `R-11` — Taxonomy Normalization, `*_texts` Array Tables & Legacy Lookup Consolidation (`Phase 2`)

`R-11` spans two distinct sub-concerns across the repository's collections (`Projects`, `Articles`, `Skills`, `About`, `Services`, `Users`) and globals (`Header`, `SiteSettings`, `Footer`):

- **`R-11a` — Shared Taxonomy Normalization & `Users.legacyRoles` Retirement (`deferred` · `compatible (content-model refactor)`):**
  - **Current Schema State:**
    1. Category classifications use hardcoded PostgreSQL `ENUM` types (`enum_articles_category`: `'articles' | 'others'`; `enum_projects_categories` on `projects_categories` + `_projects_v_version_categories`: `'front-end' | 'back-end' | 'cms-crm'`; `enum_skills_group` on `skills`). Adding or renaming a category currently requires an `ALTER TYPE ... ADD VALUE` DDL migration and code deploy.
    2. Technology strings are duplicated as unvalidated free text across `Projects.techStack` (`projects_texts`, `_projects_v_texts`), `Skills.label` (`skills`), and `SiteSettings.knowsAbout` (`site_settings_texts`).
    3. `Users.legacyRoles` (`users_roles` + `enum_users_roles` in `src/collections/Users.ts`) remains as a transitional field after roles migrated to the normalized `Roles` collection (`users_rels` -> `roles`).
  - **Payload v3.90.2 Compatibility & Trade-Offs:**
    - Modeling shared `Categories` / `Technologies` collections via Payload `relationship` fields + virtual `join` reverse-lookup fields (`docs/fields/join.mdx`) and dropping `Users.legacyRoles` once all `users_roles` rows are migrated is **100% Payload 3 native**.
    - **Architectural Trade-Off (`_rels` Fan-Out & API Shape):** In `@payloadcms/drizzle`, `hasMany: true` `relationship` fields store links in polymorphic `<collection>_rels` (`projects_rels`, `_projects_v_rels`) tables rather than typed 2-column join tables, and change Local API / REST / GraphQL payloads from `string[]` (`["Next.js", "PostgreSQL"]`) to `(number | Skill)[]` (requiring `depth >= 1` population across `/projects`, `/articles`, Schema.org `knowsAbout`, RSS/sitemap, and seed scripts). Given PoCMS's bounded portfolio cardinality and the `R-08a` `(parent_id, path, "order")` covering index fix already active, `R-11a` is an optional data-governance enhancement rather than a database bottleneck fix.

- **`R-11b` — Collapsing Payload `hasMany: true` `text` Tables (`*_texts`) into PostgreSQL `text[]` Columns (`deferred` · `incompatible with payload docs`):**
  - **Current Schema State:** 7 `*_texts` child tables (`projects_texts`, `_projects_v_texts`, `about_texts`, `services_texts`, `header_texts`, `site_settings_texts`, `footer_texts`) store ordered string lists (`techStack`, `areas`, `descriptions`, `professionTexts`, `knowsAbout`, `footerRoles`).
  - **Why Raw `text[]` Is Incompatible with Payload 3:**
    - `@payloadcms/drizzle` (`dist/schema/traverseFields.js` & `dist/transform/write/texts.js`) hardcodes `{ type: 'text', hasMany: true }` to materialize and query dedicated `<tableName>_texts` tables (`id`, `order`, `parent_id`, `path`, `text`). Altering those columns to native PostgreSQL `text[]` out-of-band breaks Payload's read/write transformers and triggers destructive `drizzle-kit` `pushDevSchema()` diffs.
    - **Payload-Compliant Alternative:** Keep `{ type: 'text', hasMany: true }` backed by the `R-08a` `(parent_id, path, "order")` composite indexes (which already achieve single-index-probe lookups), OR — if zero-join single-row storage is specifically desired for display-only bullet lists (`Services.descriptions`, `Header.professionTexts`, `Footer.footerRoles`) — convert the Payload field definition to `type: 'json'` (`jsonb` column) with a `jsonSchema` string-array validator and custom Admin tag/list field component.

---

#### 2. `R-14` — Child Array Surrogate Primary Keys (`varchar('id')` -> `bigint` / `UUIDv7`) & Sequence `CACHE 64` Tuning (`Phase 3`)

Source-level verification against `@payloadcms/drizzle@3.90.2` and `drizzle-kit@0.31.7` demonstrates that `R-14` must be split into two sub-items with **opposite compatibility classifications**:

- **`R-14a` — Converting Live Child Array/Block `varchar('id')` Primary Keys to `bigint GENERATED BY DEFAULT AS IDENTITY` or `UUIDv7` (`deferred — do not apply` · `incompatible with payload docs`):**
  - **Affected Tables in PoCMS (16 live child tables):** `articles_detail_media_items`, `articles_gallery`, `projects_detail_media_items`, `projects_gallery`, `about_images`, `users_sessions`, `forms_emails`, `form_submissions_submission_data`, `payload_jobs_log`, `site_settings_alumni_of`, `navigation_items`, `footer_profiles`, `footer_contact_info`, `custom_code_meta_tags`, `custom_code_link_tags` (plus root `navigation` if customized).
  - **Exact Technical Root Cause in `@payloadcms/drizzle@3.90.2`:**
    1. Payload's core field sanitizer automatically injects `{ name: 'id', type: 'text' }` onto every `array` and `blocks` row and generates 24-character hex `ObjectID` strings (e.g. `"67260a1f8c3b2e0012345678"`) client- and server-side.
    2. In `@payloadcms/drizzle/dist/postgres/schema/setColumnID.js`, whenever `idField.type === 'text'` is present (all live array tables where `disableUnique === false`), Payload forces `columns.id = { name: 'id', type: 'varchar', primaryKey: true }`, and `dist/transform/write/array.js` writes `arrayRow.id` directly into `"id"`. *(Note: Version snapshot array tables like `_articles_v_version_gallery` set `disableUnique: true`, which invokes `idToUUID.js` to move the hex ID into `"_uuid"` and already uses `serial('id')`!)*
    3. Overriding live child array `"id"` columns to `bigint GENERATED BY DEFAULT AS IDENTITY` or `uuid` immediately crashes Admin UI / Local API saves with PostgreSQL `SQLSTATE 22P02` (`invalid input syntax for type bigint / uuid: "67260a1f..."`) and causes `pushDevSchema()` to emit `ALTER COLUMN "id" SET DATA TYPE varchar` reverts.
    4. Additionally, `vercelPostgresAdapter({ idType: 'uuidv7' })` in Payload v3.90.2 (`setColumnID.js`) applies **only** to root collection primary keys, not child array `varchar('id')` columns, and changing `idType` on an existing `serial` database would require rewriting primary and foreign keys across all 60+ `serial` tables.

- **`R-14b` — Tuning `CACHE 64` on High-Write PostgreSQL `serial` Sequences (`deferred` · `compatible (zero-drift SQL tuning)`):**
  - **Target Sequences:** `audit_logs_id_seq`, `payload_jobs_id_seq`, `_articles_v_id_seq`, `_projects_v_id_seq`, `mail_webhook_events_id_seq`, and `mail_messages_id_seq`.
  - **Why `R-14b` Is 100% Compatible with Drizzle `pushDevSchema()` (`drizzle-kit@0.31.7` Verification):**
    1. During PostgreSQL introspection (`fromDatabase` in `drizzle-kit/api.js`), `drizzle-kit` queries `pg_sequences` (`cache_size`), attaches `identity.cache` **only** to SQL `GENERATED ... AS IDENTITY` columns (`isIdentity === true`), leaves `identity: undefined` on Payload's `serial` columns (`isSerial === true`), and explicitly `delete`s every column-owned `pg_get_serial_sequence` sequence from standalone `sequencesToReturn`.
    2. Consequently, executing `ALTER SEQUENCE "public"."<table_id_seq>" CACHE 64;` on Payload's owned `serial` sequences produces **zero schema diff** in `pushDevSchema()` (`pnpm dev`) and `payload migrate:create`, while reducing `pg_sequence` catalog buffer locks and WAL writes by up to `64×` during burst inserts.
    3. **Neon Serverless Pooler Note:** Because PostgreSQL caches pre-allocated sequence numbers per backend process, Neon scale-to-zero suspend cycles or PgBouncer backend rotation may skip unused cached integers (e.g., jumping from `id = 12` to `id = 65`), which is standard PostgreSQL behavior and completely benign since ordering uses `created_at` / `published_at` / `_order`.

---

## 4. Prioritized Corrective & Deferred Optimization Roadmap

To cleanly resolve the architectural goals behind every **`undone`** and **`deferred`** item while staying **100% compliant** with Payload CMS v3.90.2 and Drizzle ORM, execute the following actions in priority order:

### Priority 1 (`P1` — High Impact, Low Risk): Re-introduce Partial Feed/Queue & Search GIN Indexes via `afterSchemaInit` (`extendTable`)
- **Resolves:** `R-08b` (`schema-push conflict`)
- **Corrective Architecture:**
  1. Implement an `afterSchemaInit` hook in `src/lib/postgresSchemaHooks.ts` using Payload's official `extendTable` utility imported from `@payloadcms/db-vercel-postgres` (`docs/database/postgres.mdx`) and `index` / `sql` from `@payloadcms/db-vercel-postgres/drizzle/pg-core` & `drizzle-orm`.
  2. Declare `idx_articles_public_feed`, `idx_projects_public_feed`, `idx_articles_v_latest_updated`, `idx_projects_v_latest_updated`, and `idx_payload_jobs_runnable` inside `extendTable({ table: schema.tables.<name>, extraConfig: (t) => ({ ... }) })` using `.where(sql\`...\`)`.
  3. For `idx_mail_threads_search_trgm`, guard GIN `gin_trgm_ops` registration behind an initialization check (or a dedicated `tsvector` generated column using built-in PostgreSQL `gin` without requiring extension creation) so `pushDevSchema()` and `payload migrate:create` recognize the index natively and **never** drop it on `pnpm dev`.
  4. Document in code comments that per Payload 3 docs, `afterSchemaInit` extensions are enforced at runtime (`pushDevSchema` / `migrate:create`) even though `payload generate:db-schema` only serializes `beforeSchemaInit` `rawTables`.

### Priority 2 (`P2` — Low Risk, Zero Schema Drift): Apply `ALTER SEQUENCE ... CACHE 64` on High-Write `serial` Sequences
- **Resolves:** `R-14b` (`deferred` · `compatible (zero-drift SQL tuning)`) — while permanently excluding `R-14a` (`incompatible with payload docs`)
- **Corrective Architecture:**
  1. Add an idempotent `DO $$` block in `src/lib/phase2And3SqlOptimizations.ts` (`pnpm db:optimize`) that checks `pg_sequences.cache_size < 64` and executes `ALTER SEQUENCE "public"."<seq>" CACHE 64` for `audit_logs_id_seq`, `payload_jobs_id_seq`, `_articles_v_id_seq`, `_projects_v_id_seq`, `mail_webhook_events_id_seq`, and `mail_messages_id_seq`.
  2. Leave all 16 live child array `varchar('id')` primary keys untouched (`R-14a` permanently excluded) so Payload's 24-hex `ObjectID` array writers and Drizzle `pushDevSchema()` remain 100% compatible.

### Priority 3 (`P3` — Medium Impact, Operational Safety): Formalize Stage-Gate Transition from Dev `push` Mode to Production Versioned Migrations
- **Resolves:** `R-07b` (`violation conflict`)
- **Corrective Architecture:**
  1. **While actively prototyping schema locally (`push` mode):** Keep `/src/migrations` in `.gitignore`, never run `payload migrate` against the local `push` database, and use `pnpm db:optimize` for idempotent data backfills, sequence tuning, and `CONCURRENTLY` index builds.
  2. **When cutting over to strict versioned migrations for multi-environment staging/production:**
     - Remove `/src/migrations` from `.gitignore`.
     - Set `push: false` explicitly inside `vercelPostgresAdapter({ push: false, migrationDir: ... })` in `src/payload.config.ts` so `pnpm dev` never mixes `pushDevSchema()` with tracked migrations.
     - Generate clean baseline migrations via `pnpm db:migrate:create` (with consistent `BLOB_READ_WRITE_TOKEN` env configuration so plugin schemas match across generation and runtime) and execute `pnpm db:migrate` as part of the Vercel CI/CD build step (`vercel-build`), avoiding `prodMigrations` on serverless cold starts.

### Priority 4 (`P4` — Low/Medium Impact, Write-Amplification Reduction): Selective `lockDocuments: false` on Read-Only / Append-Only Collections
- **Resolves:** `R-09b` (`schema-push conflict`)
- **Corrective Architecture:**
  1. Rather than overriding Payload's internal `payload_locked_documents_rels` indexes out-of-band, set `lockDocuments: false` directly in the Payload Collection config on collections that are strictly append-only or system-managed and never edited concurrently by multiple admins in the UI (`AuditLogs`, `FormSubmissions`, `MailAttachments`, `MailLabels`).
  2. Payload's schema generator then natively omits both the nullable `<collection>_id` column and its `payload_locked_documents_rels_<collection>_id_idx` B-tree index in `beforeSchemaInit` / Drizzle with zero custom SQL overrides.

### Priority 5 (`P5` — Optional Content-Governance Refactor): Retire `Users.legacyRoles` & Evaluate Payload-Native Taxonomies / `json` Lists
- **Resolves:** `R-11a` (`deferred` · `compatible (content-model refactor)`) — while permanently excluding `R-11b` raw `text[]` overrides (`incompatible with payload docs`)
- **Corrective Architecture:**
  1. Verify `SELECT COUNT(*) FROM users_roles` is `0` (all legacy roles migrated into `users_rels` -> `roles`), then remove `legacyRoles` from `src/collections/Users.ts` to retire `users_roles` and `enum_users_roles`.
  2. Only if dynamic editorial category creation or cross-project technology pages are needed on the frontend, introduce a Payload `Categories` collection (or link `Projects.techStack` to `Skills` via `relationship` + virtual `join` field on `Skills`), updating frontend mappers for populated relationship objects. Keep non-relational string lists (`Services.descriptions`, `Header.professionTexts`, `Footer.footerRoles`) either on the indexed `*_texts` tables (`R-08a`) or on Payload `type: 'json'` fields — never raw out-of-band PostgreSQL `text[]` columns.

### Priority 6 (`P6` — Long-Term Scale Architecture): Keep `audit_logs` as a Bounded Hot Heap Table + Cold Object-Storage Archival
- **Resolves:** `R-13b` (`incompatible with payload docs`)
- **Corrective Architecture:**
  1. **Default Payload-Native Pattern (Already Active via `R-12`):** Keep Payload's `audit_logs` collection as a standard heap table (`relkind = 'r'`) bounded to a predictable 180-day hot window (~50k–200k rows, `< 50 MB`) by `pruneAuditLogs`, which exports aged batches to date-partitioned `.ndjson.gz` objects in private Vercel Blob before batch-deleting. At this bounded cardinality, a standard PostgreSQL heap table with `(created_at)` and `(event, created_at)` B-trees delivers sub-millisecond reads with zero `drizzle-kit` incompatibility.
  2. **If Multi-Million-Row SQL Analytics Are Needed Later:** Keep `audit_logs` as a thin hot table (e.g., 30-day window) or write high-volume telemetry to a **custom non-Payload sidecar table** (`audit_logs_archive`) excluded from `drizzle-kit` push diffing via `tablesFilter: ['!audit_logs_archive*']`, rather than partitioning a Payload-managed collection table directly.

---

## 5. Verification & Operational Runbook

```bash
# 1. Regenerate Payload TypeScript types, Drizzle schema, and Admin importMap
pnpm generate:all

# 2. Apply Drizzle-aligned Phase 1–3 data backfills, heap/sentinel recovery, & CONCURRENTLY indexes
pnpm db:optimize

# 3. Re-sync online CONCURRENTLY B-tree indexes directly over POSTGRES_URL_NON_POOLING
pnpm db:optimize-indexes

# 4. Run full typecheck, lint, and integration test suite
pnpm exec tsc --noEmit
pnpm lint
pnpm test:int
```
