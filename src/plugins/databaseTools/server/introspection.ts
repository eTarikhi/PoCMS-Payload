import type pg from 'pg'

import { DatabaseToolsError, number, quoteTable } from './connection'
import { buildWhere, type RowFilter, type SortDirection } from './filters'

/**
 * What is in the database, read from the catalogs.
 *
 * Everything here is a SELECT; nothing is inferred from the Payload config. That matters for a
 * repair tool: the point is to compare what the config *expects* with what the database *has*.
 * Table names from a request are never trusted — they are resolved to an OID from `pg_class` first
 * and every later query uses that OID (or the quoted name of the row it matched).
 */

export type TableSummary = {
  name: string
  oid: number
  rows: number
  bytes: number
  columns: number
  /** Rows that have been updated or deleted and not vacuumed yet. */
  deadRows: number
  lastVacuum: string | null
  lastAnalyze: string | null
}

export type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
  default: string | null
  primaryKey: boolean
}

export type IndexInfo = {
  name: string
  definition: string
  unique: boolean
  primary: boolean
  /** False after a failed `CREATE INDEX CONCURRENTLY`; `REINDEX` repairs it. */
  valid: boolean
  bytes: number
}

export type ConstraintInfo = {
  name: string
  /** p = primary key, u = unique, f = foreign key, c = check, x = exclusion. */
  type: string
  definition: string
}

export type TableDetail = {
  table: TableSummary
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  constraints: ConstraintInfo[]
}

export type Overview = {
  version: string
  database: string
  sizeBytes: number
  connections: number
  maxConnections: number
  cacheHitRatio: number
  uptime: string | null
  tables: TableSummary[]
  migrations: { name: string; appliedAt: string | null }[]
  /** Server settings the tools care about. */
  maintenanceWorkMem: string | null
}

const TABLES_BASE = `
  select
    c.oid,
    c.relname as name,
    coalesce(s.n_live_tup, 0)::bigint as rows,
    pg_total_relation_size(c.oid)::bigint as bytes,
    (select count(*)::int from pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
    coalesce(s.n_dead_tup, 0)::bigint as dead_rows,
    s.last_vacuum as last_vacuum,
    s.last_analyze as last_analyze
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'`

const TABLES_SQL = `${TABLES_BASE} order by pg_total_relation_size(c.oid) desc, c.relname`

const toSummary = (row: Record<string, unknown>): TableSummary => ({
  name: String(row.name),
  oid: number(row.oid),
  rows: number(row.rows),
  bytes: number(row.bytes),
  columns: number(row.columns),
  deadRows: number(row.dead_rows),
  lastVacuum: row.last_vacuum ? new Date(String(row.last_vacuum)).toISOString() : null,
  lastAnalyze: row.last_analyze ? new Date(String(row.last_analyze)).toISOString() : null,
})

export const listTables = async (client: pg.Client): Promise<TableSummary[]> => {
  const { rows } = await client.query(TABLES_SQL)
  return rows.map(toSummary)
}

/** The table's OID, or a readable error. Only tables in `public` are visible to the tools. */
export const resolveTable = async (
  client: pg.Client,
  name: string,
): Promise<TableSummary | null> => {
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(name)) return null
  const { rows } = await client.query(`${TABLES_BASE} and c.relname = $1`, [name])
  const [row] = rows as Record<string, unknown>[]
  return row ? toSummary(row) : null
}

const requireTable = async (client: pg.Client, name: string): Promise<TableSummary> => {
  const table = await resolveTable(client, name)
  if (!table)
    throw new DatabaseToolsError(`There is no table called “${name}” in the public schema.`)
  return table
}

