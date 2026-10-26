import { revalidatePath, revalidateTag } from 'next/cache'
import type { Payload } from 'payload'

import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

import {
  topologicalSortTables,
  type BackupColumnMeta,
  type BackupTableDump,
  type RestoreDryRunReport,
  type RestoreExecutionResult,
} from '../shared'

import {
  quoteIdent,
  withDirectPostgresClient,
  type DirectClientRunner,
  type SqlExecutor,
} from './connection'
import { resolveBackupEncryptionSecret, unpackLogicalBackup } from './crypto'
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
    // node-postgres formats JS Arrays as PG array literals `{...}` unless stringified for json/jsonb.
    return typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue)
  }

  return rawValue
}

/**
 * Orders rows within a self-referencing table (e.g. nested categories/pages with `parent_id`)
 * so root rows (`parent_id IS NULL`) insert before child rows.
 */
function orderSelfReferencingRows(
  table: BackupTableDump,
): Array<Record<string, unknown>> {
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

/**
 * Validates a backup archive (plain, gzipped, or AES-256-GCM encrypted) against the live
 * target PostgreSQL schema without modifying any rows.
 */
export async function dryRunLogicalRestore(
  executor: SqlExecutor,
  rawBackupBytes: Buffer | Uint8Array | string,
  options: {
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<RestoreDryRunReport> {
  const env = options.env ?? process.env
  const secret = resolveBackupEncryptionSecret(env)
  const { archive, encrypted, checksumVerified } = unpackLogicalBackup(rawBackupBytes, {
    encryptionSecret: secret,
  })

  const targetSchema = await fetchTargetSchemaMap(executor)
  const matchedTables: string[] = []
  const missingTargetTables: string[] = []
  const columnWarnings: string[] = []
  const migrationWarnings: string[] = []

  if (archive.redactedSecrets) {
    migrationWarnings.push(
      'This backup has redacted user authentication secrets (password hashes & sessions were stripped). Restoring it requires explicit confirmation and password resets.',
    )
  }

  // Compare migrations if target has payload_migrations
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
    format: archive.format,
    createdAt: archive.createdAt,
    encrypted,
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
 * Executes an atomic, FK-ordered transactional PostgreSQL restore without requiring SUPERUSER.
 * Any failure rolls back the entire `TRUNCATE` + `INSERT` + sequence sync cleanly.
 */
export async function executeLogicalRestore(
  _payload: Payload,
  rawBackupBytes: Buffer | Uint8Array | string,
  options: {
    env?: NodeJS.ProcessEnv
    directRunner?: DirectClientRunner
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
  const { archive } = unpackLogicalBackup(rawBackupBytes, { encryptionSecret: secret })

  if (archive.redactedSecrets && !options.allowRedactedRestore) {
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
      const targetSchema = await fetchTargetSchemaMap(executor)
      const dumpByName = new Map(archive.tables.map((t) => [t.name, t]))

      const restorableTables = archive.tables.filter((t) => {
        if (!targetSchema.has(t.name)) return false
        if (preserveAuditLogs && t.name === 'audit_logs') return false
        // Keep payload_migrations intact so Drizzle migration tracking matches current code schema.
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

        // PostgreSQL transactional TRUNCATE rolls back completely if anything below fails.
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

          // For cyclic tables, nullable FK columns pointing to other cyclic tables are nulled on first pass and updated after.
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

        // Second pass for cyclic nullable foreign keys
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

        // Resynchronize every sequence in the restored database
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

  // Best-effort planner statistics refresh & Next.js cache invalidation after commit
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
