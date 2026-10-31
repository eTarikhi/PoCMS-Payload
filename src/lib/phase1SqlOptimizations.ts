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

export const LOCKED_DOCUMENT_RELS_NULLABLE_FK_COLUMNS: readonly {
  column: string
  legacyIndex: string
  partialIndex: string
}[] = [
  {
    column: 'articles_id',
    legacyIndex: 'payload_locked_documents_rels_articles_id_idx',
    partialIndex: 'idx_pld_rels_articles_nn',
  },
  {
    column: 'projects_id',
    legacyIndex: 'payload_locked_documents_rels_projects_id_idx',
    partialIndex: 'idx_pld_rels_projects_nn',
  },
  {
    column: 'media_id',
    legacyIndex: 'payload_locked_documents_rels_media_id_idx',
    partialIndex: 'idx_pld_rels_media_nn',
  },
  {
    column: 'about_id',
    legacyIndex: 'payload_locked_documents_rels_about_id_idx',
    partialIndex: 'idx_pld_rels_about_nn',
  },
  {
    column: 'experiences_id',
    legacyIndex: 'payload_locked_documents_rels_experiences_id_idx',
    partialIndex: 'idx_pld_rels_experiences_nn',
  },
  {
    column: 'educations_id',
    legacyIndex: 'payload_locked_documents_rels_educations_id_idx',
    partialIndex: 'idx_pld_rels_educations_nn',
  },
  {
    column: 'certificates_id',
    legacyIndex: 'payload_locked_documents_rels_certificates_id_idx',
    partialIndex: 'idx_pld_rels_certificates_nn',
  },
  {
    column: 'services_id',
    legacyIndex: 'payload_locked_documents_rels_services_id_idx',
    partialIndex: 'idx_pld_rels_services_nn',
  },
  {
    column: 'skills_id',
    legacyIndex: 'payload_locked_documents_rels_skills_id_idx',
    partialIndex: 'idx_pld_rels_skills_nn',
  },
  {
    column: 'users_id',
    legacyIndex: 'payload_locked_documents_rels_users_id_idx',
    partialIndex: 'idx_pld_rels_users_nn',
  },
  {
    column: 'roles_id',
    legacyIndex: 'payload_locked_documents_rels_roles_id_idx',
    partialIndex: 'idx_pld_rels_roles_nn',
  },
  {
    column: 'audit_logs_id',
    legacyIndex: 'payload_locked_documents_rels_audit_logs_id_idx',
    partialIndex: 'idx_pld_rels_audit_logs_nn',
  },
  {
    column: 'redirects_id',
    legacyIndex: 'payload_locked_documents_rels_redirects_id_idx',
    partialIndex: 'idx_pld_rels_redirects_nn',
  },
  {
    column: 'forms_id',
    legacyIndex: 'payload_locked_documents_rels_forms_id_idx',
    partialIndex: 'idx_pld_rels_forms_nn',
  },
  {
    column: 'form_submissions_id',
    legacyIndex: 'payload_locked_documents_rels_form_submissions_id_idx',
    partialIndex: 'idx_pld_rels_form_submissions_nn',
  },
  {
    column: 'mail_threads_id',
    legacyIndex: 'payload_locked_documents_rels_mail_threads_id_idx',
    partialIndex: 'idx_pld_rels_mail_threads_nn',
  },
  {
    column: 'mail_messages_id',
    legacyIndex: 'payload_locked_documents_rels_mail_messages_id_idx',
    partialIndex: 'idx_pld_rels_mail_messages_nn',
  },
  {
    column: 'mail_attachments_id',
    legacyIndex: 'payload_locked_documents_rels_mail_attachments_id_idx',
    partialIndex: 'idx_pld_rels_mail_attachments_nn',
  },
  {
    column: 'mail_labels_id',
    legacyIndex: 'payload_locked_documents_rels_mail_labels_id_idx',
    partialIndex: 'idx_pld_rels_mail_labels_nn',
  },
  {
    column: 'mail_webhook_events_id',
    legacyIndex: 'payload_locked_documents_rels_mail_webhook_events_id_idx',
    partialIndex: 'idx_pld_rels_mail_webhook_events_nn',
  },
  {
    column: 'payload_folders_id',
    legacyIndex: 'payload_locked_documents_rels_payload_folders_id_idx',
    partialIndex: 'idx_pld_rels_payload_folders_nn',
  },
]

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
  ...LOCKED_DOCUMENT_RELS_NULLABLE_FK_COLUMNS.map((item) => item.legacyIndex),
] as const

