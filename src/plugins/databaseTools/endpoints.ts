import type { Endpoint, PayloadRequest } from 'payload'

import { buildJsonBackup, buildSqlBackup, type BuildBackupOptions } from './server/backup'
import { DatabaseToolsError, withDatabase } from './server/connection'
import { isMaintenanceAction, runMaintenance } from './server/maintenance'
import { NeonClient, NeonError } from './server/neon'
import { applyRepair, type RepairCheckId } from './server/repair'
import { inspectRestore, RestoreRefused, restoreSql } from './server/restore'
import { validateTableSelection } from './server/selection'
import { neonOptions, type ResolvedDatabaseToolsOptions } from './options'

/**
 * The plugin's endpoints. Payload mounts them under `/api`:
 *
 *   GET  /api/database/backup            `?format=sql|json&tables=a,b&schemaOnly=1`
 *                                        Downloads a backup. Read-only, so it is a plain link: the
 *                                        browser sends the admin's session cookie with it.
 *   POST /api/database/maintenance       `{ action: analyze|vacuum|vacuum-analyze|reindex, table? }`
 *   POST /api/database/repair            `{ check: sequences|orphans|indexes|statistics|all }`
 *   POST /api/database/restore-inspect   `{ sql }` — what a restore file would do, without running it.
 *   POST /api/database/restore           `{ sql, confirmation }` — runs it, and only into a database
 *                                        the admin has explicitly confirmed.
 *   POST /api/database/neon/backup       `{ name, withEndpoint? }` → a branch pinned to now.
 *   POST /api/database/neon/restore      `{ timestamp, confirmation, preserveUnderName? }`
 *   POST /api/database/neon/delete       `{ branchId, confirmation }`
 *
 * The prefix is `options.apiBasePath` (default `/database`); the restore endpoints are absent when
 * `options.restore === false`, and the Neon ones when `options.neon === false`. Every response for
 * a refusal is JSON with one readable sentence — never a stack trace, a query or a connection string.
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

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const data = await req.json?.()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const REPAIR_CHECKS: RepairCheckId[] = ['sequences', 'orphans', 'indexes', 'statistics']

export const databaseToolsEndpoints = (options: ResolvedDatabaseToolsOptions): Endpoint[] => {
  const base = options.apiBasePath
  const denied = () => json({ error: 'You do not have access to the database tools.' }, 403)

  /** The one gate: falsy, a throw, or a rejected promise all mean "no". */
  const allowed = async (req: PayloadRequest): Promise<boolean> => {
    try {
      return Boolean(await options.access({ req }))
    } catch (error) {
      req.payload.logger.error({ msg: 'Database tools access check failed', err: error })
      return false
    }
  }

  const audit = async (
    req: PayloadRequest,
    summary: string,
    changes?: { field: string; to?: unknown }[],
  ) => {
    if (!options.audit) return
    try {
      await options.audit({ payload: req.payload, req, summary, changes })
    } catch (error) {
      // An audit failure must not turn a completed restore into an error response.
      req.payload.logger.error({ msg: 'Database tools audit failed', err: error, summary })
    }
  }

  const backupOptions = (): BuildBackupOptions => ({
    includeInternal: options.backup.includeInternal,
    maxRowsPerTable: options.backup.maxRowsPerTable,
    exclude: options.backup.excludeTables,
  })

  const restoreLimit = options.restore === false ? 0 : options.restore.maxBytes
  const tooLarge = () =>
    json(
      { error: `The file is larger than ${Math.round(restoreLimit / 1024 / 1024)} MB.` },
      413,
    )

  const endpoints: Endpoint[] = [
    {
      path: `${base}/backup`,
      method: 'get',
      handler: async (req) => {
        if (!(await allowed(req))) return denied()

        const format = req.searchParams.get('format') === 'json' ? 'json' : 'sql'
        const schemaOnly = req.searchParams.get('schemaOnly') === '1'
        const selection = validateTableSelection(req.searchParams.get('tables'))
        if (!selection.ok) return json({ error: selection.error }, 400)

        try {
          const result = await withDatabase(async (client) => {
            if (format === 'json') {
              const backup = await buildJsonBackup(client, {
                ...backupOptions(),
                tables: selection.tables,
              })
              return {
                contents: backup.json,
                filename: backup.filename,
                tables: selection.tables?.length,
              }
            }
            const backup = await buildSqlBackup(client, {
              ...backupOptions(),
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
              'Content-Type':
                format === 'json' ? 'application/json' : 'application/sql; charset=utf-8',
              'Content-Disposition': `attachment; filename="${result.filename}"`,
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          req.payload.logger.error({ msg: 'Database backup failed', err: error })
          return json(readable(error), 500)
        }
      },
    },
    {
      path: `${base}/maintenance`,
      method: 'post',
      handler: async (req) => {
        if (!(await allowed(req))) return denied()
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
          await audit(
            req,
            `Ran ${label}${result.table ? ` on ${result.table}` : ' on the database'}`,
            [{ field: 'statements', to: result.statements }],
          )
          return json({ ...result, ok: true })
        } catch (error) {
          req.payload.logger.error({ msg: `Database maintenance failed: ${action}`, err: error })
          return json(readable(error), 500)
        }
      },
    },
    {
      path: `${base}/repair`,
      method: 'post',
      handler: async (req) => {
        if (!(await allowed(req))) return denied()
        const data = await body(req)
        const check = data.check
        const all = data.check === 'all'
        if (!all && !REPAIR_CHECKS.includes(check as RepairCheckId)) {
          return json({ error: `Choose one of: ${REPAIR_CHECKS.join(', ')} or all.` }, 400)
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
            `${all ? 'Repaired everything fixable' : `Repaired ${String(check)}`} — ${fixed} change${fixed === 1 ? '' : 's'}`,
            [{ field: 'statements', to: results.flatMap((result) => result.statements) }],
          )
          return json({ ok: true, fixed, results })
        } catch (error) {
          req.payload.logger.error({ msg: 'Database repair failed', err: error })
          return json(readable(error), 500)
        }
      },
    },
  ]

  if (options.restore !== false) {
    endpoints.push(
      {
        path: `${base}/restore-inspect`,
        method: 'post',
        handler: async (req) => {
          if (!(await allowed(req))) return denied()
          const data = await body(req)
          const sql = typeof data.sql === 'string' ? data.sql : ''
          if (!sql.trim()) return json({ error: 'Choose a .sql file first.' }, 400)
          if (Buffer.byteLength(sql, 'utf8') > restoreLimit) return tooLarge()

          try {
            const inspection = await withDatabase((client) => inspectRestore(client, sql))
            return json({ ok: true, inspection })
          } catch (error) {
            req.payload.logger.error({ msg: 'Restore inspection failed', err: error })
            return json(readable(error), 500)
          }
        },
      },
      {
        path: `${base}/restore`,
        method: 'post',
        handler: async (req) => {
          if (!(await allowed(req))) return denied()
          const data = await body(req)
          const sql = typeof data.sql === 'string' ? data.sql : ''
          const confirmation =
            typeof data.confirmation === 'string' ? data.confirmation.trim().toLowerCase() : ''
          const force = data.force === true && confirmation === 'restore'

          if (!sql.trim()) return json({ error: 'Choose a .sql file first.' }, 400)
          if (Buffer.byteLength(sql, 'utf8') > restoreLimit) return tooLarge()
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
              // Refused before running anything: the admin can fix it (confirm, or another file).
              return json({ error: error.message }, error.status)
            }
            req.payload.logger.error({ msg: 'Database restore failed', err: error })
            return json(readable(error), 500)
          }
        },
      },
    )
  }

  if (options.neon !== false) endpoints.push(...neonEndpoints(options))
  return endpoints
}

