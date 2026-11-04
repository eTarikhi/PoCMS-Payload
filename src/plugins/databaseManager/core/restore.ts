import { revalidatePath, revalidateTag } from 'next/cache'
import type { Payload } from 'payload'

import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

import {
  inferBackupFormatFromFilename,
  NDJSON_BACKUP_FORMAT,
  topologicalSortTables,
  type BackupColumnMeta,
  type BackupExportFormat,
  type BackupTableDump,
  type CsvRestoreStrategy,
  type LogicalBackupArchive,
  type RestoreDryRunReport,
  type RestoreExecutionResult,
} from '../shared'

import {
  quoteIdent,
  withDirectPostgresClient,
  type DirectClientRunner,
  type SqlExecutor,
} from './connection'
import {
  resolveBackupEncryptionSecret,
  unpackBackupDocument,
  unpackLogicalBackup,
} from './crypto'
import {
  analyzeSqlRestoreStatements,
  coerceCsvCellValue,
  parseCsvRecords,
  parseNdjsonToArchive,
} from './formats'
import { inspectSequences } from './monitor'

const RESTORE_ADVISORY_LOCK_KEY = 80421901

function prepareColumnValue(
  rawValue: unknown,
  colMeta: { dataType: string; udtName: string } | undefined,
): unknown {
  if (rawValue === null || rawValue === undefined) return null
  if (!colMeta) return rawValue

  const udt = colMeta.udtName.toLowerCase()
  const dt = colMeta.dataType.toLowerCase()

  if (udt === 'bytea') {
    if (
      typeof rawValue === 'object' &&
      rawValue !== null &&
      typeof (rawValue as { __byteaBase64?: unknown }).__byteaBase64 === 'string'
    ) {
      return Buffer.from((rawValue as { __byteaBase64: string }).__byteaBase64, 'base64')
    }
    return rawValue
  }

  if (udt === 'json' || udt === 'jsonb' || dt === 'json' || dt === 'jsonb') {
    return typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue)
  }

  return rawValue
}

function orderSelfReferencingRows(table: BackupTableDump): Array<Record<string, unknown>> {
  const selfFkCols = table.foreignKeys
    .filter((fk) => fk.refTable === table.name)
    .map((fk) => fk.column)

  if (selfFkCols.length === 0 || table.rows.length <= 1) {
    return table.rows
  }

  const pkCol = table.primaryKey[0] ?? 'id'
  const remaining = [...table.rows]
  const insertedIds = new Set<unknown>()
  const result: Array<Record<string, unknown>> = []

  let progress = true
  while (remaining.length > 0 && progress) {
    progress = false
    for (let i = 0; i < remaining.length; ) {
      const row = remaining[i]!
      const ready = selfFkCols.every((col) => {
        const refVal = row[col]
        return refVal === null || refVal === undefined || insertedIds.has(refVal)
      })
      if (ready) {
        result.push(row)
        insertedIds.add(row[pkCol])
        remaining.splice(i, 1)
        progress = true
      } else {
        i += 1
      }
    }
  }

  return [...result, ...remaining]
}