export type Phase1IndexSpec = {
  name: string
  table: string
  requiredColumns: readonly string[]
  createSql: string
}

export type Phase1OptimizationPlan = {
  extensionSql: string
  fkIntegritySql: string
  createIndexes: Phase1IndexSpec[]
  dropIndexes: { name: string; dropSql: string }[]
}

/**
 * Generates the idempotent Phase 1 SQL plan (`R-06`, `R-08`, `R-09`).
 *
 * - `concurrent: false` -> safe inside Payload's transactional `migration.up({ db })` (`BEGIN ... COMMIT`).
 * - `concurrent: true`  -> emits `CREATE INDEX CONCURRENTLY IF NOT EXISTS` and
 *   `DROP INDEX CONCURRENTLY IF EXISTS` for zero-lock online execution over `POSTGRES_URL_NON_POOLING`.
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
      EXECUTE 'ALTER TABLE ${s}."mail_messages" ADD CONSTRAINT "mail_messages_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES ${s}."mail_threads"("id") ON DELETE CASCADE';
    END IF;
  END IF;
END $$;
`.trim()

  const createIndexes: Phase1IndexSpec[] = [
    // 1. All 7 *_texts leading parent_id composite indexes
    ...TEXTS_TABLES.map((tbl) => {
      const idxName = `${tbl}_parent_path_order_idx`
      return {
        name: idxName,
        table: tbl,
        requiredColumns: ['parent_id', 'path', 'order'],
        createSql: `${createKw} ${quoteSqlIdent(idxName)} ON ${s}.${quoteSqlIdent(tbl)} ("parent_id", "path", "order");`,
      }
    }),

    // 2. Public portfolio feed partial indexes
    {
      name: 'idx_articles_public_feed',
      table: 'articles',
      requiredColumns: ['published_at', 'deleted_at', '_status'],
      createSql: `${createKw} "idx_articles_public_feed" ON ${s}."articles" ("published_at" DESC) WHERE "deleted_at" IS NULL AND ("_status" = 'published' OR "_status" IS NULL);`,
    },
    {
      name: 'idx_projects_public_feed',
      table: 'projects',
      requiredColumns: ['_order', 'deleted_at', '_status'],
      createSql: `${createKw} "idx_projects_public_feed" ON ${s}."projects" ("_order" ASC) WHERE "deleted_at" IS NULL AND ("_status" = 'published' OR "_status" IS NULL);`,
    },

    // 3. Version snapshot Admin list & retention pruning indexes
    {
      name: 'idx_articles_v_latest_updated',
      table: '_articles_v',
      requiredColumns: ['updated_at', 'latest'],
      createSql: `${createKw} "idx_articles_v_latest_updated" ON ${s}."_articles_v" ("updated_at" DESC) WHERE "latest" = true;`,
    },
    {
      name: '_articles_v_parent_updated_idx',
      table: '_articles_v',
      requiredColumns: ['parent_id', 'updated_at'],
      createSql: `${createKw} "_articles_v_parent_updated_idx" ON ${s}."_articles_v" ("parent_id", "updated_at" DESC);`,
    },
    {
      name: 'idx_projects_v_latest_updated',
      table: '_projects_v',
      requiredColumns: ['updated_at', 'latest'],
      createSql: `${createKw} "idx_projects_v_latest_updated" ON ${s}."_projects_v" ("updated_at" DESC) WHERE "latest" = true;`,
    },
    {
      name: '_projects_v_parent_updated_idx',
      table: '_projects_v',
      requiredColumns: ['parent_id', 'updated_at'],
      createSql: `${createKw} "_projects_v_parent_updated_idx" ON ${s}."_projects_v" ("parent_id", "updated_at" DESC);`,
    },

    // 4. Mail Inbox covering counts, timeline, message ordering, and pg_trgm search
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
      createSql: `${createKw} "mail_threads_folder_last_msg_idx" ON ${s}."mail_threads" ("folder", "last_message_at" DESC);`,
    },
    {
      name: 'idx_mail_threads_search_trgm',
      table: 'mail_threads',
      requiredColumns: ['subject', 'snippet', 'counterparty_name', 'counterparty_email'],
      createSql: `${createKw} "idx_mail_threads_search_trgm" ON ${s}."mail_threads" USING gin ((coalesce("subject", '') || ' ' || coalesce("snippet", '') || ' ' || coalesce("counterparty_name", '') || ' ' || coalesce("counterparty_email", '')) gin_trgm_ops);`,
    },
    {
      name: 'mail_messages_thread_sent_idx',
      table: 'mail_messages',
      requiredColumns: ['thread_id', 'sent_at'],
      createSql: `${createKw} "mail_messages_thread_sent_idx" ON ${s}."mail_messages" ("thread_id", "sent_at" ASC);`,
    },

    // 5. Payload Jobs queue composite & runnable partial indexes
    {
      name: 'payload_jobs_queue_wait_created_idx',
      table: 'payload_jobs',
      requiredColumns: ['queue', 'wait_until', 'created_at'],
      createSql: `${createKw} "payload_jobs_queue_wait_created_idx" ON ${s}."payload_jobs" ("queue", "wait_until" ASC, "created_at" ASC);`,
    },
    {
      name: 'idx_payload_jobs_runnable',
      table: 'payload_jobs',
      requiredColumns: ['queue', 'wait_until', 'created_at', 'completed_at', 'processing', 'has_error'],
      createSql: `${createKw} "idx_payload_jobs_runnable" ON ${s}."payload_jobs" ("queue", "wait_until" ASC, "created_at" ASC) WHERE "completed_at" IS NULL AND "processing" = false AND "has_error" = false;`,
    },

    // 6. R-09: Partial WHERE <col> IS NOT NULL FK indexes on payload_locked_documents_rels
    ...LOCKED_DOCUMENT_RELS_NULLABLE_FK_COLUMNS.map(({ column, partialIndex }) => ({
      name: partialIndex,
      table: 'payload_locked_documents_rels',
      requiredColumns: [column],
      createSql: `${createKw} ${quoteSqlIdent(partialIndex)} ON ${s}."payload_locked_documents_rels" (${quoteSqlIdent(column)}) WHERE ${quoteSqlIdent(column)} IS NOT NULL;`,
    })),
  ]

  const dropIndexes = REDUNDANT_LEGACY_INDEXES.map((idxName) => ({
    name: idxName,
    dropSql: `${dropKw} ${s}.${quoteSqlIdent(idxName)};`,
  }))

  return {
    extensionSql: 'CREATE EXTENSION IF NOT EXISTS "pg_trgm";',
    fkIntegritySql,
    createIndexes,
    dropIndexes,
  }
}

/**
 * Builds the reversible `down()` SQL statements restoring pre-Phase-1 index definitions.
 */
