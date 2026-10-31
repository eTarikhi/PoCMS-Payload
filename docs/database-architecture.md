# Database Architecture & Neon Serverless Optimization Roadmap

This guide documents the architectural audit, query optimization patterns, Neon serverless PostgreSQL operational rules, and phased modernization roadmap for PoCMS (`@payloadcms/db-vercel-postgres` + Drizzle ORM + Neon PostgreSQL).

---

## 1. Schema & Adapter Overview

### 1.1 Quantitative Footprint (`src/payload-generated-schema.ts`)

| Category | Count | Representative Relations | Notes |
| :--- | ---: | :--- | :--- |
| Root Collection & Global Tables | `20` | `articles`, `projects`, `media`, `users`, `roles`, `site_settings`, `header` | Mix of compact entities (`skills`: 7 cols) and wide 1NF tables (`site_settings`: 72 cols, `media`: 48 cols) |
| Child Array, Block, & Scalar-List Tables | `31` | `forms_blocks_*` (8 tables), `*_texts` (7 tables), `articles_gallery`, `users_sessions` | Shredded 1:N child tables joined via Drizzle `LATERAL` subqueries and rewritten via `DELETE` + `INSERT` on parent updates |
| Version / Draft Snapshot Tables (`_v*`) | `11` | `_articles_v` (45 cols), `_projects_v` (48 cols), `_articles_v_version_gallery`, etc. | Structural snapshots written on draft save, autosave, and publish |
| Polymorphic Join Tables (`*_rels`) | `9` | `payload_locked_documents_rels` (25 cols), `articles_rels`, `users_rels` | Sparse nullable foreign-key columns ("exclusive-arc" pattern) |
| Mail Inbox Plugin Tables (`mail_*`) | `5` | `mail_threads`, `mail_messages`, `mail_attachments`, `mail_labels`, `mail_webhook_events` | Denormalized thread rollups paired with sanitized HTML/plain-text MIME bodies |
| Payload Internal Tables (`payload_*`) | `9` | `payload_jobs`, `payload_jobs_log`, `payload_preferences`, `payload_migrations` | Checkpointed jobs queue, concurrency locks, saved presets, folders, and migration ledger |
| **Total Tables / Enum Types** | **`85` / `78`** | `310` regular B-tree + `13` unique + `85` PK indexes = **`408` B-tree indexes** (`111` FKs) | Generated offline via `pnpm generate:all` (`scripts/generate.mjs`) |

### 1.2 Transport & Adapter Topology

- **Adapter:** `vercelPostgresAdapter` (`@payloadcms/db-vercel-postgres@3.90.2`) configured via `buildPostgresAdapterConfig()` in `src/lib/postgresAdapterConfig.ts`.
- **Local Development (`localhost` / `127.0.0.1` / `postgres`):** Connects directly via `node-postgres` (`pg.Pool`).
- **Cloud / Neon Production (`*-pooler.*.neon.tech`):** Connects via `VercelPool` (`@neondatabase/serverless` WebSocket `Pool` over port `443`) into Neon's PgBouncer **transaction-mode** pooler, backed by autoscaling Neon compute nodes, Local File Cache (LFC), Safekeepers (Paxos WAL quorum), and disaggregated Pageserver storage.
- **Direct Maintenance Channel (`POSTGRES_URL_NON_POOLING`):** Bypasses PgBouncer when running session-level maintenance (`VACUUM`, `REINDEX`, `CREATE INDEX CONCURRENTLY`, transactional restores) from `/admin/database`.

---

## 2. Structural Analysis

### 2.1 Normalization Trade-Offs on Disaggregated Storage

1. **Over-shredded immutable sub-documents (`blocksAsJSON: false` default):**
   - `forms` splits field blocks across **8 separate tables** (`forms_blocks_checkbox`, `forms_blocks_email`, `forms_blocks_message`, `forms_blocks_number`, `forms_blocks_select`, `forms_blocks_state`, `forms_blocks_text`, `forms_blocks_textarea`), and scalar string arrays (`hasMany`) spawn **7 `*_texts` tables** (`projects_texts`, `_projects_v_texts`, `about_texts`, `services_texts`, `header_texts`, `site_settings_texts`, `footer_texts`).
   - Hydrating one form executes an 8-branch `LEFT JOIN LATERAL` across 9 relations, fetching 9+ distinct 8 KB heap/index pages from Neon's Pageserver when LFC is cold. Updating a parent document deletes and re-inserts child rows, amplifying WAL volume shipped to Neon Safekeepers.
