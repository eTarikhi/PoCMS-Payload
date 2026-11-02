import { quoteSqlIdent, type QueryClientLike } from './payloadSql'

export const LEGACY_FORMS_BLOCK_TABLES = [
  'forms_blocks_checkbox',
  'forms_blocks_email',
  'forms_blocks_message',
  'forms_blocks_number',
  'forms_blocks_select',
  'forms_blocks_text',
  'forms_blocks_textarea',
] as const

export const LEGACY_FORMS_SELECT_OPTIONS_TABLE = 'forms_blocks_select_options' as const

export type FormsBlocksMigrationSummary = {
  formsTableExists: boolean
  legacyTablesFound: string[]
  backfilledFormsCount: number
  droppedLegacyTables: string[]
}

export type MailBodiesSidecarSummary = {
  mailMessagesExists: boolean
  sidecarEnsured: boolean
  legacyColumnsFound: string[]
  backfilledBodiesCount: number
  droppedLegacyColumns: string[]
}

export type AuditLogsHeapRestoreSummary = {
  auditLogsExists: boolean
  restoredFromPartitioned: boolean
  preservedRowsCount: number
  removedLegacyMigrationRow: boolean
}

export type Phase2And3OptimizationSummary = {
  formsBlocks: FormsBlocksMigrationSummary
  mailBodies: MailBodiesSidecarSummary
  auditLogsHeap: AuditLogsHeapRestoreSummary
}

function buildFormsBlockUnionSubquery(
  schemaIdent: string,
  presentTables: ReadonlySet<string>,
): string {
  const branches: string[] = []

  if (presentTables.has('forms_blocks_checkbox')) {
    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'checkbox',
          'name', b."name",
          'label', b."label",
          'width', b."width"::double precision,
          'required', b."required",
          'defaultValue', b."default_value",
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_checkbox" b
    `)
  }

  if (presentTables.has('forms_blocks_email')) {
    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'email',
          'name', b."name",
          'label', b."label",
          'width', b."width"::double precision,
          'required', b."required",
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_email" b
    `)
  }

  if (presentTables.has('forms_blocks_message')) {
    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'message',
          'message', b."message",
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_message" b
    `)
  }

  if (presentTables.has('forms_blocks_number')) {
    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'number',
          'name', b."name",
          'label', b."label",
          'width', b."width"::double precision,
          'defaultValue', b."default_value"::double precision,
          'required', b."required",
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_number" b
    `)
  }

  if (presentTables.has('forms_blocks_select')) {
    const optionsExpr = presentTables.has(LEGACY_FORMS_SELECT_OPTIONS_TABLE)
      ? `COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', o."id",
               'label', o."label",
               'value', o."value"
             )
             ORDER BY o."_order" ASC
           )
           FROM ${schemaIdent}."forms_blocks_select_options" o
           WHERE o."_parent_id" = b."id"
         ), '[]'::jsonb)`
      : `'[]'::jsonb`

    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'select',
          'name', b."name",
          'label', b."label",
          'width', b."width"::double precision,
          'defaultValue', b."default_value",
          'placeholder', b."placeholder",
          'required', b."required",
          'options', ${optionsExpr},
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_select" b
    `)
  }

  if (presentTables.has('forms_blocks_text')) {
    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'text',
          'name', b."name",
          'label', b."label",
          'width', b."width"::double precision,
          'defaultValue', b."default_value",
          'required', b."required",
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_text" b
    `)
  }

  if (presentTables.has('forms_blocks_textarea')) {
    branches.push(`
      SELECT
        b."_parent_id" AS parent_id,
        b."_order" AS block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'id', b."id",
          'blockType', 'textarea',
          'name', b."name",
          'label', b."label",
          'width', b."width"::double precision,
          'defaultValue', b."default_value",
          'required', b."required",
          'blockName', b."block_name"
        )) AS block_json
      FROM ${schemaIdent}."forms_blocks_textarea" b
    `)
  }

  return branches.join('\nUNION ALL\n')
}

