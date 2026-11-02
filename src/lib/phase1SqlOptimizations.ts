import { quoteSqlIdent } from './payloadSql'

export const TEXTS_TABLES = [
  'projects_texts',
  '_projects_v_texts',
  'about_texts',
  'services_texts',
  'header_texts',
  'site_settings_texts',
  'footer_texts',
] as const

/**
 * Standard Payload 3 Drizzle-managed FK columns on `payload_locked_documents_rels` (`lockDocuments !== false`).
 * Kept 100% aligned with `src/payload-generated-schema.ts` so `pnpm db:optimize` and Drizzle `pushDevSchema`
 * (`pnpm dev`) produce identical catalog definitions with zero index churn.
 */
export const LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS: readonly {
  column: string
  drizzleIndex: string
  undonePartialIndex: string
}[] = [
  {
    column: 'articles_id',
    drizzleIndex: 'payload_locked_documents_rels_articles_id_idx',
    undonePartialIndex: 'idx_pld_rels_articles_nn',
  },
  {
    column: 'projects_id',
    drizzleIndex: 'payload_locked_documents_rels_projects_id_idx',
    undonePartialIndex: 'idx_pld_rels_projects_nn',
  },
  {
    column: 'media_id',
    drizzleIndex: 'payload_locked_documents_rels_media_id_idx',
    undonePartialIndex: 'idx_pld_rels_media_nn',
  },
  {
    column: 'about_id',
    drizzleIndex: 'payload_locked_documents_rels_about_id_idx',
    undonePartialIndex: 'idx_pld_rels_about_nn',
  },
  {
    column: 'experiences_id',
    drizzleIndex: 'payload_locked_documents_rels_experiences_id_idx',
    undonePartialIndex: 'idx_pld_rels_experiences_nn',
  },
  {
    column: 'educations_id',
    drizzleIndex: 'payload_locked_documents_rels_educations_id_idx',
    undonePartialIndex: 'idx_pld_rels_educations_nn',
  },
  {
    column: 'certificates_id',
    drizzleIndex: 'payload_locked_documents_rels_certificates_id_idx',
    undonePartialIndex: 'idx_pld_rels_certificates_nn',
  },
  {
    column: 'services_id',
    drizzleIndex: 'payload_locked_documents_rels_services_id_idx',
    undonePartialIndex: 'idx_pld_rels_services_nn',
  },
  {
    column: 'skills_id',
    drizzleIndex: 'payload_locked_documents_rels_skills_id_idx',
    undonePartialIndex: 'idx_pld_rels_skills_nn',
  },
  {
    column: 'users_id',
    drizzleIndex: 'payload_locked_documents_rels_users_id_idx',
    undonePartialIndex: 'idx_pld_rels_users_nn',
  },
  {
    column: 'roles_id',
    drizzleIndex: 'payload_locked_documents_rels_roles_id_idx',
    undonePartialIndex: 'idx_pld_rels_roles_nn',
  },
  {
    column: 'audit_logs_id',
    drizzleIndex: 'payload_locked_documents_rels_audit_logs_id_idx',
    undonePartialIndex: 'idx_pld_rels_audit_logs_nn',
  },
  {
    column: 'redirects_id',
    drizzleIndex: 'payload_locked_documents_rels_redirects_id_idx',
    undonePartialIndex: 'idx_pld_rels_redirects_nn',
  },
  {
    column: 'forms_id',
    drizzleIndex: 'payload_locked_documents_rels_forms_id_idx',
    undonePartialIndex: 'idx_pld_rels_forms_nn',
  },
  {
    column: 'form_submissions_id',
    drizzleIndex: 'payload_locked_documents_rels_form_submissions_id_idx',
    undonePartialIndex: 'idx_pld_rels_form_submissions_nn',
  },
  {
    column: 'mail_threads_id',
    drizzleIndex: 'payload_locked_documents_rels_mail_threads_id_idx',
    undonePartialIndex: 'idx_pld_rels_mail_threads_nn',
  },
  {
    column: 'mail_attachments_id',
    drizzleIndex: 'payload_locked_documents_rels_mail_attachments_id_idx',
    undonePartialIndex: 'idx_pld_rels_mail_attachments_nn',
  },
  {
    column: 'mail_labels_id',
    drizzleIndex: 'payload_locked_documents_rels_mail_labels_id_idx',
    undonePartialIndex: 'idx_pld_rels_mail_labels_nn',
  },
  {
    column: 'payload_folders_id',
    drizzleIndex: 'payload_locked_documents_rels_payload_folders_id_idx',
    undonePartialIndex: 'idx_pld_rels_payload_folders_nn',
  },
]