2. **Wide 1NF root & version snapshot tables:**
   - `site_settings` (`72` cols), `media` (`48` cols across 5 inline WebP size groups), `_projects_v` (`48` cols + `14` non-PK indexes), and `_articles_v` (`45` cols + `15` non-PK indexes) duplicate full Lexical `content` JSONB ASTs across version snapshots.
   - Always supply explicit `select` and `populate` projections on frontend RSC queries (`src/app/(frontend)/lib/payload-source.ts`) and background rollups (`src/plugins/mailInbox/services/threading.ts`) so PostgreSQL never fetches cold `pg_toast` chunks unnecessarily.
3. **Sparse polymorphic `*_rels` tables:**
   - `payload_locked_documents_rels` contains `21` nullable entity FK columns (`24` non-PK indexes). Because standard PostgreSQL B-trees index `NULL` entries, unfiltered single-column indexes insert 20 `NULL` entries per lock row unless converted to partial indexes (`WHERE <col>_id IS NOT NULL`).

### 2.2 Referential Integrity & Indexing Defects Identified

1. **`NOT NULL` + `ON DELETE SET NULL` foreign-key contradictions (targeted in Phase 1 `R-06`):**
   - `mail_messages.thread_id` (`NOT NULL` with `ON DELETE SET NULL` to `mail_threads.id`) and `form_submissions.form_id` (`NOT NULL` with `ON DELETE SET NULL` to `forms.id`) will fail with a `NOT NULL` constraint violation if a parent row is deleted directly. `mail_messages.thread_id` should use `ON DELETE CASCADE`; `form_submissions.form_id` should be nullable or `ON DELETE RESTRICT`.
2. **Inverted composite indexes on all 7 `*_texts` tables (targeted in Phase 1 `R-08`):**
   - Generated `*_texts_order_parent` indexes put low-cardinality `"order"` (`1..N`) ahead of `parent_id` (`("order", parent_id)`), leaving `parent_id` without a leading B-tree index during `LATERAL` fetches and `ON DELETE CASCADE` version pruning (`_projects_v_texts`). Leading column order must be `(parent_id, path, "order")`.
3. **Single-column boolean / low-cardinality B-trees vs. composite & partial indexes:**
   - Default field-level `index: true` flags create standalone B-trees on booleans (`is_read`, `is_starred`, `has_attachments`, `processing`, `has_error`, `autosave`) instead of composite partial indexes aligned with `WHERE + ORDER BY` clauses.

### 2.3 Data-Type Guidelines for Distributed Workloads

| Pattern in Generated Schema | Count | Neon / PostgreSQL Impact | Target Native Type (Phase 2–3) |
| :--- | ---: | :--- | :--- |
| `numeric` (`mode: 'number'`) on integer counters & byte sizes | `50` cols | Variable-length `varlena` BCD encoding (`5–12+` bytes) and software math CPU overhead | `integer` (`INT4`) for counts/dimensions, `bigint` (`INT8`) for `filesize` & epoch timestamps, `real` (`FLOAT4`) for `focal_x`/`focal_y` |
| Mixed `serial` (`61` tables) + random `varchar` child PKs (`24` tables) | `85` PKs | 24-char random string IDs widen indexes and cause B-tree leaf page splits on child array re-inserts | `bigint GENERATED BY DEFAULT AS IDENTITY (CACHE 64)` or binary `uuid` (`UUIDv7`) |
| Catalog `pgEnum` proliferation | `78` enums | Rigid `pg_type` catalog coupling across main and `_v` tables | Reserve `pgEnum` for stable state machines (`_status`, `mail_folder`); prefer `text` + `CHECK` for UI style presets |
| Large inline `varchar` / `jsonb` (`> 2 KB` TOAST) | `406` / `42` cols | Out-of-line `pg_toast` 8 KB page reads across Pageserver network if unprojected | Strict `select` projections; sidecar/Blob tiering for cold MIME & webhook payloads |

---

## 3. Performance Optimization

### 3.1 Implemented Query & Initialization Optimizations (Phase 0)