export const tableDetail = async (client: pg.Client, name: string): Promise<TableDetail> => {
  const table = await requireTable(client, name)

  // One at a time: pg queues concurrent queries on a single client and warns about it.
  const columns = await client.query(
    `select
         a.attname as name,
         format_type(a.atttypid, a.atttypmod) as type,
         not a.attnotnull as nullable,
         pg_get_expr(d.adbin, d.adrelid) as "default",
         exists (
           select 1 from pg_index i
           where i.indrelid = a.attrelid and i.indisprimary and a.attnum = any(i.indkey)
         ) as primary_key
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
       order by a.attnum`,
    [table.oid],
  )
  const indexes = await client.query(
    `select
         ic.relname as name,
         pg_get_indexdef(i.indexrelid) as definition,
         i.indisunique as unique,
         i.indisprimary as primary,
         i.indisvalid as valid,
         pg_relation_size(i.indexrelid)::bigint as bytes
       from pg_index i
       join pg_class ic on ic.oid = i.indexrelid
       where i.indrelid = $1
       order by i.indisprimary desc, ic.relname`,
    [table.oid],
  )
  const constraints = await client.query(
    `select conname as name, contype::text as type, pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid = $1
        order by contype, conname`,
    [table.oid],
  )

  return {
    table,
    columns: (columns.rows as Record<string, unknown>[]).map((row) => ({
      name: String(row.name),
      type: String(row.type),
      nullable: row.nullable === true,
      default: row.default === null ? null : String(row.default),
      primaryKey: row.primary_key === true,
    })),
    indexes: (indexes.rows as Record<string, unknown>[]).map((row) => ({
      name: String(row.name),
      definition: String(row.definition),
      unique: row.unique === true,
      primary: row.primary === true,
      valid: row.valid === true,
      bytes: number(row.bytes),
    })),
    constraints: (constraints.rows as Record<string, unknown>[]).map((row) => ({
      name: String(row.name),
      type: String(row.type),
      definition: String(row.definition),
    })),
  }
}

export type RowPage = {
  table: string
  rows: Record<string, unknown>[]
  total: number
  limit: number
  offset: number
  sort: string | null
  direction: SortDirection
  filters: RowFilter[]
  /** Filters that named a column this table does not have (a stale or hand-edited link). */
  ignoredFilters: string[]
}

/** Page size for the read-only browser. Deliberately small: this is for looking, not exporting. */
export const ROW_PAGE_SIZE = 25

export const ROW_LIMIT_MAX = 200

/** The hard cap on a CSV download, whatever the option says. */
export const MAX_CSV_ROWS = 100_000

const sortClause = (
  sort: string | null | undefined,
  direction: SortDirection,
  columns: { name: string }[],
): string => {
  if (!sort || !columns.some((column) => column.name === sort)) {
    // ctid is a stable physical order and needs no primary key; every table has one.
    return 'order by ctid'
  }
  const ident = `"${sort.replace(/"/g, '""')}"`
  // ctid breaks ties so paging cannot repeat or skip a row when the sort key is not unique.
  return `order by ${ident} ${direction === 'desc' ? 'desc' : 'asc'} nulls last, ctid`
}

/**
 * A page of rows as JSON. `row_to_json` keeps the column order of the table and turns every value
 * into something a table cell can show.
 *
 * `filters` and `sort` are read-only conveniences for the browser: the column names are checked
 * against the catalog (never interpolated from the request) and values are parameters. The `total`
 * is the count *after* filtering, so the pager counts the rows the admin can actually page through.
 */
export const readRows = async (
  client: pg.Client,
  name: string,
  options: {
    limit?: number
    offset?: number
    sort?: string | null
    direction?: SortDirection
    filters?: RowFilter[]
  } = {},
): Promise<RowPage> => {
  const table = await requireTable(client, name)
  const limit = Math.min(Math.max(1, options.limit ?? ROW_PAGE_SIZE), ROW_LIMIT_MAX)
  const offset = Math.max(0, options.offset ?? 0)
  const direction = options.direction ?? 'asc'
  const columns = await tableColumns(client, table.oid)
  const where = buildWhere(options.filters ?? [], columns)

  const counted = await client.query(
    `select count(*)::int as n from ${quoteTable(table.name)} ${where.clause}`,
    where.params,
  )
  const total = number((counted.rows[0] as { n: unknown }).n)

  const { rows } = await client.query(
    `select row_to_json(t) as row
       from (select * from ${quoteTable(table.name)} ${where.clause}
             ${sortClause(options.sort, direction, columns)}
             limit $${where.params.length + 1} offset $${where.params.length + 2}) t`,
    [...where.params, limit, offset],
  )

  return {
    table: table.name,
    rows: (rows as { row: Record<string, unknown> }[]).map((row) => row.row),
    total,
    limit,
    offset,
    sort: options.sort && columns.some((column) => column.name === options.sort) ? options.sort : null,
    direction,
    filters: (options.filters ?? []).filter((filter) =>
      columns.some((column) => column.name === filter.column),
    ),
    ignoredFilters: where.ignored,
  }
}

