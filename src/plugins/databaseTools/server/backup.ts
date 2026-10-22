import type pg from 'pg'

import { databaseTarget, number, quoteIdent, quoteTable } from './connection'
import { listTables } from './introspection'

/**
 * Logical backups: a `.sql` file that rebuilds the database, and a `.json` file that describes it.
 *
 * The dump is generated *by Postgres*, not by JavaScript: `format('%L', column)` renders each value
 * with the type's own output/input rules, so enums, timestamps, `jsonb`, arrays and `bytea` come out
 * exactly right. Values never pass through `JSON.stringify` (which would quietly turn a timestamp
 * into a string and a `numeric` into a float).
 *
 * The statement order makes the file restorable into an empty database with `psql -f` or
 * `pnpm db:restore`:
 *
 *   types → sequences → tables → keys → data → indexes → foreign keys
 *
 * Foreign keys come last so data can be inserted in any order, including rows that reference rows
 * inserted later (media folders reference their parent by id).
 *
 * Limits that matter on a serverless database: one consistent read-only snapshot, at most
 * `MAX_ROWS_PER_TABLE` rows per table (a truncated table is named in the file), and no ownership,
 * grants or extensions — this is a *logical* backup of the schema the app uses. For an exact
 * point-in-time copy on Neon, restore a branch instead (see `neon.ts`).
 */

export const MAX_ROWS_PER_TABLE = 100_000
const ROWS_PER_INSERT = 200

/**
 * Tables whose schema is backed up but whose rows are not: what a running instance holds about
 * itself (document locks, the last search used, admin preferences, Payload's key/value store).
 * Restoring a stale lock would make a document impossible to edit, and the rest is rebuilt as it is
 * used. Every other table — including `payload_migrations`, so a restored database knows which
 * migrations it has — keeps its rows.
 */
export const NO_ROWS_BY_DEFAULT = [
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'payload_preferences',
  'payload_preferences_rels',
  'payload_kv',
]

/** Rows are always written for these, when a table is included at all. */
const rowsWanted = (name: string, includeData: boolean, includeInternal: boolean): boolean =>
  includeData && (includeInternal || !NO_ROWS_BY_DEFAULT.includes(name))

export type BackupTable = { name: string; rows: number; truncated: boolean }

export type BackupResult = {
  sql: string
  filename: string
  tables: BackupTable[]
  /** Tables left out (internal Payload bookkeeping, or absent from the request). */
  skipped: string[]
  rows: number
  bytes: number
  generatedAt: string
}

export type BackupOptions = {
  /** Tables to include; the default is every table in `public`. */
  tables?: string[]
  /** False for a schema-only dump. */
  includeData?: boolean
  /** Also copy locks and preferences (normally left out). */
  includeInternal?: boolean
  /** Tables that must never be in the dump, whatever else is selected. */
  exclude?: string[]
  maxRowsPerTable?: number
}

const header = (lines: string[]): string => lines.map((line) => `-- ${line}`).join('\n')

const statement = (sql: string): string => `${sql.trim().replace(/;?$/, ';')}\n`

export const listEnums = async (client: pg.Client): Promise<string[]> => {
  const { rows } = await client.query<{ stmt: string }>(`
    select format('CREATE TYPE %I.%I AS ENUM (%s);',
                  n.nspname, t.typname,
                  string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as stmt
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
     group by n.nspname, t.typname
     order by t.typname`)
  return rows.map((row) => row.stmt)
}

export const listSequences = async (
  client: pg.Client,
): Promise<{ create: string[]; setval: string[] }> => {
  const { rows } = await client.query<{
    create: string
    setval: string | null
  }>(`
    select
      format('CREATE SEQUENCE %I.%I START WITH %s INCREMENT BY %s MINVALUE %s MAXVALUE %s%s;',
             schemaname, sequencename, start_value, increment_by, min_value, max_value,
             case when cycle then ' CYCLE' else ' NO CYCLE' end) as create,
      case when last_value is null then null
           else format('SELECT setval(%L, %s, true);',
                       format('%I.%I', schemaname, sequencename), last_value)
      end as setval
      from pg_sequences
     where schemaname = 'public'
     order by sequencename`)
  return {
    create: rows.map((row) => row.create),
    setval: rows.flatMap((row) => (row.setval ? [row.setval] : [])),
  }
}

export const createTable = async (
  client: pg.Client,
  oid: number,
  name: string,
): Promise<string> => {
  const { rows } = await client.query<{
    column: string
    definition: string
  }>(
    `select
       quote_ident(a.attname) as column,
       format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' NOT NULL' else '' end
         || case
              when a.attidentity = 'a' then ' GENERATED ALWAYS AS IDENTITY'
              when a.attidentity = 'd' then ' GENERATED BY DEFAULT AS IDENTITY'
              when d.adbin is not null then format(' DEFAULT %s', pg_get_expr(d.adbin, d.adrelid))
              else ''
            end as definition
     from pg_attribute a
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
     order by a.attnum`,
    [oid],
  )

  return `CREATE TABLE ${quoteTable(name)} (\n  ${rows
    .map((row) => `${row.column} ${row.definition}`)
    .join(',\n  ')}\n);`
}

