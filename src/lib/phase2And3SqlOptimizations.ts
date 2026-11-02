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

export type AuditLogsPartitionSummary = {
  auditLogsExists: boolean
  convertedFromHeap: boolean
  copiedRowsCount: number
  ensuredPartitions: string[]
  droppedExpiredPartitions: string[]
}

export type Phase2And3OptimizationSummary = {
  formsBlocks: FormsBlocksMigrationSummary
  mailBodies: MailBodiesSidecarSummary
  auditPartitions: AuditLogsPartitionSummary
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
    // Drop nested options child table first, then top-level block tables
    if (existingTables.has(LEGACY_FORMS_SELECT_OPTIONS_TABLE)) {
      await db.query(`DROP TABLE IF EXISTS ${s}.${quoteSqlIdent(LEGACY_FORMS_SELECT_OPTIONS_TABLE)} CASCADE`)
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

export type MonthlyPartitionSpec = {
  partitionName: string
  year: number
  month: number
  fromIso: string
  toIso: string
}

export function buildMonthlyPartitionSpec(year: number, month1Based: number): MonthlyPartitionSpec {
  const paddedMonth = String(month1Based).padStart(2, '0')
  const nextYear = month1Based === 12 ? year + 1 : year
  const nextMonth = month1Based === 12 ? 1 : month1Based + 1
  const paddedNextMonth = String(nextMonth).padStart(2, '0')

  return {
    partitionName: `audit_logs_y${year}m${paddedMonth}`,
    year,
    month: month1Based,
    fromIso: `${year}-${paddedMonth}-01T00:00:00.000Z`,
    toIso: `${nextYear}-${paddedNextMonth}-01T00:00:00.000Z`,
  }
}

export function computeUpcomingAuditPartitionSpecs(
  now: Date = new Date(),
  monthsAhead = 3,
  monthsBehind = 1,
): MonthlyPartitionSpec[] {
  const specs: MonthlyPartitionSpec[] = []
  const baseYear = now.getUTCFullYear()
  const baseMonth0 = now.getUTCMonth()

  for (let offset = -Math.max(0, monthsBehind); offset <= Math.max(0, monthsAhead); offset += 1) {
    const d = new Date(Date.UTC(baseYear, baseMonth0 + offset, 1))
    specs.push(buildMonthlyPartitionSpec(d.getUTCFullYear(), d.getUTCMonth() + 1))
  }
  return specs
}

function parsePartitionYearMonth(partitionName: string): { year: number; month: number } | null {
  const m = /^audit_logs_y(\d{4})m(0[1-9]|1[0-2])$/.exec(partitionName)
  if (!m) return null
  return {
    year: Number.parseInt(m[1], 10),
    month: Number.parseInt(m[2], 10),
  }
}

/**
 * R-13b (Phase 3): Converts `audit_logs` in-place to a declarative PostgreSQL monthly range-partitioned
 * table (`PARTITION BY RANGE ("created_at")`), ensures past/current/upcoming monthly partitions
 * plus `audit_logs_default`, and optionally drops expired monthly partitions instantaneously
 * (`DROP TABLE`) without `VACUUM` dead-tuple overhead.
 */
export async function partitionAuditLogsByMonth(
  db: QueryClientLike,
  options: {
    schemaName?: string
    now?: Date
    monthsAhead?: number
    retentionMonths?: number
  } = {},
): Promise<AuditLogsPartitionSummary> {
  const schemaName = options.schemaName ?? 'public'
  const s = quoteSqlIdent(schemaName)
  const now = options.now ?? new Date()
  const monthsAhead = options.monthsAhead ?? 3

  const relRes = await db.query(
    `SELECT c.relkind::text AS relkind
     FROM pg_class c
     INNER JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1
       AND c.relname = 'audit_logs'`,
    [schemaName],
  )
  const relkind = (relRes.rows?.[0] as { relkind?: string } | undefined)?.relkind
  if (!relkind) {
    return {
      auditLogsExists: false,
      convertedFromHeap: false,
      copiedRowsCount: 0,
      ensuredPartitions: [],
      droppedExpiredPartitions: [],
    }
  }

  let convertedFromHeap = false
  let copiedRowsCount = 0
  const ensuredPartitions: string[] = []

  // Clean up any legacy `payload_locked_documents_rels` columns/FKs for collections that now set
  // `lockDocuments: false` (`audit_logs`, `mail_webhook_events`, `mail_messages`), which otherwise
  // hold an incoming FK to `audit_logs(id)` alone.
  const pldCheck = await db.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`${schemaName}.payload_locked_documents_rels`],
  )
  if ((pldCheck.rows?.[0] as { exists?: boolean } | undefined)?.exists) {
    for (const obsoleteCol of ['audit_logs_id', 'mail_webhook_events_id', 'mail_messages_id']) {
      await db.query(
        `ALTER TABLE ${s}."payload_locked_documents_rels" DROP COLUMN IF EXISTS ${quoteSqlIdent(obsoleteCol)} CASCADE`,
      )
    }
  }

  if (relkind === 'r') {
    // Discover all distinct UTC year-months already stored in `audit_logs` before converting
    const historicalMonthsRes = await db.query(`
      SELECT DISTINCT
        EXTRACT(YEAR FROM "created_at" AT TIME ZONE 'UTC')::int AS yr,
        EXTRACT(MONTH FROM "created_at" AT TIME ZONE 'UTC')::int AS mo
      FROM ${s}."audit_logs"
      WHERE "created_at" IS NOT NULL
      ORDER BY yr ASC, mo ASC
    `)

    const specsMap = new Map<string, MonthlyPartitionSpec>()
    for (const row of historicalMonthsRes.rows ?? []) {
      const r = row as { yr?: number; mo?: number }
      if (typeof r.yr === 'number' && typeof r.mo === 'number') {
        const spec = buildMonthlyPartitionSpec(r.yr, r.mo)
        specsMap.set(spec.partitionName, spec)
      }
    }
    for (const spec of computeUpcomingAuditPartitionSpecs(now, monthsAhead, 1)) {
      specsMap.set(spec.partitionName, spec)
    }

    await db.query('BEGIN')
    try {
      await db.query(`ALTER TABLE ${s}."audit_logs" RENAME TO "audit_logs__legacy_heap"`)
      // Drop legacy index names on the renamed heap table so the new partitioned parent owns the canonical names
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
        const renameTarget = `${idxName}__leg`.slice(0, 62)
        await db.query(
          `ALTER INDEX IF EXISTS ${s}.${quoteSqlIdent(idxName)} RENAME TO ${quoteSqlIdent(renameTarget)}`,
        )
      }

      await db.query(`
        CREATE TABLE ${s}."audit_logs" (
          LIKE ${s}."audit_logs__legacy_heap" INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING COMMENTS,
          PRIMARY KEY ("id", "created_at")
        ) PARTITION BY RANGE ("created_at")
      `)

      // Re-attach optional actor FK to `users(id)` when `users` exists
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

      // Create indexes on partitioned parent (auto-propagated to every monthly partition)
      await db.query(`CREATE INDEX "audit_logs_action_idx" ON ${s}."audit_logs" ("action")`)
      await db.query(`CREATE INDEX "audit_logs_entity_type_idx" ON ${s}."audit_logs" ("entity_type")`)
      await db.query(`CREATE INDEX "audit_logs_document_id_idx" ON ${s}."audit_logs" ("document_id")`)
      await db.query(`CREATE INDEX "audit_logs_actor_idx" ON ${s}."audit_logs" ("actor_id")`)
      await db.query(`CREATE INDEX "audit_logs_updated_at_idx" ON ${s}."audit_logs" ("updated_at")`)
      await db.query(`CREATE INDEX "audit_logs_created_at_idx" ON ${s}."audit_logs" ("created_at" DESC)`)
      await db.query(
        `CREATE INDEX "audit_logs_entity_doc_created_idx" ON ${s}."audit_logs" ("entity_type", "document_id", "created_at" DESC)`,
      )

      // Create monthly partitions + default safety-net partition
      for (const spec of specsMap.values()) {
        await db.query(`
          CREATE TABLE ${s}.${quoteSqlIdent(spec.partitionName)}
          PARTITION OF ${s}."audit_logs"
          FOR VALUES FROM ('${spec.fromIso}') TO ('${spec.toIso}')
        `)
        ensuredPartitions.push(spec.partitionName)
      }
      await db.query(`
        CREATE TABLE ${s}."audit_logs_default"
        PARTITION OF ${s}."audit_logs" DEFAULT
      `)
      ensuredPartitions.push('audit_logs_default')

      // Copy 100% of existing audit rows into partitioned `audit_logs`
      const insertRes = await db.query(`
        INSERT INTO ${s}."audit_logs"
        SELECT * FROM ${s}."audit_logs__legacy_heap"
      `)
      copiedRowsCount = insertRes.rowCount ?? 0

      // Transfer `audit_logs_id_seq` ownership BEFORE dropping `audit_logs__legacy_heap`
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
            '${schemaName}.audit_logs_id_seq',
            GREATEST(COALESCE((SELECT MAX("id") FROM ${s}."audit_logs"), 0), 1),
            EXISTS (SELECT 1 FROM ${s}."audit_logs")
          )
        `)
      }

      await db.query(`DROP TABLE ${s}."audit_logs__legacy_heap"`)
      await db.query('COMMIT')
      convertedFromHeap = true
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {})
      throw err
    }
  } else if (relkind === 'p') {
    // Already partitioned: idempotently ensure upcoming monthly partitions + `audit_logs_default`
    const existingChildrenRes = await db.query(
      `SELECT child.relname AS part_name
       FROM pg_inherits inh
       INNER JOIN pg_class parent ON parent.oid = inh.inhparent
       INNER JOIN pg_class child ON child.oid = inh.inhrelid
       INNER JOIN pg_namespace n ON n.oid = parent.relnamespace
       WHERE n.nspname = $1
         AND parent.relname = 'audit_logs'`,
      [schemaName],
    )
    const existingPartitions = new Set(
      (existingChildrenRes.rows ?? []).map((r) => String((r as { part_name: string }).part_name)),
    )

    for (const spec of computeUpcomingAuditPartitionSpecs(now, monthsAhead, 1)) {
      if (existingPartitions.has(spec.partitionName)) continue

      // If `audit_logs_default` already holds rows inside `[fromIso, toIso)`, temporarily stage them
      // so PostgreSQL allows attaching the new non-overlapping monthly range partition.
      let stagedRows = false
      if (existingPartitions.has('audit_logs_default')) {
        const conflictCheck = await db.query(
          `SELECT EXISTS (
             SELECT 1 FROM ${s}."audit_logs_default"
             WHERE "created_at" >= $1::timestamptz AND "created_at" < $2::timestamptz
           ) AS has_rows`,
          [spec.fromIso, spec.toIso],
        )
        stagedRows = Boolean((conflictCheck.rows?.[0] as { has_rows?: boolean } | undefined)?.has_rows)
      }

      if (stagedRows) {
        await db.query('BEGIN')
        try {
          await db.query(`
            CREATE TEMP TABLE "_audit_logs_stage" ON COMMIT DROP AS
            SELECT * FROM ${s}."audit_logs_default"
            WHERE "created_at" >= '${spec.fromIso}'::timestamptz
              AND "created_at" < '${spec.toIso}'::timestamptz
          `)
          await db.query(`
            DELETE FROM ${s}."audit_logs_default"
            WHERE "created_at" >= '${spec.fromIso}'::timestamptz
              AND "created_at" < '${spec.toIso}'::timestamptz
          `)
          await db.query(`
            CREATE TABLE IF NOT EXISTS ${s}.${quoteSqlIdent(spec.partitionName)}
            PARTITION OF ${s}."audit_logs"
            FOR VALUES FROM ('${spec.fromIso}') TO ('${spec.toIso}')
          `)
          await db.query(`INSERT INTO ${s}."audit_logs" SELECT * FROM "_audit_logs_stage"`)
          await db.query('COMMIT')
        } catch (err) {
          await db.query('ROLLBACK').catch(() => {})
          throw err
        }
      } else {
        await db.query(`
          CREATE TABLE IF NOT EXISTS ${s}.${quoteSqlIdent(spec.partitionName)}
          PARTITION OF ${s}."audit_logs"
          FOR VALUES FROM ('${spec.fromIso}') TO ('${spec.toIso}')
        `)
      }

      existingPartitions.add(spec.partitionName)
      ensuredPartitions.push(spec.partitionName)
    }

    if (!existingPartitions.has('audit_logs_default')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ${s}."audit_logs_default"
        PARTITION OF ${s}."audit_logs" DEFAULT
      `)
      ensuredPartitions.push('audit_logs_default')
    }
  }

  // Optional instantaneous O(1) retention pruning of expired monthly partitions (zero VACUUM bloat)
  const droppedExpiredPartitions: string[] = []
  if (typeof options.retentionMonths === 'number' && options.retentionMonths > 0) {
    const cutoffMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - options.retentionMonths, 1),
    )
    const cutoffYear = cutoffMonthDate.getUTCFullYear()
    const cutoffMonth = cutoffMonthDate.getUTCMonth() + 1

    const childrenRes = await db.query(
      `SELECT child.relname AS part_name
       FROM pg_inherits inh
       INNER JOIN pg_class parent ON parent.oid = inh.inhparent
       INNER JOIN pg_class child ON child.oid = inh.inhrelid
       INNER JOIN pg_namespace n ON n.oid = parent.relnamespace
       WHERE n.nspname = $1
         AND parent.relname = 'audit_logs'`,
      [schemaName],
    )

    for (const row of childrenRes.rows ?? []) {
      const partName = String((row as { part_name: string }).part_name)
      const parsed = parsePartitionYearMonth(partName)
      if (!parsed) continue

      // Partition `audit_logs_yYYYYmMM` covers `[YYYY-MM-01, nextMonth-01)`. It is strictly older
      // than `cutoffMonthDate` when its `(year, month)` is strictly before `(cutoffYear, cutoffMonth)`.
      const isExpired =
        parsed.year < cutoffYear || (parsed.year === cutoffYear && parsed.month < cutoffMonth)
      if (isExpired) {
        await db.query(`DROP TABLE IF EXISTS ${s}.${quoteSqlIdent(partName)}`)
        droppedExpiredPartitions.push(partName)
      }
    }
  }

  return {
    auditLogsExists: true,
    convertedFromHeap,
    copiedRowsCount,
    ensuredPartitions,
    droppedExpiredPartitions,
  }
}

/**
 * Applies all Phase 2 (`R-10`) and Phase 3 (`R-13`) PostgreSQL structural & data-tiering migrations
 * idempotently. Safe to run repeatedly on both existing Neon databases and fresh CI schemas.
 */
export async function applyPhase2And3DatabaseOptimizations(
  db: QueryClientLike,
  options: {
    schemaName?: string
    now?: Date
    monthsAhead?: number
    auditRetentionMonths?: number
  } = {},
): Promise<Phase2And3OptimizationSummary> {
  const schemaName = options.schemaName ?? 'public'

  const formsBlocks = await migrateFormsBlocksToJsonb(db, { schemaName })
  const mailBodies = await migrateMailMessageBodiesSidecar(db, { schemaName })
  const auditPartitions = await partitionAuditLogsByMonth(db, {
    schemaName,
    now: options.now,
    monthsAhead: options.monthsAhead ?? 3,
    retentionMonths: options.auditRetentionMonths,
  })

  return {
    formsBlocks,
    mailBodies,
    auditPartitions,
  }
}