/** The columns of a table, in table order: what a filter or a sort may name. */
export const tableColumns = async (
  client: pg.Client,
  oid: number,
): Promise<{ name: string; type: string }[]> => {
  const { rows } = await client.query(
    `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type
       from pg_attribute a
      where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [oid],
  )
  return (rows as Record<string, unknown>[]).map((row) => ({
    name: String(row.name),
    type: String(row.type),
  }))
}

/**
 * A whole table as CSV, for the "Export CSV" button: the same filters as the browser, capped at
 * `maxRows` so a link cannot pull a gigabyte through a serverless function. Values are written as
 * their Postgres text form; objects become JSON and null becomes an empty cell, which is what a
 * spreadsheet expects. Unlike the `.sql` dump this is for reading, not for restoring.
 */
export const exportCsv = async (
  client: pg.Client,
  name: string,
  options: {
    maxRows?: number
    sort?: string | null
    direction?: SortDirection
    filters?: RowFilter[]
  } = {},
): Promise<{ filename: string; csv: string; rows: number; truncated: boolean }> => {
  const table = await requireTable(client, name)
  const maxRows = Math.min(Math.max(1, options.maxRows ?? 10_000), MAX_CSV_ROWS)
  const columns = await tableColumns(client, table.oid)
  const where = buildWhere(options.filters ?? [], columns)

  const counted = await client.query(
    `select count(*)::int as n from ${quoteTable(table.name)} ${where.clause}`,
    where.params,
  )
  const total = number((counted.rows[0] as { n: unknown }).n)

  // One row over the cap, so the file's last line can say the table was cut.
  const take = Math.min(total, maxRows)
  const { rows } = await client.query(
    `select row_to_json(t) as row
       from (select * from ${quoteTable(table.name)} ${where.clause}
             ${sortClause(options.sort, options.direction ?? 'asc', columns)}
             limit $${where.params.length + 1}) t`,
    [...where.params, take],
  )
  const records = (rows as { row: Record<string, unknown> }[]).map((row) => row.row)

  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }
  const escape = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

  const lines = [columns.map((column) => escape(column.name)).join(',')]
  for (const record of records) {
    lines.push(columns.map((column) => escape(cell(record[column.name]))).join(','))
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return {
    filename: `pocms-${table.name}-${stamp}.csv`,
    csv: `${lines.join('\r\n')}\r\n`,
    rows: records.length,
    truncated: total > records.length,
  }
}


/** Everything the overview card needs, in as few round trips as possible. */
export const overview = async (client: pg.Client): Promise<Overview> => {
  const settings = await client.query(`
      select
        version() as version,
        current_database() as database,
        pg_database_size(current_database())::bigint as bytes,
        (select count(*)::int from pg_stat_activity where datname = current_database()) as connections,
        (select setting::int from pg_settings where name = 'max_connections') as max_connections,
        (select setting from pg_settings where name = 'maintenance_work_mem') as maintenance_work_mem,
        (select coalesce(sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0), 0)
           from pg_stat_database where datname = current_database()) as cache_hit,
        (select now() - pg_postmaster_start_time()) as uptime`)
  // By name, not id: the file names sort chronologically, and a migration applied late (a branch
  // merged after a deploy) would otherwise look out of order against `src/migrations`.
  const migrations = await client
    .query(`select name, created_at from payload_migrations order by name`)
    .catch(() => ({ rows: [] as Record<string, unknown>[] }))
  const tables = await listTables(client)

  const row = settings.rows[0] as Record<string, unknown>
  return {
    version: String(row.version),
    database: String(row.database),
    sizeBytes: number(row.bytes),
    connections: number(row.connections),
    maxConnections: number(row.max_connections),
    cacheHitRatio: number(row.cache_hit),
    maintenanceWorkMem: row.maintenance_work_mem ? String(row.maintenance_work_mem) : null,
    uptime: row.uptime ? String(row.uptime) : null,
    tables,
    migrations: (migrations.rows as Record<string, unknown>[]).map((migration) => ({
      name: String(migration.name),
      appliedAt: migration.created_at ? new Date(String(migration.created_at)).toISOString() : null,
    })),
  }
}


