import type pg from 'pg'

import { number, quoteIdent } from './connection'
import { resolveTable } from './introspection'

/**
 * Maintenance the database can do for itself, and the checks that say when it needs to.
 *
 * All of it is Postgres built-ins — `ANALYZE`, `VACUUM`, `REINDEX` — run on a direct connection
 * because Payload's adapter issues single queries and `VACUUM` cannot run inside a transaction
 * block. Nothing here changes data; the one statement that deletes rows is the orphaned-relation
 * repair in `repair.ts`, and it is reported row by row before it runs.
 */

export const MAINTENANCE_ACTIONS = ['analyze', 'vacuum', 'vacuum-analyze', 'reindex'] as const
export type MaintenanceAction = (typeof MAINTENANCE_ACTIONS)[number]

export type MaintenanceResult = {
  action: MaintenanceAction
  table: string | null
  statements: string[]
  durationMs: number
  /** What changed, where it is cheap to measure (dead tuples before/after a VACUUM). */
  detail?: string
}

export const isMaintenanceAction = (value: unknown): value is MaintenanceAction =>
  typeof value === 'string' && (MAINTENANCE_ACTIONS as readonly string[]).includes(value)

const deadTuples = async (client: pg.Client, oid: number): Promise<number> => {
  const { rows } = await client.query<{ n: number }>(
    `select coalesce(n_dead_tup, 0)::bigint as n from pg_stat_user_tables where relid = $1`,
    [oid],
  )
  return number(rows[0]?.n)
}

export const invalidIndexes = async (
  client: pg.Client,
): Promise<{ name: string; table: string }[]> => {
  const { rows } = await client.query<{ name: string; table: string }>(`
    select ic.relname as name, tc.relname as "table"
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
     where n.nspname = 'public' and not i.indisvalid
     order by tc.relname, ic.relname`)
  return rows
}

/**
 * Run one maintenance action. `table` restricts it to a table; without it, every table in `public`
 * (or the whole database for ANALYZE/VACUUM, which is what the planner and vacuum need anyway).
 */
export const runMaintenance = async (
  client: pg.Client,
  action: MaintenanceAction,
  tableName?: string | null,
): Promise<MaintenanceResult> => {
  const started = Date.now()
  const statements: string[] = []
  let detail: string | undefined

  if (action === 'reindex') {
    const invalid = await invalidIndexes(client)
    if (invalid.length === 0) {
      return { action, table: null, statements: [], durationMs: 0, detail: 'No invalid index.' }
    }
    for (const index of invalid) {
      // CONCURRENTLY cannot run in a transaction block, which is why this uses a bare client.
      const sql = `REINDEX INDEX CONCURRENTLY ${quoteIdent(index.name)}`
      await client.query(sql)
      statements.push(`${sql};`)
    }
    return {
      action,
      table: null,
      statements,
      durationMs: Date.now() - started,
      detail: `Rebuilt ${invalid.length} index${invalid.length === 1 ? '' : 'es'}.`,
    }
  }

  const table = tableName ? await resolveTable(client, tableName) : null
  if (tableName && !table) throw new Error(`There is no table called “${tableName}”.`)

  // Dead tuples only change under VACUUM; ANALYZE does not touch them.
  const measuresDeadRows = action === 'vacuum' || action === 'vacuum-analyze'
  const before = table && measuresDeadRows ? await deadTuples(client, table.oid) : null
  const target = table ? quoteIdent(table.name) : null

  if (action === 'analyze' || action === 'vacuum-analyze') {
    const sql = target ? `ANALYZE ${target}` : 'ANALYZE'
    await client.query(sql)
    statements.push(`${sql};`)
  }
  if (action === 'vacuum' || action === 'vacuum-analyze') {
    const sql = target ? `VACUUM ${target}` : 'VACUUM'
    await client.query(sql)
    statements.push(`${sql};`)
  }

  if (table && before !== null) {
    const after = await deadTuples(client, table.oid)
    detail = `Dead rows: ${before.toLocaleString('en')} → ${after.toLocaleString('en')}.`
  }

  return {
    action,
    table: table?.name ?? null,
    statements,
    durationMs: Date.now() - started,
    detail,
  }
}