const neonReadable = (error: unknown): { error: string; hint?: string } => {
  if (error instanceof NeonError) {
    return {
      error: error.message,
      hint:
        error.status === 401
          ? 'The Neon API key was rejected. Create a new key in the Neon console and update NEON_API_KEY.'
          : undefined,
    }
  }
  const message = error instanceof Error ? error.message : 'The Neon request failed.'
  return { error: message.split('\n')[0]?.slice(0, 400) || 'The Neon request failed.' }
}

/** A branch name Neon will accept: it allows any name, but keep the list readable. */
const branchName = (raw: unknown): string =>
  String(raw ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 60)

const neonEndpoints = (options: ResolvedDatabaseToolsOptions): Endpoint[] => {
  const base = options.apiBasePath
  const neon = neonOptions(options)
  const available = () => Boolean(neon.apiKey ?? process.env.NEON_API_KEY)
  const client = () => new NeonClient(neon)
  const unavailable = () =>
    json(
      {
        error: 'NEON_API_KEY is not set, so branch operations are unavailable.',
        hint: 'Create a key in the Neon console (Account settings → API keys), add NEON_API_KEY to the environment, and optionally NEON_PROJECT_ID.',
      },
      501,
    )

  const allowed = async (req: PayloadRequest) => {
    try {
      return Boolean(await options.access({ req }))
    } catch (error) {
      req.payload.logger.error({ msg: 'Database tools access check failed', err: error })
      return false
    }
  }
  const denied = () => json({ error: 'You do not have access to the database tools.' }, 403)

  const audit = async (req: PayloadRequest, summary: string, to?: unknown) => {
    if (!options.audit) return
    try {
      await options.audit({
        payload: req.payload,
        req,
        summary,
        changes: to === undefined ? undefined : [{ field: 'neon', to }],
      })
    } catch (error) {
      req.payload.logger.error({ msg: 'Database tools audit failed', err: error, summary })
    }
  }

  return [
    {
      path: `${base}/neon/backup`,
      method: 'post',
      handler: async (req) => {
        if (!(await allowed(req))) return denied()
        if (!available()) return unavailable()

        const data = await body(req)
        const name =
          branchName(data.name) ||
          `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`

        try {
          const branch = await client().createBackupBranch({
            name,
            withEndpoint: data.withEndpoint === true,
          })
          req.payload.logger.info({
            msg: `Neon backup branch created: ${name}`,
            user: req.user?.email,
          })
          await audit(req, `Created Neon backup branch ${branch.name}`, branch)
          return json({ ok: true, branch })
        } catch (error) {
          req.payload.logger.error({ msg: 'Neon branch creation failed', err: error })
          return json(neonReadable(error), 502)
        }
      },
    },
    {
      path: `${base}/neon/restore`,
      method: 'post',
      handler: async (req) => {
        if (!(await allowed(req))) return denied()
        if (!available()) return unavailable()

        const data = await body(req)
        const timestamp = typeof data.timestamp === 'string' ? data.timestamp.trim() : ''
        const confirmation =
          typeof data.confirmation === 'string' ? data.confirmation.trim().toLowerCase() : ''
        const preserveUnderName = branchName(data.preserveUnderName) || undefined

        const when = new Date(timestamp)
        if (!timestamp || Number.isNaN(when.getTime())) {
          return json({ error: 'Choose the point in time to restore to.' }, 400)
        }
        if (when.getTime() > Date.now()) {
          return json(
            { error: 'That time is in the future; Neon can only restore to a time it has stored.' },
            400,
          )
        }
        if (confirmation !== 'restore') {
          return json(
            { error: 'Type “restore” in the confirmation box to replace the current branch.' },
            400,
          )
        }

        try {
          const branch = await client().restoreTo({
            timestamp: when.toISOString(),
            preserveUnderName,
          })
          req.payload.logger.warn({
            msg: `Neon branch restored to ${when.toISOString()}`,
            user: req.user?.email,
            branch: branch.id,
            preserved: preserveUnderName,
          })
          await audit(
            req,
            `Restored the Neon branch to ${when.toISOString()}${preserveUnderName ? ` (current state kept as ${preserveUnderName})` : ''}`,
            { branch: branch.id, preserveUnderName: preserveUnderName ?? null },
          )
          return json({ ok: true, branch, restoredTo: when.toISOString() })
        } catch (error) {
          req.payload.logger.error({ msg: 'Neon restore failed', err: error })
          return json(neonReadable(error), 502)
        }
      },
    },
    {
      path: `${base}/neon/delete`,
      method: 'post',
      handler: async (req) => {
        if (!(await allowed(req))) return denied()
        if (!available()) return unavailable()

        const data = await body(req)
        const branchId = typeof data.branchId === 'string' ? data.branchId.trim() : ''
        const confirmation = typeof data.confirmation === 'string' ? data.confirmation.trim() : ''
        if (!/^[a-z0-9-]{1,60}$/.test(branchId)) return json({ error: 'Not a branch id.' }, 400)
        if (confirmation !== branchId) {
          return json({ error: 'Type the branch id to confirm deleting it.' }, 400)
        }

        try {
          const neonClient = client()
          const branches = await neonClient.branches()
          const branch = branches.find((candidate) => candidate.id === branchId)
          if (!branch) return json({ error: 'That branch is not in this project.' }, 404)
          if (branch.default) return json({ error: 'The default branch cannot be deleted.' }, 400)
          if (branch.protected) return json({ error: 'That branch is protected in Neon.' }, 400)

          await neonClient.deleteBranch(branchId)
          req.payload.logger.warn({
            msg: `Neon branch deleted: ${branchId}`,
            user: req.user?.email,
          })
          await audit(req, `Deleted Neon branch ${branch.name} (${branchId})`, { branch: branchId })
          return json({ ok: true, deleted: branchId })
        } catch (error) {
          req.payload.logger.error({ msg: 'Neon branch deletion failed', err: error })
          return json(neonReadable(error), 502)
        }
      },
    },
  ]
}