/** Primary keys and unique constraints, added after every table exists. */
export const listKeys = async (client: pg.Client, oid: number): Promise<string[]> => {
  const { rows } = await client.query<{ stmt: string }>(
    `select format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;',
                   n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid)) as stmt
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
      where con.conrelid = $1 and con.contype in ('p', 'u')
      order by con.contype desc, con.conname`,
    [oid],
  )
  return rows.map((row) => row.stmt)
}

/** Indexes that do not back a constraint: those are created by `listKeys` already. */
export const listIndexes = async (client: pg.Client, oid: number): Promise<string[]> => {
  const { rows } = await client.query<{ stmt: string }>(
    `select pg_get_indexdef(i.indexrelid) || ';' as stmt
       from pg_index i
      where i.indrelid = $1
        and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      order by i.indexrelid`,
    [oid],
  )
  return rows.map((row) => row.stmt)
}

/** Foreign keys and checks, added after the data. */
export const listForeignKeys = async (client: pg.Client, oid: number): Promise<string[]> => {
  const { rows } = await client.query<{ stmt: string }>(
    `select format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;',
                   n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid)) as stmt
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
      where con.conrelid = $1 and con.contype in ('f', 'c')
      order by con.contype, con.conname`,
    [oid],
  )
  return rows.map((row) => row.stmt)
}

type DataResult = { statements: string[]; rows: number; truncated: boolean }

/**
 * `INSERT` statements for one table, rendered by Postgres with `format('%L', …)`.
 *
 * The rows are read in `ctid` order in batches so a large table never has to fit in memory; the
 * whole backup runs in one `REPEATABLE READ` transaction, so the batches come from one snapshot.
 */
const dataStatements = async (
  client: pg.Client,
  name: string,
  columns: string[],
  maxRows: number,
): Promise<DataResult> => {
  if (columns.length === 0) return { statements: [], rows: 0, truncated: false }

  const counted = await client.query<{ n: number }>(
    `select count(*)::bigint as n from ${quoteTable(name)}`,
  )
  const total = number(counted.rows[0]?.n)
  const take = Math.min(total, maxRows + 1)
  const statements: string[] = []

  const values = columns.map(() => `%L`).join(', ')
  const args = columns.map((column) => `t.${quoteIdent(column)}`).join(', ')

  for (let offset = 0; offset < take; offset += ROWS_PER_INSERT) {
    const limit = Math.min(ROWS_PER_INSERT, take - offset)
    const { rows } = await client.query<{ stmt: string | null }>(
      `select format('INSERT INTO %I (%s) VALUES %s;',
                     $1::text, $2::text,
                     string_agg(format('(${values})', ${args}), ', ' order by t.ctid)) as stmt
         from (select ctid, * from ${quoteTable(name)} order by ctid limit $3 offset $4) t`,
      [name, columns.map((column) => quoteIdent(column)).join(', '), limit, offset],
    )
    const stmt = rows[0]?.stmt
    if (stmt) statements.push(stmt)
  }

  return { statements, rows: Math.min(total, maxRows), truncated: total > maxRows }
}

export type BuildBackupOptions = BackupOptions & { now?: Date }

