import type { Payload } from 'payload'

import { ensureOrderable } from '@/access/orderable'

import type { RepairActionKind, RepairOperationResult } from '../shared'

import {
  createPayloadSqlExecutor,
  quoteIdent,
  withDirectPostgresClient,
  type DirectClientRunner,
  type SqlExecutor,
} from './connection'
import { inspectSequences } from './monitor'

async function listPublicBaseTables(executor: SqlExecutor): Promise<string[]> {
  const res = await executor.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC
  `)
  return res.rows.map((r) => r.table_name)
}

/**
 * Executes a Tier-1 PostgreSQL repair or maintenance action (`sync-sequences`, `analyze-all`,
 * `vacuum-analyze`, `reindex-public`, `clear-stale-locks`, `repair-order-ranks`).
 */
export async function runDatabaseRepairAction(
  payload: Payload,
  action: RepairActionKind,
  options: {
    env?: NodeJS.ProcessEnv
    executor?: SqlExecutor | null
    directRunner?: DirectClientRunner
    tableName?: string
    forceAllLocks?: boolean
  } = {},
): Promise<RepairOperationResult> {
  const startedAt = Date.now()
  const env = options.env ?? process.env
  const directRunner = options.directRunner ?? withDirectPostgresClient

  if (action === 'repair-order-ranks') {
    await ensureOrderable(payload)
    return {
      action,
      ok: true,
      usedUnpooledConnection: false,
      durationMs: Date.now() - startedAt,
      summary: 'Verified and backfilled fractional _order ranks across all orderable collections.',
      details: {
        orderableCollections: payload.config.collections
          .filter((c) => Boolean((c as { orderable?: boolean }).orderable))
          .map((c) => c.slug),
      },
    }
  }

  // Maintenance commands that cannot run inside PgBouncer transaction blocks (`VACUUM`, `REINDEX`)
  // always use the direct runner (preferring `POSTGRES_URL_NON_POOLING`).
  if (action === 'vacuum-analyze' || action === 'reindex-public') {
    return directRunner(
      async (executor, { usedUnpooledConnection }) => {
        const publicTables = await listPublicBaseTables(executor)
        const targets = options.tableName
          ? publicTables.filter((t) => t === options.tableName)
          : publicTables

        if (options.tableName && targets.length === 0) {
          throw new Error(`Table "${options.tableName}" does not exist in schema public.`)
        }

        if (action === 'vacuum-analyze') {
          for (const tbl of targets) {
            // VACUUM must run outside a transaction block as an individual top-level query.
            await executor.query(`VACUUM (ANALYZE) public.${quoteIdent(tbl)}`)
          }
          return {
            action,
            ok: true,
            usedUnpooledConnection,
            durationMs: Date.now() - startedAt,
            summary: `Executed VACUUM (ANALYZE) across ${targets.length} public table(s).`,
            details: {
              tablesProcessed: targets.length,
              targetTable: options.tableName ?? 'all',
            },
          }
        }

        for (const tbl of targets) {
          await executor.query(`REINDEX TABLE public.${quoteIdent(tbl)}`)
        }
        return {
          action,
          ok: true,
          usedUnpooledConnection,
          durationMs: Date.now() - startedAt,
          summary: `Rebuilt indexes across ${targets.length} public table(s).`,
          details: {
            tablesProcessed: targets.length,
            targetTable: options.tableName ?? 'all',
          },
        }
      },
      { env, preferUnpooled: true, statementTimeoutMs: 120_000 },
    )
  }

  const executor =
    options.executor !== undefined ? options.executor : createPayloadSqlExecutor(payload, env)
  if (!executor) {
    throw new Error('POSTGRES_URL is not configured.')
  }

  if (action === 'sync-sequences') {
    const sequences = await inspectSequences(executor)
    const fixed: Array<{ table: string; sequence: string; previous: number; next: number }> = []
    for (const seq of sequences) {
      const nextVal = Math.max(seq.maxId, 1)
      const isCalled = seq.maxId > 0
      if (!seq.inSync) {
        await executor.query(`SELECT setval($1, $2::bigint, $3)`, [
          `public.${quoteIdent(seq.sequenceName)}`,
          nextVal,
          isCalled,
        ])
        fixed.push({
          table: seq.tableName,
          sequence: seq.sequenceName,
          previous: seq.lastValue,
          next: nextVal,
        })
      }
    }
    return {
      action,
      ok: true,
      usedUnpooledConnection: false,
      durationMs: Date.now() - startedAt,
      summary:
        fixed.length > 0
          ? `Resynchronized ${fixed.length} out-of-sync sequence(s) across ${sequences.length} inspected table(s).`
          : `All ${sequences.length} primary-key sequence(s) are already in sync with MAX(id).`,
      details: {
        inspected: sequences.length,
        fixedCount: fixed.length,
        fixed,
      },
    }
  }

  if (action === 'analyze-all') {
    if (options.tableName) {
      await executor.query(`ANALYZE public.${quoteIdent(options.tableName)}`)
    } else {
      await executor.query('ANALYZE')
    }
    return {
      action,
      ok: true,
      usedUnpooledConnection: false,
      durationMs: Date.now() - startedAt,
      summary: options.tableName
        ? `Refreshed PostgreSQL planner statistics for "${options.tableName}".`
        : 'Refreshed PostgreSQL query planner statistics across the database.',
      details: { targetTable: options.tableName ?? 'all' },
    }
  }

  if (action === 'clear-stale-locks') {
    const tables = await listPublicBaseTables(executor)
    if (!tables.includes('payload_locked_documents')) {
      return {
        action,
        ok: true,
        usedUnpooledConnection: false,
        durationMs: Date.now() - startedAt,
        summary: 'No payload_locked_documents table present; 0 locks cleared.',
        details: { cleared: 0 },
      }
    }

    const delRes = options.forceAllLocks
      ? await executor.query<{ id: number | string }>(
          `DELETE FROM public."payload_locked_documents" RETURNING id`,
        )
      : await executor.query<{ id: number | string }>(
          `DELETE FROM public."payload_locked_documents" WHERE updated_at < NOW() - INTERVAL '2 hours' RETURNING id`,
        )
    const cleared = delRes.rows.length
    return {
      action,
      ok: true,
      usedUnpooledConnection: false,
      durationMs: Date.now() - startedAt,
      summary: `Cleared ${cleared} ${options.forceAllLocks ? '' : 'stale '}document lock(s).`,
      details: { cleared, forceAllLocks: Boolean(options.forceAllLocks) },
    }
  }

  throw new Error(`Unsupported repair action: "${String(action)}"`)
}
