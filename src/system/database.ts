import { sql } from '@payloadcms/db-vercel-postgres'
import type { Payload } from 'payload'

/**
 * Read-only database facts for the System page (CR-12 E6): the largest tables, their estimated row
 * counts, the number of open connections and the migration history compared with the committed
 * migrations. Every query is a single SELECT; failures (a proxy that blocks pg_stat, a database
 * that is not reachable) become `error` and the page still renders the rest.
 */

export type TableStat = { name: string; rows: number; bytes: number }
export type MigrationStat = { name: string; batch: number; appliedAt: string | null }

export type DatabaseSnapshot = {
  tables: TableStat[]
  totalBytes: number
  connections: number | null
  migrations: MigrationStat[]
  /** Committed migrations the database has not recorded, in order. */
  pending: string[]
  error: string | null
}

type QueryResult = { rows?: Record<string, unknown>[] }
type DrizzleLike = { execute: (query: unknown) => Promise<QueryResult> }

const number = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function drizzleOf(payload: Payload): DrizzleLike | null {
  const db = payload.db as unknown as { drizzle?: DrizzleLike }
  return db.drizzle && typeof db.drizzle.execute === 'function' ? db.drizzle : null
}

/**
 * @param knownMigrations migration names in `src/migrations`, oldest first (the view imports the
 * index; tests pass their own list).
 */
export async function databaseSnapshot(
  payload: Payload,
  knownMigrations: string[] = [],
): Promise<DatabaseSnapshot> {
  const empty: DatabaseSnapshot = {
    tables: [],
    totalBytes: 0,
    connections: null,
    migrations: [],
    pending: [],
    error: null,
  }
  const db = drizzleOf(payload)
  if (!db) return { ...empty, error: 'The database adapter does not expose a query interface.' }

  try {
    const tables = await db.execute(sql`
      select
        c.relname as table_name,
        coalesce(s.n_live_tup, 0)::bigint as row_estimate,
        pg_total_relation_size(c.oid)::bigint as bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit 12
    `)
    const connection = await db.execute(sql`
      select count(*)::int as connections from pg_stat_activity
    `)
    const hasHistory = await db.execute(sql`
      select to_regclass('public.payload_migrations') as name
    `)
    const migrations = hasHistory.rows?.[0]?.name
      ? await db.execute(sql`
          select name, batch, created_at from payload_migrations order by id
        `)
      : { rows: [] }

    const applied = (migrations.rows ?? []).map<MigrationStat>((row) => ({
      name: String(row.name ?? ''),
      batch: number(row.batch),
      appliedAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    }))
    const appliedNames = new Set(applied.map((migration) => migration.name))
    const tableStats = (tables.rows ?? []).map<TableStat>((row) => ({
      name: String(row.table_name ?? ''),
      rows: number(row.row_estimate),
      bytes: number(row.bytes),
    }))
    return {
      tables: tableStats,
      totalBytes: tableStats.reduce((sum, table) => sum + table.bytes, 0),
      connections: number(connection.rows?.[0]?.connections),
      migrations: applied,
      pending: knownMigrations.filter((name) => !appliedNames.has(name)),
      error: null,
    }
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