export function buildPhase1RollbackStatements(schemaName = 'public'): string[] {
  const s = quoteSqlIdent(schemaName)
  const plan = buildPhase1OptimizationPlan({ schemaName, concurrent: false })

  const statements: string[] = []
  for (const item of plan.createIndexes) {
    statements.push(`DROP INDEX IF EXISTS ${s}.${quoteSqlIdent(item.name)};`)
  }
  for (const tbl of TEXTS_TABLES) {
    statements.push(
      `DO $$ BEGIN IF to_regclass('${schemaName.replace(/'/g, "''")}.${tbl}') IS NOT NULL THEN EXECUTE 'CREATE INDEX IF NOT EXISTS ${quoteSqlIdent(`${tbl}_order_parent`)} ON ${s}.${quoteSqlIdent(tbl)} ("order", "parent_id")'; END IF; END $$;`,
    )
  }
  for (const { column, legacyIndex } of LOCKED_DOCUMENT_RELS_NULLABLE_FK_COLUMNS) {
    statements.push(
      `DO $$ BEGIN IF to_regclass('${schemaName.replace(/'/g, "''")}.payload_locked_documents_rels') IS NOT NULL THEN EXECUTE 'CREATE INDEX IF NOT EXISTS ${quoteSqlIdent(legacyIndex)} ON ${s}."payload_locked_documents_rels" (${quoteSqlIdent(column)})'; END IF; END $$;`,
    )
  }
  return statements
}

/**
 * Wraps each non-concurrent `CREATE INDEX IF NOT EXISTS` in a table-existence guard so
 * `payload migrate` (`up`) is 100% safe and idempotent across empty, partial, or populated DBs.
 */