/** The `.sql` dump. Read-only: it never changes the database. */
export const buildSqlBackup = async (
  client: pg.Client,
  options: BuildBackupOptions = {},
): Promise<BackupResult> => {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const includeData = options.includeData !== false
  const includeInternal = options.includeInternal === true
  const maxRows = options.maxRowsPerTable ?? MAX_ROWS_PER_TABLE
  const target = databaseTarget()

  const all = await listTables(client)
  const excluded = new Set(options.exclude ?? [])
  const wanted = options.tables && options.tables.length > 0 ? new Set(options.tables) : null
  const chosen = all.filter(
    (table) => !excluded.has(table.name) && (wanted ? wanted.has(table.name) : true),
  )
  const skipped = all.filter((table) => !chosen.includes(table)).map((table) => table.name)
  const noRows = chosen
    .filter((table) => !rowsWanted(table.name, includeData, includeInternal))
    .map((table) => table.name)

  await client.query('begin isolation level repeatable read read only')
  try {
    const enums = await listEnums(client)
    const sequences = await listSequences(client)
    const tables: BackupTable[] = []
    const data: string[] = []
    const keys: string[] = []
    const indexes: string[] = []
    const foreignKeys: string[] = []

    const definitions: string[] = []
    for (const table of chosen) {
      const detail = await client.query<{ name: string }>(
        `select a.attname as name from pg_attribute a
          where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped order by a.attnum`,
        [table.oid],
      )
      definitions.push(await createTable(client, table.oid, table.name))
      keys.push(...(await listKeys(client, table.oid)))
      indexes.push(...(await listIndexes(client, table.oid)))
      foreignKeys.push(...(await listForeignKeys(client, table.oid)))

      if (rowsWanted(table.name, includeData, includeInternal)) {
        const result = await dataStatements(
          client,
          table.name,
          detail.rows.map((row) => row.name),
          maxRows,
        )
        data.push(...result.statements)
        tables.push({ name: table.name, rows: result.rows, truncated: result.truncated })
      } else {
        tables.push({ name: table.name, rows: 0, truncated: false })
      }
    }

    await client.query('commit')

    const lines = [
      header([
        `PoCMS logical backup of ${target.database || 'the database'} on ${target.host || '?'} (${target.port || '?'})`,
        `Generated ${generatedAt} by the admin's database tools.`,
        '',
        'Restore into an EMPTY database:',
        '  psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f <this file>',
        '  or: pnpm db:restore <this file> --yes',
        '',
        'Order: types, sequences, tables, keys, data, indexes, foreign keys. Foreign keys are added',
        'last so rows can be inserted in any order. `TRUNCATE`/`DROP` are not included: this file',
        'adds to what is there.',
        includeData ? '' : 'SCHEMA ONLY: no rows are included.',
        skipped.length > 0 ? `Not included: ${skipped.join(', ')}` : '',
        noRows.length > 0 ? `Schema only (rows left out): ${noRows.join(', ')}` : '',
        tables.some((table) => table.truncated)
          ? `Truncated at ${maxRows} rows: ${tables
              .filter((table) => table.truncated)
              .map((table) => table.name)
              .join(', ')}`
          : '',
      ]).replace(/\n+$/, ''),
      '',
      "SET client_encoding = 'UTF8';",
      'SET standard_conforming_strings = on;',
      'SET check_function_bodies = false;',
      'BEGIN;',
      '',
      '-- Types',
      ...enums.map(statement),
      '-- Sequences',
      ...sequences.create.map(statement),
      '-- Tables',
      ...definitions.map(statement),
      '-- Primary keys and unique constraints',
      ...keys.map(statement),
      ...(includeData
        ? ['-- Data', ...data.map((sql) => `${sql}\n`)]
        : ['-- Data: skipped (schema only)']),
      '-- Indexes',
      ...indexes.map(statement),
      '-- Foreign keys and checks',
      ...foreignKeys.map(statement),
      ...sequences.setval.map((sql) => `${sql}\n`),
      'COMMIT;',
      '',
    ]

    const sql = lines.join('\n')
    return {
      sql,
      filename: `${(target.database || 'pocms').replace(/\W+/g, '-')}-${generatedAt.slice(0, 10)}.sql`,
      tables,
      skipped,
      rows: tables.reduce((sum, table) => sum + table.rows, 0),
      bytes: Buffer.byteLength(sql, 'utf8'),
      generatedAt,
    }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
}

export type JsonBackup = {
  format: 'pocms-backup'
  version: 1
  generatedAt: string
  database: string
  /**
   * Present only when the request named tables: the file describes a subset, so a reader comparing
   * it with a whole database knows that what is missing from the file is not drift.
   */
  selection?: string[]
  tables: {
    name: string
    columns: { name: string; type: string; nullable: boolean; default: string | null }[]
    rows: Record<string, unknown>[]
    truncated?: boolean
  }[]
}

/**
 * The same data as a structured file: one entry per table with its columns and rows. Useful for
 * diffing two databases or for a script that needs the content; the `.sql` dump is what restores.
 */
export const buildJsonBackup = async (
  client: pg.Client,
  options: BuildBackupOptions = {},
): Promise<{ json: string; filename: string }> => {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const maxRows = options.maxRowsPerTable ?? MAX_ROWS_PER_TABLE
  const target = databaseTarget()
  const all = await listTables(client)
  const excluded = new Set(options.exclude ?? [])
  const wanted = options.tables && options.tables.length > 0 ? new Set(options.tables) : null
  const chosen = all.filter(
    (table) => !excluded.has(table.name) && (wanted ? wanted.has(table.name) : true),
  )

  const tables: JsonBackup['tables'] = []
  for (const table of chosen) {
    const columns = await client.query<{
      name: string
      type: string
      nullable: boolean
      default: string | null
    }>(
      `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
              not a.attnotnull as nullable, pg_get_expr(d.adbin, d.adrelid) as "default"
         from pg_attribute a
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
        order by a.attnum`,
      [table.oid],
    )
    const keepRows = rowsWanted(
      table.name,
      options.includeData !== false,
      options.includeInternal === true,
    )
    const { rows } = keepRows
      ? await client.query<{ row: Record<string, unknown> }>(
          `select row_to_json(t) as row from (select * from ${quoteTable(table.name)} order by ctid limit $1) t`,
          [maxRows + 1],
        )
      : { rows: [] as { row: Record<string, unknown> }[] }
    tables.push({
      name: table.name,
      columns: columns.rows.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        default: column.default,
      })),
      rows: rows.slice(0, maxRows).map((row) => row.row),
      ...(rows.length > maxRows ? { truncated: true } : {}),
    })
  }

  const backup: JsonBackup = {
    format: 'pocms-backup',
    version: 1,
    generatedAt,
    database: target.database,
    ...(options.tables && options.tables.length > 0 ? { selection: options.tables } : {}),
    tables,
  }
  return {
    json: JSON.stringify(backup, null, 2),
    filename: `${(target.database || 'pocms').replace(/\W+/g, '-')}-${generatedAt.slice(0, 10)}.json`,
  }
}
