import type { Endpoint, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import { recordAudit } from '@/audit/record'
import { buildJsonBackup, buildSqlBackup } from '@/database/backup'
import { DatabaseToolsError, withDatabase } from '@/database/connection'
import { validateTableSelection } from '@/database/selection'
import { inspectRestore, MAX_RESTORE_BYTES, RestoreRefused, restoreSql } from '@/database/restore'
import { isMaintenanceAction, runMaintenance } from '@/database/maintenance'
import { applyRepair, type RepairCheckId } from '@/database/repair'

/**
 * The database tools' endpoints. Payload mounts them under `/api`:
 *
 *   GET  /api/database/backup            `?format=sql|json&tables=a,b&schemaOnly=1`
 *                                        Downloads a backup. Read-only, so it is a plain link: the
 *                                        browser sends the admin's session cookie with it.
 *   POST /api/database/maintenance       `{ action: analyze|vacuum|vacuum-analyze|reindex, table? }`
 *   POST /api/database/repair            `{ check: sequences|orphans|indexes|statistics }`
 *   POST /api/database/restore-inspect   `{ sql }` — what a restore file would do, without running it.
 *   POST /api/database/restore           `{ sql, confirmation }` — runs it, and only into a database
 *                                        the admin has explicitly confirmed.
 *
 * Every one of them needs the `manageDatabase` capability; none of them ever returns a stack trace,
 * a connection string or a query — the message is the database's own explanation, short enough to
 * read. Restores and maintenance are written to the audit log with the account that ran them.
 */

const json = (data: unknown, status = 200) => Response.json(data, { status })

/** A message an admin can act on: the error's first line, capped, never a stack or a query. */
const readable = (error: unknown): { error: string; hint?: string } => {
  const message =
    error instanceof Error ? String(error.message).split('\n')[0]?.trim() : 'The operation failed.'
  if (error instanceof DatabaseToolsError) {
    return { error: message, ...(error.hint ? { hint: error.hint } : {}) }
  }
  const first = message || 'The operation failed.'
  return { error: first.length > 400 ? `${first.slice(0, 400)}…` : first }
}

const denied = () => json({ error: 'Needs the Database tools permission.' }, 403)

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const data = await req.json?.()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const audit = async (
  req: PayloadRequest,
  summary: string,
  changes?: { field: string; to?: unknown }[],
) => {
  await recordAudit(
    req.payload,
    {
      action: 'update',
      summary,
      entity: 'database',
      entityLabel: 'Database',
      entityKind: 'global',
      changes,
    },
    req,
  )
}

export const databaseBackupEndpoint: Endpoint = {
  path: '/database/backup',
  method: 'get',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase')) return denied()

    const format = req.searchParams.get('format') === 'json' ? 'json' : 'sql'
    const schemaOnly = req.searchParams.get('schemaOnly') === '1'
    const selection = validateTableSelection(req.searchParams.get('tables'))
    if (!selection.ok) return json({ error: selection.error }, 400)

    try {
      const result = await withDatabase(async (client) => {
        if (format === 'json') {
          const backup = await buildJsonBackup(client, { tables: selection.tables })
          return {
            contents: backup.json,
            filename: backup.filename,
            tables: selection.tables?.length,
          }
        }
        const backup = await buildSqlBackup(client, {
          tables: selection.tables,
          includeData: !schemaOnly,
        })
        return { contents: backup.sql, filename: backup.filename, tables: backup.tables.length }
      })

      req.payload.logger.info({
        msg: `Database backup downloaded (${format})`,
        user: req.user?.email,
        tables: result.tables,
      })

      return new Response(result.contents, {
        status: 200,
        headers: {
          'Content-Type': format === 'json' ? 'application/json' : 'application/sql; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      req.payload.logger.error({ msg: 'Database backup failed', err: error })
      return json(readable(error), 500)
    }
  },
}

export const databaseMaintenanceEndpoint: Endpoint = {
  path: '/database/maintenance',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase')) return denied()
    const data = await body(req)
    const action = data.action
    if (!isMaintenanceAction(action)) {
      return json({ error: 'Choose analyze, vacuum, vacuum-analyze or reindex.' }, 400)
    }
    const table = typeof data.table === 'string' && data.table.length > 0 ? data.table : null

    try {
      const result = await withDatabase((client) => runMaintenance(client, action, table))
      req.payload.logger.info({
        msg: `Database maintenance: ${action}`,
        user: req.user?.email,
        table: result.table,
        durationMs: result.durationMs,
      })
      const label = {
        analyze: 'ANALYZE',
        vacuum: 'VACUUM',
        'vacuum-analyze': 'VACUUM ANALYZE',
        reindex: 'REINDEX',
      }[action]
      await audit(req, `Ran ${label}${result.table ? ` on ${result.table}` : ' on the database'}`, [
        { field: 'statements', to: result.statements },
      ])
      return json({ ...result, ok: true })
    } catch (error) {
      req.payload.logger.error({ msg: `Database maintenance failed: ${action}`, err: error })
      return json(readable(error), 500)
    }
  },
}

const REPAIR_CHECKS: RepairCheckId[] = ['sequences', 'orphans', 'indexes', 'statistics']

export const databaseRepairEndpoint: Endpoint = {
  path: '/database/repair',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase')) return denied()
    const data = await body(req)
    const check = data.check
    const all = data.check === 'all'
    if (!all && !REPAIR_CHECKS.includes(check as RepairCheckId)) {
      return json({ error: `Choose one of: ${REPAIR_CHECKS.join(', ')}.` }, 400)
    }

    try {
      const results = await withDatabase(async (client) => {
        const order = all ? REPAIR_CHECKS : [check as RepairCheckId]
        const output = []
        for (const id of order) {
          output.push(await applyRepair(client, id))
        }
        return output
      })
      const fixed = results.reduce((sum, result) => sum + result.fixed, 0)
      await audit(
        req,
        `Database repair: ${(all ? REPAIR_CHECKS : [check]).join(', ')} (${fixed} fixed)`,
        [{ field: 'statements', to: results.flatMap((result) => result.statements) }],
      )
      return json({ ok: true, fixed, results })
    } catch (error) {
      req.payload.logger.error({ msg: 'Database repair failed', err: error })
      return json(readable(error), 500)
    }
  },
}

export const databaseRestoreInspectEndpoint: Endpoint = {
  path: '/database/restore-inspect',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase')) return denied()
    const data = await body(req)
    const sql = typeof data.sql === 'string' ? data.sql : ''
    if (!sql.trim()) return json({ error: 'Choose a .sql file first.' }, 400)
    if (Buffer.byteLength(sql, 'utf8') > MAX_RESTORE_BYTES) {
      return json(
        { error: `The file is larger than ${Math.round(MAX_RESTORE_BYTES / 1024 / 1024)} MB.` },
        413,
      )
    }

    try {
      const inspection = await withDatabase((client) => inspectRestore(client, sql))
      return json({ ok: true, inspection })
    } catch (error) {
      req.payload.logger.error({ msg: 'Restore inspection failed', err: error })
      return json(readable(error), 500)
    }
  },
}