/**
 * R-10 (Phase 2): Losslessly migrates legacy relational `forms_blocks_*` rows (and nested
 * `forms_blocks_select_options`) into inline `"forms"."fields"` (`jsonb`) ordered by `_order ASC`,
 * then drops the 8 legacy block tables.
 */
export async function migrateFormsBlocksToJsonb(
  db: QueryClientLike,
  options: { schemaName?: string; dropLegacyTables?: boolean } = {},
): Promise<FormsBlocksMigrationSummary> {
  const schemaName = options.schemaName ?? 'public'
  const s = quoteSqlIdent(schemaName)
  const dropLegacyTables = options.dropLegacyTables !== false

  const tablesRes = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_type = 'BASE TABLE'`,
    [schemaName],
  )
  const existingTables = new Set(
    (tablesRes.rows ?? []).map((r) => String((r as { table_name: string }).table_name)),
  )

  if (!existingTables.has('forms')) {
    return {
      formsTableExists: false,
      legacyTablesFound: [],
      backfilledFormsCount: 0,
      droppedLegacyTables: [],
    }
  }

  await db.query(`ALTER TABLE ${s}."forms" ADD COLUMN IF NOT EXISTS "fields" jsonb`)

  const allLegacyCandidates = [
    ...LEGACY_FORMS_BLOCK_TABLES,
    LEGACY_FORMS_SELECT_OPTIONS_TABLE,
  ] as const
  const legacyTablesFound = allLegacyCandidates.filter((t) => existingTables.has(t))

  let backfilledFormsCount = 0
  const topLevelPresent = LEGACY_FORMS_BLOCK_TABLES.filter((t) => existingTables.has(t))
  if (topLevelPresent.length > 0) {
    const unionSql = buildFormsBlockUnionSubquery(s, existingTables)
    const updateRes = await db.query(`
      WITH all_blocks AS (
        ${unionSql}
      ),
      aggregated AS (
        SELECT
          parent_id,
          jsonb_agg(block_json ORDER BY block_order ASC) AS fields_json
        FROM all_blocks
        GROUP BY parent_id
      )
      UPDATE ${s}."forms" f
      SET "fields" = agg.fields_json
      FROM aggregated agg
      WHERE f."id" = agg.parent_id
        AND (
          f."fields" IS NULL
          OR jsonb_typeof(f."fields") <> 'array'
          OR jsonb_array_length(f."fields") = 0
        )
    `)
    backfilledFormsCount = updateRes.rowCount ?? 0
  }

  await db.query(`UPDATE ${s}."forms" SET "fields" = '[]'::jsonb WHERE "fields" IS NULL`)

  const droppedLegacyTables: string[] = []
  if (dropLegacyTables && legacyTablesFound.length > 0) {
    if (existingTables.has(LEGACY_FORMS_SELECT_OPTIONS_TABLE)) {
      await db.query(
        `DROP TABLE IF EXISTS ${s}.${quoteSqlIdent(LEGACY_FORMS_SELECT_OPTIONS_TABLE)} CASCADE`,
      )
      droppedLegacyTables.push(LEGACY_FORMS_SELECT_OPTIONS_TABLE)
    }
    for (const tbl of LEGACY_FORMS_BLOCK_TABLES) {
      if (existingTables.has(tbl)) {
        await db.query(`DROP TABLE IF EXISTS ${s}.${quoteSqlIdent(tbl)} CASCADE`)
        droppedLegacyTables.push(tbl)
      }
    }
  }

  return {
    formsTableExists: true,
    legacyTablesFound,
    backfilledFormsCount,
    droppedLegacyTables,
  }
}

/**
 * R-13a (Phase 3): Ensures the 1:1 `mail_message_bodies` cold MIME sidecar table exists, backfills
 * any legacy `sanitized_html`, `quoted_history_text`, and `headers_snapshot` columns from
 * `mail_messages`, and drops those cold TOAST columns from the hot `mail_messages` heap.
 */
export async function migrateMailMessageBodiesSidecar(
  db: QueryClientLike,
  options: { schemaName?: string; dropLegacyColumns?: boolean } = {},
): Promise<MailBodiesSidecarSummary> {
  const schemaName = options.schemaName ?? 'public'
  const s = quoteSqlIdent(schemaName)
  const dropLegacyColumns = options.dropLegacyColumns !== false

  const colsRes = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'mail_messages'`,
    [schemaName],
  )
  const msgColumns = new Set(
    (colsRes.rows ?? []).map((r) => String((r as { column_name: string }).column_name)),
  )

  if (msgColumns.size === 0) {
    return {
      mailMessagesExists: false,
      sidecarEnsured: false,
      legacyColumnsFound: [],
      backfilledBodiesCount: 0,
      droppedLegacyColumns: [],
    }
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${s}."mail_message_bodies" (
      "message_id" integer PRIMARY KEY NOT NULL,
      "sanitized_html" text,
      "quoted_history_text" text,
      "headers_snapshot" jsonb,
      "blob_key" varchar,
      "archived_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "mail_message_bodies_message_id_fk"
        FOREIGN KEY ("message_id")
        REFERENCES ${s}."mail_messages"("id")
        ON DELETE CASCADE
    )
  `)
  await db.query(
    `CREATE INDEX IF NOT EXISTS "mail_message_bodies_blob_key_idx" ON ${s}."mail_message_bodies" ("blob_key")`,
  )

  const legacyCandidates = ['sanitized_html', 'quoted_history_text', 'headers_snapshot'] as const
  const legacyColumnsFound = legacyCandidates.filter((c) => msgColumns.has(c))

  let backfilledBodiesCount = 0
  if (legacyColumnsFound.length > 0) {
    const htmlExpr = msgColumns.has('sanitized_html') ? 'm."sanitized_html"' : 'NULL::text'
    const quotedExpr = msgColumns.has('quoted_history_text')
      ? 'm."quoted_history_text"'
      : 'NULL::text'
    const headersExpr = msgColumns.has('headers_snapshot')
      ? 'm."headers_snapshot"'
      : 'NULL::jsonb'

    const copyRes = await db.query(`
      INSERT INTO ${s}."mail_message_bodies" (
        "message_id",
        "sanitized_html",
        "quoted_history_text",
        "headers_snapshot",
        "updated_at"
      )
      SELECT
        m."id",
        ${htmlExpr},
        ${quotedExpr},
        ${headersExpr},
        COALESCE(m."updated_at", NOW())
      FROM ${s}."mail_messages" m
      WHERE (${htmlExpr} IS NOT NULL OR ${quotedExpr} IS NOT NULL OR ${headersExpr} IS NOT NULL)
      ON CONFLICT ("message_id") DO NOTHING
    `)
    backfilledBodiesCount = copyRes.rowCount ?? 0
  }

  const droppedLegacyColumns: string[] = []
  if (dropLegacyColumns && legacyColumnsFound.length > 0) {
    for (const col of legacyColumnsFound) {
      await db.query(`ALTER TABLE ${s}."mail_messages" DROP COLUMN IF EXISTS ${quoteSqlIdent(col)}`)
      droppedLegacyColumns.push(col)
    }
  }

  return {
    mailMessagesExists: true,
    sidecarEnsured: true,
    legacyColumnsFound,
    backfilledBodiesCount,
    droppedLegacyColumns,
  }
}

/**
 * Restores any database where `audit_logs` was previously converted to a PostgreSQL declarative
 * range-partitioned table (`relkind = 'p'`, incompatible with `drizzle-kit` `pushSchema` /
 * `migrate:create`) back to a standard Payload 3 Drizzle heap table (`relkind = 'r'`,
 * `PRIMARY KEY ("id")`) with 100% row preservation, restores `payload_locked_documents_rels.audit_logs_id`,
 * and cleans up the retired `20261031_001_phase1_integrity_and_indexes` migration row so Drizzle
 * `pushDevSchema` operates cleanly without conflicts.
 */
export async function restoreAuditLogsHeapIfPartitioned(
  db: QueryClientLike,
  options: { schemaName?: string } = {},
): Promise<AuditLogsHeapRestoreSummary> {
  const schemaName = options.schemaName ?? 'public'
  const s = quoteSqlIdent(schemaName)
  const escapedSchema = schemaName.replace(/'/g, "''")

  const relRes = await db.query(
    `SELECT c.relkind::text AS relkind
     FROM pg_class c
     INNER JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1
       AND c.relname = 'audit_logs'`,
    [schemaName],
  )
  const relkind = (relRes.rows?.[0] as { relkind?: string } | undefined)?.relkind

  let restoredFromPartitioned = false
  let preservedRowsCount = 0

  if (relkind === 'p') {
    await db.query('BEGIN')
    try {
      await db.query(`ALTER TABLE ${s}."audit_logs" RENAME TO "audit_logs__part_restore"`)

      for (const idxName of [
        'audit_logs_pkey',
        'audit_logs_action_idx',
        'audit_logs_entity_type_idx',
        'audit_logs_document_id_idx',
        'audit_logs_actor_idx',
        'audit_logs_updated_at_idx',
        'audit_logs_created_at_idx',
        'audit_logs_entity_doc_created_idx',
      ]) {
        const renameTarget = `${idxName}__part`.slice(0, 62)
        await db.query(
          `ALTER INDEX IF EXISTS ${s}.${quoteSqlIdent(idxName)} RENAME TO ${quoteSqlIdent(renameTarget)}`,
        )
      }

      await db.query(`
        CREATE TABLE ${s}."audit_logs" (
          LIKE ${s}."audit_logs__part_restore" INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING COMMENTS,
          PRIMARY KEY ("id")
        )
      `)

      const usersCheck = await db.query(
        `SELECT to_regclass($1) IS NOT NULL AS exists`,
        [`${schemaName}.users`],
      )
      if ((usersCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
        await db.query(`
          ALTER TABLE ${s}."audit_logs"
          ADD CONSTRAINT "audit_logs_actor_id_users_id_fk"
          FOREIGN KEY ("actor_id")
          REFERENCES ${s}."users"("id")
          ON DELETE SET NULL
        `)
      }

      await db.query(`CREATE INDEX "audit_logs_action_idx" ON ${s}."audit_logs" ("action")`)
      await db.query(
        `CREATE INDEX "audit_logs_entity_type_idx" ON ${s}."audit_logs" ("entity_type")`,
      )
      await db.query(
        `CREATE INDEX "audit_logs_document_id_idx" ON ${s}."audit_logs" ("document_id")`,
      )
      await db.query(`CREATE INDEX "audit_logs_actor_idx" ON ${s}."audit_logs" ("actor_id")`)
      await db.query(
        `CREATE INDEX "audit_logs_updated_at_idx" ON ${s}."audit_logs" ("updated_at")`,
      )
      await db.query(
        `CREATE INDEX "audit_logs_created_at_idx" ON ${s}."audit_logs" ("created_at")`,
      )

      const copyRes = await db.query(`
        INSERT INTO ${s}."audit_logs"
        SELECT * FROM ${s}."audit_logs__part_restore"
        ORDER BY "id" ASC
      `)
      preservedRowsCount = copyRes.rowCount ?? 0

      const seqCheck = await db.query(
        `SELECT to_regclass($1) IS NOT NULL AS exists`,
        [`${schemaName}.audit_logs_id_seq`],
      )
      if ((seqCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
        await db.query(
          `ALTER SEQUENCE ${s}."audit_logs_id_seq" OWNED BY ${s}."audit_logs"."id"`,
        )
        await db.query(`
          SELECT setval(
            '${escapedSchema}.audit_logs_id_seq',
            GREATEST(COALESCE((SELECT MAX("id") FROM ${s}."audit_logs"), 0), 1),
            EXISTS (SELECT 1 FROM ${s}."audit_logs")
          )
        `)
      }

      // Atomically drops the partitioned parent AND all monthly/default child partition tables
      await db.query(`DROP TABLE ${s}."audit_logs__part_restore" CASCADE`)
      await db.query('COMMIT')
      restoredFromPartitioned = true
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {})
      throw err
    }
  }

  // Ensure `payload_locked_documents_rels` stays aligned with Payload's Drizzle schema:
  // - `mail_messages` and `mail_webhook_events` retain `lockDocuments: false` (drop obsolete columns if present).
  // - `audit_logs` has standard `lockDocuments` restored (re-add `audit_logs_id` + FK if previously dropped).
  const pldCheck = await db.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`${schemaName}.payload_locked_documents_rels`],
  )
  if ((pldCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
    for (const obsoleteCol of ['mail_webhook_events_id', 'mail_messages_id']) {
      await db.query(
        `ALTER TABLE ${s}."payload_locked_documents_rels" DROP COLUMN IF EXISTS ${quoteSqlIdent(obsoleteCol)} CASCADE`,
      )
    }

    if (relkind === 'r' || restoredFromPartitioned) {
      await db.query(
        `ALTER TABLE ${s}."payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "audit_logs_id" integer`,
      )
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            INNER JOIN pg_class rel ON rel.oid = c.conrelid
            INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = '${escapedSchema}'
              AND rel.relname = 'payload_locked_documents_rels'
              AND c.conname = 'payload_locked_documents_rels_audit_logs_fk'
          ) THEN
            EXECUTE 'ALTER TABLE ${s}."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_logs_fk" FOREIGN KEY ("audit_logs_id") REFERENCES ${s}."audit_logs"("id") ON DELETE CASCADE';
          END IF;
        END $$;
      `)
    }
  }

  // Clean up any historical job rows referencing the retired `maintainAuditLogPartitions` task slug
  // so Drizzle enum updates on `enum_payload_jobs_task_slug` never fail casting.
  const jobsLogCheck = await db.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`${schemaName}.payload_jobs_log`],
  )
  if ((jobsLogCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
    await db.query(
      `DELETE FROM ${s}."payload_jobs_log" WHERE "task_slug"::text = 'maintainAuditLogPartitions'`,
    )
  }
  const jobsCheck = await db.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`${schemaName}.payload_jobs`],
  )
  if ((jobsCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
    await db.query(
      `DELETE FROM ${s}."payload_jobs" WHERE "task_slug"::text = 'maintainAuditLogPartitions'`,
    )
  }

  // Restore `payload_migrations` if the retired Phase 1 migration row was previously recorded on a
  // `pushDevSchema` database (`R-07` undo: do not mix `push` and tracked migrations).
  let removedLegacyMigrationRow = false
  const migCheck = await db.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`${schemaName}.payload_migrations`],
  )
  if ((migCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
    const delRes = await db.query(
      `DELETE FROM ${s}."payload_migrations" WHERE "name" = '20261031_001_phase1_integrity_and_indexes'`,
    )
    removedLegacyMigrationRow = (delRes.rowCount ?? 0) > 0
    if (removedLegacyMigrationRow) {
      const remainingRes = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM ${s}."payload_migrations"`,
      )
      const remainingCount = Number((remainingRes.rows?.[0] as { cnt?: number } | undefined)?.cnt ?? 0)
      if (remainingCount === 0) {
        await db.query(
          `INSERT INTO ${s}."payload_migrations" ("name", "batch") VALUES ('dev', -1)`,
        )
      }
    }
  }

  return {
    auditLogsExists: Boolean(relkind),
    restoredFromPartitioned,
    preservedRowsCount,
    removedLegacyMigrationRow,
  }
}

/**
 * Applies Payload 3–compliant Phase 2 (`R-10`) and Phase 3 (`R-13a`) SQL optimizations idempotently,
 * while restoring any previously partitioned `audit_logs` table (`R-13b`) back to a standard Drizzle
 * heap table (`relkind = 'r'`).
 */
export async function applyPhase2And3DatabaseOptimizations(
  db: QueryClientLike,
  options: {
    schemaName?: string
  } = {},
): Promise<Phase2And3OptimizationSummary> {
  const schemaName = options.schemaName ?? 'public'

  const auditLogsHeap = await restoreAuditLogsHeapIfPartitioned(db, { schemaName })
  const formsBlocks = await migrateFormsBlocksToJsonb(db, { schemaName })
  const mailBodies = await migrateMailMessageBodiesSidecar(db, { schemaName })

  return {
    formsBlocks,
    mailBodies,
    auditLogsHeap,
  }
}