1. **Zero-Scan Cold-Start Bootstrap (`src/access/draftMigration.ts`, `src/access/orderable.ts`, `src/payload.config.ts`):**
   - `ensureDraftVersions` uses a single indexed SQL `NOT EXISTS` anti-join (`SELECT a.id FROM articles a WHERE NOT EXISTS (SELECT 1 FROM _articles_v v WHERE v.parent_id = a.id)`) instead of loading all `_articles_v` and `_projects_v` rows into Node memory with `pagination: false`.
   - `ensureOrderable` probes all 5 orderable collections in **one** short-circuit `SELECT EXISTS (...)` round-trip rather than 5 sequential `COUNT(*)` scans.
   - Independent startup checks run concurrently (`Promise.all`) with per-instance idempotency guards and can be bypassed completely on pre-seeded serverless deployments via `PAYLOAD_SKIP_ON_INIT_CHECKS=true`.
2. **Single-Pass Filtered Aggregation for Inbox Counts (`src/plugins/mailInbox/services/inboxQueries.ts`):**
   - `collectInboxFolderCounts` computes all 8 folder/unread/starred counters in **one** `SELECT COUNT(*) FILTER (WHERE ...)` query (1 pool checkout) instead of 8 concurrent `payload.count()` queries.
3. **Zero-TOAST Atomic Thread Rollups (`src/plugins/mailInbox/services/threading.ts`):**
   - `recomputeThreadRollups` executes a single atomic `WITH msg_rows AS (...) UPDATE mail_threads ...` SQL statement that projects only lightweight header metadata—never reading `pg_toast` HTML/plain-text bodies and eliminating concurrent webhook lost-update races.

### 3.2 Recommended Production Index DDL (Phase 1 — Run via `POSTGRES_URL_NON_POOLING`)

Execute `CREATE INDEX CONCURRENTLY` over a direct (non-`-pooler`) connection so writes are never blocked:

```sql
-- 1. Public portfolio feed partial indexes (heap-filter-free index scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_public_feed
  ON public.articles (published_at DESC)
  WHERE deleted_at IS NULL AND (_status = 'published' OR _status IS NULL);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_public_feed
  ON public.projects (_order ASC)
  WHERE deleted_at IS NULL AND (_status = 'published' OR _status IS NULL);

-- 2. Admin draft list & version retention pruning indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_v_latest_updated
  ON public._articles_v (updated_at DESC) WHERE latest = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_v_parent_updated
  ON public._articles_v (parent_id, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_v_latest_updated
  ON public._projects_v (updated_at DESC) WHERE latest = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_v_parent_updated
  ON public._projects_v (parent_id, updated_at DESC);

-- 3. Mail Inbox covering counts, folder timeline, message rollup, & trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mail_threads_counts_cover
  ON public.mail_threads (folder, is_read, is_starred);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mail_threads_folder_last_msg
  ON public.mail_threads (folder, last_message_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mail_threads_search_trgm
  ON public.mail_threads USING gin (
    (coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' ||
     coalesce(counterparty_name, '') || ' ' || coalesce(counterparty_email, ''))
    gin_trgm_ops
  );
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mail_messages_thread_sent
  ON public.mail_messages (thread_id, sent_at ASC);

-- 4. Payload Jobs runnable queue partial index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payload_jobs_runnable
  ON public.payload_jobs (queue, wait_until ASC, created_at ASC)
  WHERE completed_at IS NULL AND processing = false AND has_error = false;

-- 5. Leading parent_id composite indexes for all 7 *_texts tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_texts_parent_order      ON public.projects_texts (parent_id, path, "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_v_texts_parent_order    ON public._projects_v_texts (parent_id, path, "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_about_texts_parent_order         ON public.about_texts (parent_id, path, "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_texts_parent_order      ON public.services_texts (parent_id, path, "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_header_texts_parent_order        ON public.header_texts (parent_id, path, "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_site_settings_texts_parent_order ON public.site_settings_texts (parent_id, path, "order");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_footer_texts_parent_order        ON public.footer_texts (parent_id, path, "order");
```

---

## 4. Scalability & Resilience on Neon Serverless

### 4.1 Connection Pooling & PgBouncer Transaction Mode