async function fetchTargetSchemaMap(
  executor: SqlExecutor,
): Promise<Map<string, Map<string, BackupColumnMeta>>> {
  const colsRes = await executor.query<{
    table_name: string
    column_name: string
    data_type: string
    udt_name: string
    is_nullable: string
  }>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name ASC, c.ordinal_position ASC
  `)

  const map = new Map<string, Map<string, BackupColumnMeta>>()
  for (const r of colsRes.rows) {
    let tableMap = map.get(r.table_name)
    if (!tableMap) {
      tableMap = new Map()
      map.set(r.table_name, tableMap)
    }
    tableMap.set(r.column_name, {
      name: r.column_name,
      dataType: r.data_type,
      udtName: r.udt_name,
      isNullable: r.is_nullable === 'YES',
    })
  }
  return map
}

async function fetchPrimaryKeyColumns(
  executor: SqlExecutor,
  tableName: string,
): Promise<string[]> {
  const pkRes = await executor.query<{ column_name: string }>(
    `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position ASC
    `,
    [tableName],
  )
  return pkRes.rows.map((r) => r.column_name)
}

/**
 * Validates any backup payload (`json`, `ndjson`, `sql`, `csv` — plain, gzipped, or AES-256-GCM encrypted)
 * against the live target PostgreSQL schema without modifying any rows.
 */
export async function dryRunLogicalRestore(
  executor: SqlExecutor,
  rawBackupBytes: Buffer | Uint8Array | string,
  options: {
    env?: NodeJS.ProcessEnv
    filename?: string
    formatHint?: BackupExportFormat | null
    csvTable?: string | null
    csvStrategy?: CsvRestoreStrategy
  } = {},
): Promise<RestoreDryRunReport> {
  const env = options.env ?? process.env
  const secret = resolveBackupEncryptionSecret(env)
  const hint =
    options.formatHint ??
    (options.filename ? inferBackupFormatFromFilename(options.filename) : null)

  const unpacked = unpackBackupDocument(rawBackupBytes, {
    encryptionSecret: secret,
    formatHint: hint,
  })
  const targetSchema = await fetchTargetSchemaMap(executor)

  // Branch A: SQL Script Restore Dry-Run
  if (unpacked.detectedFormat === 'sql') {
    const analysis = analyzeSqlRestoreStatements(unpacked.text)
    const matchedTables = analysis.referencedTables.filter((t) => targetSchema.has(t))
    const missingTargetTables = analysis.referencedTables.filter((t) => !targetSchema.has(t))
    const columnWarnings = [...analysis.warnings]
    if (missingTargetTables.length > 0 && analysis.ddlCount === 0) {
      columnWarnings.push(
        `SQL script references ${missingTargetTables.length} table(s) not currently in schema public (${missingTargetTables.join(', ')}) and contains no CREATE TABLE statements.`,
      )
    }

    return {
      valid: analysis.executableStatements.length > 0,
      format: 'postgresql-sql-script',
      detectedFormat: 'sql',
      createdAt: new Date().toISOString(),
      encrypted: unpacked.encrypted,
      redactedSecrets: false,
      checksumVerified: true,
      totalTables: analysis.referencedTables.length,
      totalRows: analysis.insertCount,
      sqlStatementCount: analysis.executableStatements.length,
      matchedTables,
      missingTargetTables,
      columnWarnings,
      migrationWarnings: [],
      insertOrder: analysis.referencedTables,
      cyclicTables: [],
      tableSummaries: analysis.referencedTables.map((name) => ({
        name,
        backupRows: 0,
        targetExists: targetSchema.has(name),
        missingColumns: [],
      })),
    }
  }

  // Branch B: CSV Table Restore Dry-Run
  if (unpacked.detectedFormat === 'csv') {
    const csvTable = options.csvTable?.trim() || ''
    const csvStrategy: CsvRestoreStrategy = options.csvStrategy ?? 'upsert'
    if (!csvTable) {
      throw new Error('Select a target PostgreSQL table when restoring a CSV file.')
    }
    const targetCols = targetSchema.get(csvTable)
    if (!targetCols) {
      throw new Error(`Target table "${csvTable}" does not exist in schema public.`)
    }

    const parsed = parseCsvRecords(unpacked.text)
    if (parsed.headers.length === 0) {
      throw new Error('CSV file has no column headers.')
    }

    const missingColumns = parsed.headers.filter((h) => !targetCols.has(h))
    const matchedCols = parsed.headers.filter((h) => targetCols.has(h))
    const columnWarnings: string[] = []
    if (missingColumns.length > 0) {
      columnWarnings.push(
        `CSV contains ${missingColumns.length} column(s) absent on "${csvTable}" (${missingColumns.join(', ')}) — they will be ignored.`,
      )
    }

    return {
      valid: matchedCols.length > 0,
      format: 'rfc4180-csv',
      detectedFormat: 'csv',
      createdAt: new Date().toISOString(),
      encrypted: unpacked.encrypted,
      redactedSecrets: false,
      checksumVerified: true,
      totalTables: 1,
      totalRows: parsed.rows.length,
      csvTargetTable: csvTable,
      csvStrategy,
      matchedTables: [csvTable],
      missingTargetTables: [],
      columnWarnings,
      migrationWarnings: [],
      insertOrder: [csvTable],
      cyclicTables: [],
      tableSummaries: [
        {
          name: csvTable,
          backupRows: parsed.rows.length,
          targetExists: true,
          missingColumns,
        },
      ],
    }
  }

  // Branch C: Structured JSON (`pocms-pg-logical-v1`) or Streaming NDJSON (`pocms-pg-ndjson-v1`)
  let archive: LogicalBackupArchive
  let checksumVerified = true
  let formatLabel = ''

  if (unpacked.detectedFormat === 'ndjson') {
    archive = parseNdjsonToArchive(unpacked.text)
    formatLabel = NDJSON_BACKUP_FORMAT
  } else {
    const verified = unpackLogicalBackup(rawBackupBytes, { encryptionSecret: secret })
    archive = verified.archive
    checksumVerified = verified.checksumVerified
    formatLabel = archive.format
  }

  const matchedTables: string[] = []
  const missingTargetTables: string[] = []
  const columnWarnings: string[] = []
  const migrationWarnings: string[] = []

  if (archive.redactedSecrets) {
    migrationWarnings.push(
      'This backup has redacted user authentication secrets (password hashes & sessions were stripped). Restoring it requires explicit confirmation and password resets.',
    )
  }

  if (targetSchema.has('payload_migrations')) {
    try {
      const liveMigsRes = await executor.query<{ name: string }>(
        `SELECT name FROM public."payload_migrations" ORDER BY created_at ASC`,
      )
      const liveNames = new Set(liveMigsRes.rows.map((r) => r.name))
      const backupNames = new Set((archive.migrations ?? []).map((m) => m.name))
      const missingInTarget = [...backupNames].filter((n) => !liveNames.has(n))
      const extraInTarget = [...liveNames].filter((n) => !backupNames.has(n))
      if (missingInTarget.length > 0) {
        migrationWarnings.push(
          `Backup includes ${missingInTarget.length} migration(s) not applied on target DB: ${missingInTarget.slice(0, 3).join(', ')}.`,
        )
      }
      if (extraInTarget.length > 0) {
        migrationWarnings.push(
          `Target DB has ${extraInTarget.length} newer migration(s) not present in backup: ${extraInTarget.slice(0, 3).join(', ')}.`,
        )
      }
    } catch {
      // Ignore if payload_migrations is empty/inaccessible.
    }
  }

  const tableSummaries: RestoreDryRunReport['tableSummaries'] = []
  let totalRows = 0

  for (const tbl of archive.tables) {
    totalRows += tbl.rowCount
    const targetCols = targetSchema.get(tbl.name)
    if (!targetCols) {
      missingTargetTables.push(tbl.name)
      tableSummaries.push({
        name: tbl.name,
        backupRows: tbl.rowCount,
        targetExists: false,
        missingColumns: [],
      })
      continue
    }

    matchedTables.push(tbl.name)
    const backupColNames =
      tbl.columns.length > 0
        ? tbl.columns.map((c) => c.name)
        : tbl.rows[0]
          ? Object.keys(tbl.rows[0])
          : []
    const missingColumns = backupColNames.filter((col) => !targetCols.has(col))
    if (missingColumns.length > 0) {
      columnWarnings.push(
        `Table "${tbl.name}": ${missingColumns.length} backup column(s) absent on target (${missingColumns.join(', ')}) — will be skipped.`,
      )
    }

    tableSummaries.push({
      name: tbl.name,
      backupRows: tbl.rowCount,
      targetExists: true,
      missingColumns,
    })
  }

  const matchedDumpTables = archive.tables.filter((t) => targetSchema.has(t.name))
  const { ordered: insertOrder, cyclicTables } = topologicalSortTables(matchedDumpTables)

  return {
    valid: checksumVerified && matchedTables.length > 0,
    format: formatLabel,
    detectedFormat: unpacked.detectedFormat,
    createdAt: archive.createdAt,
    encrypted: unpacked.encrypted,
    redactedSecrets: archive.redactedSecrets,
    checksumVerified,
    totalTables: archive.tables.length,
    totalRows,
    matchedTables,
    missingTargetTables,
    columnWarnings,
    migrationWarnings,
    insertOrder,
    cyclicTables,
    tableSummaries,
  }
}

/**
 * Executes an atomic, transactional PostgreSQL restore across `json`, `ndjson`, `sql`, and `csv` formats
 * without requiring PostgreSQL `SUPERUSER`. Any error rolls back the entire transaction cleanly.
 */
export async function executeLogicalRestore(
  _payload: Payload,
  rawBackupBytes: Buffer | Uint8Array | string,
  options: {
    env?: NodeJS.ProcessEnv
    directRunner?: DirectClientRunner
    filename?: string
    formatHint?: BackupExportFormat | null
    csvTable?: string | null
    csvStrategy?: CsvRestoreStrategy
    allowRedactedRestore?: boolean
    preserveAuditLogs?: boolean
    onBeforeRestoreSafetySnapshot?: () => Promise<{ id: string; name: string } | null>
  } = {},
): Promise<RestoreExecutionResult> {
  const startedAt = Date.now()
  const env = options.env ?? process.env
  const directRunner = options.directRunner ?? withDirectPostgresClient
  const preserveAuditLogs = options.preserveAuditLogs ?? true

  const secret = resolveBackupEncryptionSecret(env)
  const hint =
    options.formatHint ??
    (options.filename ? inferBackupFormatFromFilename(options.filename) : null)

  const unpacked = unpackBackupDocument(rawBackupBytes, {
    encryptionSecret: secret,
    formatHint: hint,
  })

  let preParsedArchive: LogicalBackupArchive | null = null
  if (unpacked.detectedFormat === 'json') {
    preParsedArchive = unpackLogicalBackup(rawBackupBytes, { encryptionSecret: secret }).archive
  } else if (unpacked.detectedFormat === 'ndjson') {
    preParsedArchive = parseNdjsonToArchive(unpacked.text)
  }

  if (preParsedArchive?.redactedSecrets && !options.allowRedactedRestore) {
    throw new Error(
      'Refusing to restore a secret-redacted backup without allowRedactedRestore=true (doing so would erase user password hashes).',
    )
  }

  let safetySnapshotId: string | null = null
  let safetySnapshotName: string | null = null
  const warnings: string[] = []

  if (options.onBeforeRestoreSafetySnapshot) {
    try {
      const snap = await options.onBeforeRestoreSafetySnapshot()
      if (snap) {
        safetySnapshotId = snap.id
        safetySnapshotName = snap.name
      }
    } catch (error) {
      warnings.push(
        `Pre-restore cloud snapshot skipped: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const txResult = await directRunner(
    async (executor, { usedUnpooledConnection }) => {
      // ------------------------------------------------------------------
      // Mode 1: Atomic SQL Script Execution (`.sql`)
      // ------------------------------------------------------------------
      if (unpacked.detectedFormat === 'sql') {
        const analysis = analyzeSqlRestoreStatements(unpacked.text)
        warnings.push(...analysis.warnings)
        if (analysis.executableStatements.length === 0) {
          throw new Error('SQL script contains no executable statements.')
        }

        await executor.query('BEGIN')
        try {
          const lockRes = await executor.query<{ locked: boolean }>(
            `SELECT pg_try_advisory_xact_lock($1) AS locked`,
            [RESTORE_ADVISORY_LOCK_KEY],
          )
          if (lockRes.rows[0]?.locked === false) {
            throw new Error(
              'Another database restore or maintenance lock is currently active. Try again shortly.',
            )
          }

          let affectedRows = 0
          for (const stmt of analysis.executableStatements) {
            const res = await executor.query(stmt)
            if (typeof res.rowCount === 'number' && res.rowCount > 0) {
              affectedRows += res.rowCount
            }
          }

          const liveSeqs = await inspectSequences(executor)
          let syncedSequences = 0
          for (const seq of liveSeqs) {
            const nextVal = Math.max(seq.maxId, 1)
            const isCalled = seq.maxId > 0
            await executor.query(`SELECT setval($1, $2::bigint, $3)`, [
              `public.${quoteIdent(seq.sequenceName)}`,
              nextVal,
              isCalled,
            ])
            syncedSequences += 1
          }

          await executor.query('COMMIT')
          return {
            restoredTables: analysis.referencedTables.length,
            restoredRows: affectedRows,
            syncedSequences,
            usedUnpooledConnection,
          }
        } catch (txError) {
          await executor.query('ROLLBACK').catch(() => undefined)
          throw txError
        }
      }

      // ------------------------------------------------------------------
      // Mode 2: Atomic CSV Table Restore (`upsert` or `replace`)
      // ------------------------------------------------------------------
      if (unpacked.detectedFormat === 'csv') {
        const csvTable = options.csvTable?.trim() || ''
        const csvStrategy: CsvRestoreStrategy = options.csvStrategy ?? 'upsert'
        if (!csvTable) {
          throw new Error('Target table name (csvTable) is required when restoring CSV data.')
        }

        const targetSchema = await fetchTargetSchemaMap(executor)
        const targetCols = targetSchema.get(csvTable)
        if (!targetCols) {
          throw new Error(`Target table "${csvTable}" does not exist in schema public.`)
        }

        const parsed = parseCsvRecords(unpacked.text)
        const sharedColumns = parsed.headers.filter((h) => targetCols.has(h))
        if (sharedColumns.length === 0) {
          throw new Error(`No CSV columns match target table "${csvTable}".`)
        }

        const pkCols = await fetchPrimaryKeyColumns(executor, csvTable)

        await executor.query('BEGIN')
        try {
          const lockRes = await executor.query<{ locked: boolean }>(
            `SELECT pg_try_advisory_xact_lock($1) AS locked`,
            [RESTORE_ADVISORY_LOCK_KEY],
          )
          if (lockRes.rows[0]?.locked === false) {
            throw new Error(
              'Another database restore or maintenance lock is currently active. Try again shortly.',
            )
          }

          if (csvStrategy === 'replace') {
            await executor.query(
              `TRUNCATE TABLE public.${quoteIdent(csvTable)} RESTART IDENTITY CASCADE`,
            )
          }

          let restoredRows = 0
          if (parsed.rows.length > 0) {
            const colListSql = sharedColumns.map((c) => quoteIdent(c)).join(', ')
            const hasAllPk =
              csvStrategy === 'upsert' &&
              pkCols.length > 0 &&
              pkCols.every((pk) => sharedColumns.includes(pk))

            let conflictSql = ''
            if (hasAllPk) {
              const pkSql = pkCols.map((pk) => quoteIdent(pk)).join(', ')
              const nonPk = sharedColumns.filter((c) => !pkCols.includes(c))
              conflictSql =
                nonPk.length > 0
                  ? ` ON CONFLICT (${pkSql}) DO UPDATE SET ${nonPk.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ')}`
                  : ` ON CONFLICT (${pkSql}) DO NOTHING`
            }

            const batchSize = Math.max(
              1,
              Math.min(200, Math.floor(10_000 / sharedColumns.length)),
            )
            for (let offset = 0; offset < parsed.rows.length; offset += batchSize) {
              const chunk = parsed.rows.slice(offset, offset + batchSize)
              const params: unknown[] = []
              const tuples: string[] = []
              for (const row of chunk) {
                const placeholders: string[] = []
                for (const col of sharedColumns) {
                  const meta = targetCols.get(col)!
                  params.push(coerceCsvCellValue(row[col] ?? '', meta))
                  placeholders.push(`$${params.length}`)
                }
                tuples.push(`(${placeholders.join(', ')})`)
              }
              await executor.query(
                `INSERT INTO public.${quoteIdent(csvTable)} (${colListSql}) VALUES ${tuples.join(', ')}${conflictSql}`,
                params,
              )
              restoredRows += chunk.length
            }
          }

          const liveSeqs = await inspectSequences(executor)
          let syncedSequences = 0
          for (const seq of liveSeqs) {
            const nextVal = Math.max(seq.maxId, 1)
            const isCalled = seq.maxId > 0
            await executor.query(`SELECT setval($1, $2::bigint, $3)`, [
              `public.${quoteIdent(seq.sequenceName)}`,
              nextVal,
              isCalled,
            ])
            syncedSequences += 1
          }

          await executor.query('COMMIT')
          return {
            restoredTables: 1,
            restoredRows,
            syncedSequences,
            usedUnpooledConnection,
          }
        } catch (txError) {
          await executor.query('ROLLBACK').catch(() => undefined)
          throw txError
        }
      }

      // ------------------------------------------------------------------
      // Mode 3: Structured JSON (`pocms-pg-logical-v1`) & NDJSON (`pocms-pg-ndjson-v1`)
      // ------------------------------------------------------------------
      const archive = preParsedArchive!
      const targetSchema = await fetchTargetSchemaMap(executor)
      const dumpByName = new Map(archive.tables.map((t) => [t.name, t]))

      const restorableTables = archive.tables.filter((t) => {
        if (!targetSchema.has(t.name)) return false
        if (preserveAuditLogs && t.name === 'audit_logs') return false
        if (t.name === 'payload_migrations') return false
        return true
      })

      if (restorableTables.length === 0) {
        throw new Error('No matching restorable tables found between backup archive and database.')
      }

      const { ordered: insertOrder, cyclicTables } = topologicalSortTables(restorableTables)
      const cyclicSet = new Set(cyclicTables)

      await executor.query('BEGIN')
      try {
        const lockRes = await executor.query<{ locked: boolean }>(
          `SELECT pg_try_advisory_xact_lock($1) AS locked`,
          [RESTORE_ADVISORY_LOCK_KEY],
        )
        if (lockRes.rows[0]?.locked === false) {
          throw new Error(
            'Another database restore or maintenance lock is currently active. Try again shortly.',
          )
        }

        const truncateList = insertOrder.map((name) => `public.${quoteIdent(name)}`).join(', ')
        await executor.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`)

        let restoredRows = 0
        const deferredUpdates: Array<{
          tableName: string
          pkCol: string
          pkVal: unknown
          updates: Record<string, unknown>
          targetCols: Map<string, BackupColumnMeta>
        }> = []

        for (const tableName of insertOrder) {
          const tbl = dumpByName.get(tableName)
          const targetCols = targetSchema.get(tableName)
          if (!tbl || !targetCols || tbl.rows.length === 0) continue

          const orderedRows = orderSelfReferencingRows(tbl)
          const sampleKeys =
            tbl.columns.length > 0
              ? tbl.columns.map((c) => c.name)
              : Object.keys(orderedRows[0] ?? {})
          const sharedColumns = sampleKeys.filter((col) => targetCols.has(col))
          if (sharedColumns.length === 0) continue

          const cyclicDeferCols = cyclicSet.has(tableName)
            ? new Set(
                tbl.foreignKeys
                  .filter(
                    (fk) =>
                      fk.refTable !== tableName &&
                      cyclicSet.has(fk.refTable) &&
                      targetCols.get(fk.column)?.isNullable,
                  )
                  .map((fk) => fk.column),
              )
            : new Set<string>()

          const pkCol = tbl.primaryKey[0] ?? 'id'
          const batchSize = Math.max(1, Math.min(250, Math.floor(10_000 / sharedColumns.length)))
          const colListSql = sharedColumns.map((c) => quoteIdent(c)).join(', ')

          for (let offset = 0; offset < orderedRows.length; offset += batchSize) {
            const chunk = orderedRows.slice(offset, offset + batchSize)
            const params: unknown[] = []
            const valueTuples: string[] = []

            for (const row of chunk) {
              const placeholders: string[] = []
              const deferredRowPatch: Record<string, unknown> = {}

              for (const col of sharedColumns) {
                let rawVal = row[col]
                if (cyclicDeferCols.has(col) && rawVal !== null && rawVal !== undefined) {
                  deferredRowPatch[col] = rawVal
                  rawVal = null
                }
                params.push(prepareColumnValue(rawVal, targetCols.get(col)))
                placeholders.push(`$${params.length}`)
              }

              if (Object.keys(deferredRowPatch).length > 0 && row[pkCol] !== undefined) {
                deferredUpdates.push({
                  tableName,
                  pkCol,
                  pkVal: row[pkCol],
                  updates: deferredRowPatch,
                  targetCols,
                })
              }

              valueTuples.push(`(${placeholders.join(', ')})`)
            }

            await executor.query(
              `INSERT INTO public.${quoteIdent(tableName)} (${colListSql}) VALUES ${valueTuples.join(', ')}`,
              params,
            )
            restoredRows += chunk.length
          }
        }

        for (const patch of deferredUpdates) {
          const entries = Object.entries(patch.updates)
          const setClauses: string[] = []
          const params: unknown[] = []
          for (const [col, val] of entries) {
            params.push(prepareColumnValue(val, patch.targetCols.get(col)))
            setClauses.push(`${quoteIdent(col)} = $${params.length}`)
          }
          params.push(patch.pkVal)
          await executor.query(
            `UPDATE public.${quoteIdent(patch.tableName)} SET ${setClauses.join(', ')} WHERE ${quoteIdent(patch.pkCol)} = $${params.length}`,
            params,
          )
        }

        const liveSeqs = await inspectSequences(executor)
        let syncedSequences = 0
        for (const seq of liveSeqs) {
          const nextVal = Math.max(seq.maxId, 1)
          const isCalled = seq.maxId > 0
          await executor.query(
            `SELECT setval($1, $2::bigint, $3)`,
            [`public.${quoteIdent(seq.sequenceName)}`, nextVal, isCalled],
          )
          syncedSequences += 1
        }

        await executor.query('COMMIT')
        return {
          restoredTables: insertOrder.length,
          restoredRows,
          syncedSequences,
          usedUnpooledConnection,
        }
      } catch (txError) {
        await executor.query('ROLLBACK').catch(() => undefined)
        throw txError
      }
    },
    { env, preferUnpooled: true, statementTimeoutMs: 120_000 },
  )

  try {
    await directRunner(
      async (executor) => {
        await executor.query('ANALYZE')
      },
      { env, preferUnpooled: true },
    )
  } catch {
    // Non-fatal post-commit optimization.
  }

  try {
    revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 })
    revalidatePath('/', 'layout')
  } catch {
    // Safe outside Next.js request context.
  }

  return {
    ok: true,
    detectedFormat: unpacked.detectedFormat,
    restoredTables: txResult.restoredTables,
    restoredRows: txResult.restoredRows,
    syncedSequences: txResult.syncedSequences,
    usedUnpooledConnection: txResult.usedUnpooledConnection,
    safetySnapshotId,
    safetySnapshotName,
    durationMs: Date.now() - startedAt,
    warnings,
  }
}