/**
 * Out-of-band raw SQL partial `WHERE` and `pg_trgm` GIN indexes (`R-08b` & `R-09b`) that were
 * undone because they were not declared via Payload 3's `afterSchemaInit` (`extendTable`) hook and
 * therefore conflicted with Drizzle `pushDevSchema()` in `pnpm dev`.
 */
export const UNDONE_CONFLICTING_OUT_OF_BAND_INDEXES = [
  'idx_articles_public_feed',
  'idx_projects_public_feed',
  'idx_articles_v_latest_updated',
  'idx_projects_v_latest_updated',
  'idx_mail_threads_search_trgm',
  'idx_payload_jobs_runnable',
  ...LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS.map((item) => item.undonePartialIndex),
  'idx_pld_rels_mail_messages_nn',
  'idx_pld_rels_mail_webhook_events_nn',
] as const

export const REDUNDANT_LEGACY_INDEXES = [
  ...TEXTS_TABLES.map((t) => `${t}_order_parent`),
  'mail_threads_folder_idx',
  'mail_threads_is_read_idx',
  'mail_threads_is_starred_idx',
  'mail_threads_has_attachments_idx',
  'mail_messages_thread_idx',
  'mail_messages_direction_idx',
  'mail_messages_status_idx',
  'mail_messages_is_read_idx',
  '_articles_v_parent_idx',
  '_articles_v_autosave_idx',
  '_projects_v_parent_idx',
  '_projects_v_autosave_idx',
  'payload_jobs_queue_idx',
  'payload_jobs_processing_idx',
  'payload_jobs_has_error_idx',
  ...UNDONE_CONFLICTING_OUT_OF_BAND_INDEXES,
] as const

export type Phase1IndexSpec = {
  name: string
  table: string
  requiredColumns: readonly string[]
  createSql: string
}

export type Phase1OptimizationPlan = {
  fkIntegritySql: string
  createIndexes: Phase1IndexSpec[]
  dropIndexes: { name: string; dropSql: string }[]
}

/**
 * Generates the Payload 3 Drizzle-aligned Phase 1 SQL plan (`R-06`, `R-08a`, `R-09a`) plus
 * cleanup/restoration of undone out-of-band `R-08b` / `R-09b` partial/GIN indexes so PostgreSQL
 * matches `src/payload-generated-schema.ts` and `pushDevSchema()` with zero drift.
 *
 * - `concurrent: false` -> transactional-safe `CREATE INDEX IF NOT EXISTS` / `DROP INDEX IF EXISTS`.
 * - `concurrent: true`  -> zero-lock online `CONCURRENTLY` execution over `POSTGRES_URL_NON_POOLING`.
 */