export function buildPhase1MigrationUpStatements(schemaName = 'public'): string[] {
  const plan = buildPhase1OptimizationPlan({ schemaName, concurrent: false })
  const escapedSchema = schemaName.replace(/'/g, "''")

  const guardedCreates = plan.createIndexes.map((idx) => {
    const escapedCreate = idx.createSql.replace(/;$/, '').replace(/'/g, "''")
    const escapedTable = idx.table.replace(/'/g, "''")
    const colLiterals = idx.requiredColumns.map((c) => `'${c.replace(/'/g, "''")}'`).join(', ')
    const colCount = idx.requiredColumns.length
    return `DO $$ BEGIN IF (SELECT count(DISTINCT column_name) FROM information_schema.columns WHERE table_schema = '${escapedSchema}' AND table_name = '${escapedTable}' AND column_name IN (${colLiterals})) = ${colCount} THEN EXECUTE '${escapedCreate}'; END IF; END $$;`
  })

  const replacementByLegacy = new Map<string, string>([
    ...TEXTS_TABLES.map((t) => [`${t}_order_parent`, `${t}_parent_path_order_idx`] as const),
    ...LOCKED_DOCUMENT_RELS_NULLABLE_FK_COLUMNS.map(
      (item) => [item.legacyIndex, item.partialIndex] as const,
    ),
    ['mail_threads_folder_idx', 'mail_threads_counts_cover_idx'],
    ['mail_messages_thread_idx', 'mail_messages_thread_sent_idx'],
    ['_articles_v_parent_idx', '_articles_v_parent_updated_idx'],
    ['_projects_v_parent_idx', '_projects_v_parent_updated_idx'],
    ['payload_jobs_queue_idx', 'payload_jobs_queue_wait_created_idx'],
  ])

  const guardedDrops = plan.dropIndexes.map((d) => {
    const repl = replacementByLegacy.get(d.name)
    if (!repl) return d.dropSql
    const escapedDrop = d.dropSql.replace(/;$/, '').replace(/'/g, "''")
    return `DO $$ BEGIN IF to_regclass('${escapedSchema}.${repl.replace(/'/g, "''")}') IS NOT NULL THEN EXECUTE '${escapedDrop}'; END IF; END $$;`
  })

  return [
    plan.extensionSql,
    plan.fkIntegritySql,
    ...guardedCreates,
    ...guardedDrops,
  ]
}

export type Phase1ExecutionSummary = {
  extensionEnsured: boolean
  fkIntegrityApplied: boolean
  createdIndexes: string[]
  skippedMissingTables: string[]
  droppedIndexes: string[]
  concurrent: boolean
}

/**
 * Executes the Phase 1 FK & Index optimization pass (`R-06`, `R-08`, `R-09`).
 * When `concurrent: true` (over `POSTGRES_URL_NON_POOLING` / unpooled Postgres), every index
 * creation and drop runs at top-level with `CONCURRENTLY` for zero-lock online execution.
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

  let extensionEnsured = false
  try {
    await executor.query(plan.extensionSql)
    extensionEnsured = true
  } catch {
    extensionEnsured = false
  }

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

  const createdIndexes: string[] = []
  const skippedMissingTables: string[] = []

  for (const item of plan.createIndexes) {
    const tableCols = columnsByTable.get(item.table)
    if (!tableCols || !item.requiredColumns.every((col) => tableCols.has(col))) {
      skippedMissingTables.push(`${item.table}:${item.name}`)
      continue
    }
    if (item.name === 'idx_mail_threads_search_trgm' && !extensionEnsured) {
      continue
    }
    await executor.query(item.createSql)
    createdIndexes.push(item.name)
  }

  // Only drop a legacy index if its replacement index's columns are present (or it is a redundant boolean B-tree)
  const createdSet = new Set(createdIndexes)
  const replacementByLegacy = new Map<string, string>([
    ...TEXTS_TABLES.map((t) => [`${t}_order_parent`, `${t}_parent_path_order_idx`] as const),
    ...LOCKED_DOCUMENT_RELS_NULLABLE_FK_COLUMNS.map(
      (item) => [item.legacyIndex, item.partialIndex] as const,
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
    extensionEnsured,
    fkIntegrityApplied: true,
    createdIndexes,
    skippedMissingTables,
    droppedIndexes,
    concurrent,
  }
}