export const databaseRestoreEndpoint: Endpoint = {
  path: '/database/restore',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageDatabase')) return denied()
    const data = await body(req)
    const sql = typeof data.sql === 'string' ? data.sql : ''
    const confirmation =
      typeof data.confirmation === 'string' ? data.confirmation.trim().toLowerCase() : ''
    const force = data.force === true && confirmation === 'restore'

    if (!sql.trim()) return json({ error: 'Choose a .sql file first.' }, 400)
    if (Buffer.byteLength(sql, 'utf8') > MAX_RESTORE_BYTES) {
      return json(
        { error: `The file is larger than ${Math.round(MAX_RESTORE_BYTES / 1024 / 1024)} MB.` },
        413,
      )
    }
    if (data.force === true && confirmation !== 'restore') {
      return json(
        { error: 'Type “restore” in the confirmation box to overwrite existing content.' },
        400,
      )
    }

    try {
      const result = await withDatabase((client) => restoreSql(client, sql, { force }))
      req.payload.logger.warn({
        msg: 'Database restored from a .sql file',
        user: req.user?.email,
        durationMs: result.durationMs,
      })
      await audit(req, `Restored the database from a .sql file (${result.tables} tables)`, [
        { field: 'rows afterwards', to: result.after },
      ])
      return json({ ...result, ok: true })
    } catch (error) {
      if (error instanceof RestoreRefused) {
        // Refused before running anything: the admin can fix it (confirm, or choose another file).
        return json({ error: error.message }, error.status)
      }
      req.payload.logger.error({ msg: 'Database restore failed', err: error })
      return json(readable(error), 500)
    }
  },
}