export function buildPhase1OptimizationPlan({
  schemaName = 'public',
  concurrent = false,
}: {
  schemaName?: string
  concurrent?: boolean
} = {}): Phase1OptimizationPlan {
  const s = quoteSqlIdent(schemaName)
  const createKw = concurrent
    ? 'CREATE INDEX CONCURRENTLY IF NOT EXISTS'
    : 'CREATE INDEX IF NOT EXISTS'
  const dropKw = concurrent ? 'DROP INDEX CONCURRENTLY IF EXISTS' : 'DROP INDEX IF EXISTS'

  const escapedSchemaLiteral = schemaName.replace(/'/g, "''")

  const fkIntegritySql = `
DO $$
BEGIN
  -- R-06.1: Allow form_submissions.form_id to become NULL when a Form template is deleted (ON DELETE SET NULL)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '${escapedSchemaLiteral}'
      AND table_name = 'form_submissions'
      AND column_name = 'form_id'
      AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE ${s}."form_submissions" ALTER COLUMN "form_id" DROP NOT NULL';
  END IF;

  -- R-06.2: Cascade deletion from mail_threads -> mail_messages (resolving NOT NULL + ON DELETE SET NULL contradiction)
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = '${escapedSchemaLiteral}'
      AND table_name = 'mail_messages'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = '${escapedSchemaLiteral}'
      AND table_name = 'mail_threads'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = '${escapedSchemaLiteral}'
        AND rel.relname = 'mail_messages'
        AND c.conname = 'mail_messages_thread_id_mail_threads_id_fk'
        AND c.confdeltype <> 'c'
    ) THEN
      EXECUTE 'ALTER TABLE ${s}."mail_messages" DROP CONSTRAINT "mail_messages_thread_id_mail_threads_id_fk"';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = '${escapedSchemaLiteral}'
        AND rel.relname = 'mail_messages'
        AND c.conname = 'mail_messages_thread_id_mail_threads_id_fk'
    ) THEN
      EXECUTE 'ALTER TABLE ${s}."mail_messages" ADD CONSTRAINT "mail_messages_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES ${s}."mail_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION';
    END IF;
  END IF;
END $$;
`.trim()

  const createIndexes: Phase1IndexSpec[] = [
    // 1. R-08a: Leading parent_id composite indexes for all 7 *_texts tables (matches beforeSchemaInit)
    ...TEXTS_TABLES.map((tbl) => ({
      name: `${tbl}_parent_path_order_idx`,
      table: tbl,
      requiredColumns: ['parent_id', 'path', 'order'] as const,
      createSql: `${createKw} ${quoteSqlIdent(`${tbl}_parent_path_order_idx`)} ON ${s}.${quoteSqlIdent(tbl)} ("parent_id", "path", "order");`,
    })),

    // 2. R-08a: Version snapshot composite `(parent_id, updated_at)` indexes (matches beforeSchemaInit)
    {
      name: '_articles_v_parent_updated_idx',
      table: '_articles_v',
      requiredColumns: ['parent_id', 'updated_at'],
      createSql: `${createKw} "_articles_v_parent_updated_idx" ON ${s}."_articles_v" ("parent_id", "updated_at");`,
    },
    {
      name: '_projects_v_parent_updated_idx',
      table: '_projects_v',
      requiredColumns: ['parent_id', 'updated_at'],
      createSql: `${createKw} "_projects_v_parent_updated_idx" ON ${s}."_projects_v" ("parent_id", "updated_at");`,
    },

    // 3. R-08a: Mail Inbox covering counts, timeline, and message ordering composite indexes (matches beforeSchemaInit)
    {
      name: 'mail_threads_counts_cover_idx',
      table: 'mail_threads',
      requiredColumns: ['folder', 'is_read', 'is_starred'],
      createSql: `${createKw} "mail_threads_counts_cover_idx" ON ${s}."mail_threads" ("folder", "is_read", "is_starred");`,
    },
    {
      name: 'mail_threads_folder_last_msg_idx',
      table: 'mail_threads',
      requiredColumns: ['folder', 'last_message_at'],
      createSql: `${createKw} "mail_threads_folder_last_msg_idx" ON ${s}."mail_threads" ("folder", "last_message_at");`,
    },
    {
      name: 'mail_messages_thread_sent_idx',
      table: 'mail_messages',
      requiredColumns: ['thread_id', 'sent_at'],
      createSql: `${createKw} "mail_messages_thread_sent_idx" ON ${s}."mail_messages" ("thread_id", "sent_at");`,
    },

    // 4. R-08a: Payload Jobs queue composite index (matches beforeSchemaInit)
    {
      name: 'payload_jobs_queue_wait_created_idx',
      table: 'payload_jobs',
      requiredColumns: ['queue', 'wait_until', 'created_at'],
      createSql: `${createKw} "payload_jobs_queue_wait_created_idx" ON ${s}."payload_jobs" ("queue", "wait_until", "created_at");`,
    },

    // 5. Restore standard Drizzle `payload_locked_documents_rels_*_id_idx` indexes (R-09b undo)
    ...LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS.map(({ column, drizzleIndex }) => ({
      name: drizzleIndex,
      table: 'payload_locked_documents_rels',
      requiredColumns: [column],
      createSql: `${createKw} ${quoteSqlIdent(drizzleIndex)} ON ${s}."payload_locked_documents_rels" (${quoteSqlIdent(column)});`,
    })),
  ]

  const dropIndexes = REDUNDANT_LEGACY_INDEXES.map((idxName) => ({
    name: idxName,
    dropSql: `${dropKw} ${s}.${quoteSqlIdent(idxName)};`,
  }))

  return {
    fkIntegritySql,
    createIndexes,
    dropIndexes,
  }
}

export type Phase1ExecutionSummary = {
  fkIntegrityApplied: boolean
  createdIndexes: string[]
  skippedMissingTables: string[]
  droppedIndexes: string[]
  concurrent: boolean
}

/**
 * Executes the Drizzle-aligned Phase 1 FK & Index optimization pass (`R-06`, `R-08a`, `R-09a`) and
 * removes any undone out-of-band `R-08b` / `R-09b` partial/GIN indexes so `pnpm dev` (`pushDevSchema`)
 * computes zero schema drift.
 */
export async function applyPhase1DatabaseOptimizations(
  executor: {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: T[]; rowCount?: number | null }>
  },
  {
    schemaName = 'public',
    concurrent = false,
  }: {
    schemaName?: string
    concurrent?: boolean
  } = {},
): Promise<Phase1ExecutionSummary> {
  const plan = buildPhase1OptimizationPlan({ schemaName, concurrent })
  const s = quoteSqlIdent(schemaName)
  const dropKw = concurrent ? 'DROP INDEX CONCURRENTLY IF EXISTS' : 'DROP INDEX IF EXISTS'

  await executor.query(plan.fkIntegritySql)

  const existingColsRes = await executor.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = $1
    `,
    [schemaName],
  )
  const columnsByTable = new Map<string, Set<string>>()
  for (const row of existingColsRes.rows) {
    let colSet = columnsByTable.get(row.table_name)
    if (!colSet) {
      colSet = new Set<string>()
      columnsByTable.set(row.table_name, colSet)
    }
    colSet.add(row.column_name)
  }

  // If any of the 3 composite indexes were previously created with explicit `DESC` ordering,
  // recreate them in standard Drizzle column order so `drizzle-kit` `pushSchema` sees zero diff.
  const descIndexesRes = await executor
    .query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = $1
          AND indexname IN (
            '_articles_v_parent_updated_idx',
            '_projects_v_parent_updated_idx',
            'mail_threads_folder_last_msg_idx'
          )
          AND indexdef ILIKE '% DESC%'
      `,
      [schemaName],
    )
    .catch(() => ({ rows: [] as Array<{ indexname: string }> }))
  for (const { indexname } of descIndexesRes.rows) {
    await executor.query(`${dropKw} ${s}.${quoteSqlIdent(indexname)};`)
  }

  const createdIndexes: string[] = []
  const skippedMissingTables: string[] = []

  for (const item of plan.createIndexes) {
    const tableCols = columnsByTable.get(item.table)
    if (!tableCols || !item.requiredColumns.every((col) => tableCols.has(col))) {
      skippedMissingTables.push(`${item.table}:${item.name}`)
      continue
    }
    await executor.query(item.createSql)
    createdIndexes.push(item.name)
  }

  const createdSet = new Set(createdIndexes)
  const replacementByLegacy = new Map<string, string>([
    ...TEXTS_TABLES.map((t) => [`${t}_order_parent`, `${t}_parent_path_order_idx`] as const),
    ...LOCKED_DOCUMENT_RELS_STANDARD_FK_COLUMNS.map(
      (item) => [item.undonePartialIndex, item.drizzleIndex] as const,
    ),
    ['mail_threads_folder_idx', 'mail_threads_counts_cover_idx'],
    ['mail_messages_thread_idx', 'mail_messages_thread_sent_idx'],
    ['_articles_v_parent_idx', '_articles_v_parent_updated_idx'],
    ['_projects_v_parent_idx', '_projects_v_parent_updated_idx'],
    ['payload_jobs_queue_idx', 'payload_jobs_queue_wait_created_idx'],
  ])

  const droppedIndexes: string[] = []
  for (const dropItem of plan.dropIndexes) {
    const requiredReplacement = replacementByLegacy.get(dropItem.name)
    if (requiredReplacement && !createdSet.has(requiredReplacement)) {
      continue
    }
    await executor.query(dropItem.dropSql)
    droppedIndexes.push(dropItem.name)
  }

  return {
    fkIntegrityApplied: true,
    createdIndexes,
    skippedMissingTables,
    droppedIndexes,
    concurrent,
  }
}
