import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

import {
  buildPhase1MigrationUpStatements,
  buildPhase1RollbackStatements,
} from '@/lib/phase1SqlOptimizations'

/**
 * Phase 1 Database Migration (`R-06`, `R-07`, `R-08`, `R-09`):
 * - Resolves `NOT NULL` + `ON DELETE SET NULL` foreign-key contradictions on `mail_messages.thread_id`
 *   (`ON DELETE CASCADE`) and `form_submissions.form_id` (`DROP NOT NULL`).
 * - Enables `pg_trgm` and deploys query-aligned composite, covering, partial, and trigram GIN indexes
 *   across `articles`, `projects`, `_articles_v`, `_projects_v`, `mail_threads`, `mail_messages`,
 *   `payload_jobs`, and all 7 `*_texts` tables.
 * - Replaces the 21 unfiltered nullable FK indexes on `payload_locked_documents_rels` with partial
 *   `WHERE "<col>_id" IS NOT NULL` indexes and drops redundant boolean B-tree indexes.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const statements = buildPhase1MigrationUpStatements('public')
  for (const statement of statements) {
    await db.execute(sql.raw(statement))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const statements = buildPhase1RollbackStatements('public')
  for (const statement of statements) {
    await db.execute(sql.raw(statement))
  }
}