- **Bounded Per-Isolate Pool (`src/lib/postgresAdapterConfig.ts`):**
  - Remote/serverless hosts default to `max: 4`, `idleTimeoutMillis: 5_000`, `connectionTimeoutMillis: 10_000`, and `maxUses: 7_500` (overridable via `POSTGRES_POOL_*` env vars). Local Postgres (`localhost` / `127.0.0.1` / `postgres`) defaults to `max: 10`, `idleTimeoutMillis: 30_000`.
  - Why: Under traffic spikes (`50` concurrent serverless isolates), `max: 4` caps worst-case pool fan-out while releasing idle WebSocket connections within `5s`.
- **Resolving Payload's Active Pool (`src/lib/payloadSql.ts`):**
  - `@payloadcms/db-vercel-postgres` stores its `VercelPool` on `payload.db.drizzle.$client` (or `payload.db.primaryDrizzle.$client` when `readReplicas` is enabled) rather than `payload.db.pool`. Always use `resolvePayloadPoolClient(payload)` / `executePayloadSql(payload, text, values, req)` so parameterized queries reuse the active pool (or participate in `req.transactionID`'s checked-out client) instead of spawning ad-hoc TCP connections.
- **PgBouncer-Safe `statement_timeout` (`src/plugins/databaseManager/core/connection.ts`):**
  - Never pass `statement_timeout` in `new pg.Client(...)` startup parameters when falling back to a `-pooler.` connection string; PgBouncer transaction mode rejects `options=-c statement_timeout=...` startup packets unless allowlisted. Apply `statement_timeout` on startup packets only for direct unpooled connections.
- **Keep External Network I/O Out of DB Transactions:**
  - PgBouncer transaction mode pins a Neon backend connection from `BEGIN` until `COMMIT`. Never await external HTTP APIs (`api.resend.com`, Vercel Blob) inside transactional hooks; dispatch external calls via Payload's `jobs` queue (`outboundWorkflow`, `ingestWorkflow`).

### 4.2 Preserving Neon Autoscaling & Scale-to-Zero (`suspend_timeout_seconds`)

1. **No Unintended 24/7 Compute Wake-Locks (`/api/mail/stream` & Admin Polling):**
   - On serverless Neon hosts (`*.neon.tech`, `vercel-storage.com`), persistent unpooled `LISTEN` sessions are disabled by default unless `MAIL_STREAM_PG_LISTEN=true` is explicitly set.
   - Server-side SSE watermark polling uses exponential idle backoff (`4s → 8s → 15s → 30s → 60s`), and `InboxClient` / `InboxUnreadBadge` suspend background connections when the browser tab is hidden so Neon's `suspend_timeout_seconds` (default `300s`) can suspend idle compute cleanly.
2. **Zero-Copy Read Replicas (`POSTGRES_READ_REPLICA_URLS`):**
   - Configure comma-separated Neon read-replica pooled URLs in `POSTGRES_READ_REPLICA_URLS` to route read queries onto horizontally autoscaled replica compute endpoints sharing the same Pageserver storage with zero storage duplication.
3. **Ephemeral Compute Telemetry Awareness (`src/plugins/databaseManager/core/advisor.ts`):**
   - Neon resets `pg_stat_user_indexes` counters whenever a compute endpoint suspends to zero and resumes. `collectDatabaseAdvisorReport` checks `stats_reset` / `pg_postmaster_start_time()` age and warns against dropping `0`-scan indexes when compute statistics uptime is `< 24h`.

---

## 5. Prioritized Actionable Roadmap

### Phase 0 — Serverless Pool, Query Fan-Out, Cold-Start, & Scale-to-Zero (**Implemented**)

- [x] **R-01 (`src/lib/postgresAdapterConfig.ts`, `src/payload.config.ts`):** Bounded serverless `VercelPool` (`max: 4`, `idleTimeoutMillis: 5_000`, `connectionTimeoutMillis: 10_000`, `maxUses: 7_500`) + optional `POSTGRES_READ_REPLICA_URLS` wiring.
- [x] **R-02 (`src/plugins/mailInbox/services/threading.ts`):** Single-statement atomic SQL `recomputeThreadRollups` (zero `pg_toast` body hydration + explicit `select` projection fallback).
- [x] **R-03 (`src/plugins/mailInbox/services/inboxQueries.ts`):** Single-pass `COUNT(*) FILTER (WHERE ...)` SQL aggregation in `collectInboxFolderCounts` (8× fewer pool checkouts).
- [x] **R-04 (`src/access/draftMigration.ts`, `src/access/orderable.ts`, `src/payload.config.ts`):** Replace cold-start `pagination: false` `_articles_v`/`_projects_v` table scans with `NOT EXISTS` anti-joins, batch `ensureOrderable` existence checks into 1 SQL query, parallelize `onInit`, and support `PAYLOAD_SKIP_ON_INIT_CHECKS`.
- [x] **R-05 (`src/lib/payloadSql.ts`, `connection.ts`, `realtimeBus.ts`, `mailStream.ts`, `advisor.ts`, `InboxClient.tsx`):** Resolve `drizzle.$client` for `vercelPostgresAdapter`, guard PgBouncer startup `statement_timeout`, protect Neon scale-to-zero via tab-visibility SSE suspension + adaptive backoff, and gate `idx_scan = 0` advisor warnings on compute stats uptime `>= 24h`.

### Phase 1 — Indexing, Referential Integrity, & Versioned Migrations

- [ ] **R-06 (FK Integrity):** Change `mail_messages.thread_id` FK from `ON DELETE SET NULL` to `ON DELETE CASCADE`, and make `form_submissions.form_id` nullable (or `ON DELETE RESTRICT`) so deleting a thread or form never triggers a `NOT NULL` runtime failure.
- [ ] **R-07 (Migration Discipline):** Initialize `src/migrations/` via `pnpm payload migrate:create` and run `payload migrate` against `POSTGRES_URL_NON_POOLING` in CI/CD prior to production deploys.
- [ ] **R-08 (Targeted Composite, Partial, & Trigram Indexes):** Roll out the `CREATE INDEX CONCURRENTLY` statements in **Section 3.2** across `articles`, `projects`, `_articles_v`, `_projects_v`, `mail_threads`, `mail_messages`, `payload_jobs`, and all 7 `*_texts` tables.
- [ ] **R-09 (Write-Amplification & Partial FK Index Cleanup):** Convert the 21 nullable FK indexes on `payload_locked_documents_rels` to partial indexes (`WHERE <col>_id IS NOT NULL`) and drop redundant standalone boolean / unused child `created_at` B-tree indexes.

### Phase 2 — Structural & Data-Type Modernization

- [ ] **R-10 (`blocksAsJSON: true`):** Collapse the 8 `forms_blocks_*` relational tables into an inline `jsonb` column on `forms` (with a one-time data migration), eliminating 8-way `LATERAL` joins and child-table delete/re-insert churn.
- [ ] **R-11 (Native Numeric Types):** Migrate `numeric` (`varlena`) integer/byte-count fields (`read_time`, `filesize`, `width`, `height`, `login_attempts`, `message_count`, `unread_count`, `open_count`, `click_count`, `svix_timestamp`, `total_tried`) to `integer` / `bigint` and `focal_x`/`focal_y` to `real` via `beforeSchemaInit` + migration.
- [ ] **R-12 (Automated Storage Retention & Async Audit Trail):** Schedule Payload `jobs` tasks to purge expired `users_sessions`, prune completed `payload_jobs` / `payload_jobs_log` older than 14 days, clear processed `mail_webhook_events.payload_snapshot` blobs, and decouple `audit-logs` inserts + Lexical AST diffing from hot interactive transactions.

### Phase 3 — High-Concurrency Distributed Scale

- [ ] **R-13 (Cold Payload Tiering & Table Partitioning):** Split large `mail_messages` MIME bodies (`sanitized_html`, `quoted_history_text`, `headers_snapshot`) into a lazy-loaded `mail_message_bodies` 1:1 table (or Vercel Blob for archived threads) and range-partition `audit_logs` monthly by `created_at` so historical partitions drop instantaneously without `VACUUM` overhead.
- [ ] **R-14 (Identity PKs & Sequence Cache Tuning):** Migrate child array/block random `varchar('id')` primary keys to `bigint GENERATED BY DEFAULT AS IDENTITY (CACHE 64)` (or binary `UUIDv7`) and tune `CACHE 64` on high-rate sequences (`audit_logs_id_seq`, `payload_jobs_id_seq`, `_articles_v_id_seq`).
