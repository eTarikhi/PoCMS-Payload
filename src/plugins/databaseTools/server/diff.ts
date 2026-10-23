import type pg from 'pg'

import { DatabaseToolsError, number, quoteIdent, quoteTable } from './connection'
import { listTables } from './introspection'
import type { JsonBackup } from './backup'

/**
 * What another environment's database has that this one does not.
 *
 * The input is a `.json` backup — the file the Backup card already writes, and the one format that
 * carries column types as Postgres names them (`format_type`) rather than as Payload describes
 * them. So a file downloaded from the Neon branch's admin compares against a local database without
 * a second connection string, a second credential, or any trust in a hand-written list.
 *
 * The comparison is deliberately one-sided in what it *suggests*: a column the file has and this
 * database lacks gets the `ALTER TABLE` that would add it, because that is a sentence a developer can
 * read and decide about. A table or column this database has and the file lacks gets no statement at
 * all — the file may simply be older, and `DROP` is not a diff's business.
 *
 * Type, nullability and default differences are reported with the statement that would close them,
 * but a type change can need a `USING` cast and a `SET NOT NULL` can fail on the rows already there.
 * The report says so; nothing here runs anything.
 */

export type DifferenceKind =
  | 'missing-table'
  | 'missing-column'
  | 'type'
  | 'nullable'
  | 'default'
  | 'extra-column'
  | 'extra-table'

export type SchemaDifference = {
  table: string
  kind: DifferenceKind
  column?: string
  /** What the file says. */
  file?: string
  /** What this database says. */
  database?: string
  /** The statement that would close the gap, when closing it is a decision worth writing down. */
  statement?: string
  /** Why the statement may not be enough. */
  caution?: string
}

export type RowDifference = {
  table: string
  file: number
  database: number
  /** True when the database's number is the planner's estimate rather than a count. */
  estimated: boolean
}

export type DiffReport = {
  source: { database: string; generatedAt: string }
  /** True when the file named tables, so anything it leaves out is a choice, not a difference. */
  scoped: boolean
  tables: { inFile: number; inDatabase: number; compared: number }
  differences: SchemaDifference[]
  /** Differences beyond the cap, so a large drift is not silently shortened. */
  omitted: number
  rows: RowDifference[]
  same: boolean
}

/** Enough to read; a database with more drift than this needs `pnpm db:schema-from`, not a card. */
export const MAX_DIFFERENCES = 200

/** Above this many estimated rows the row comparison uses the estimate instead of counting. */
const COUNT_ROWS_BELOW = 100_000

type ColumnShape = { name: string; type: string; nullable: boolean; default: string | null }

/** A file is only comparable if it says what it is: a seed or a stray JSON is not a schema. */
export const parseJsonBackup = (text: string): JsonBackup => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DatabaseToolsError(
      'That file is not JSON.',
      'Download the JSON backup from the Backup card of the database you want to compare with.',
    )
  }
  const backup = parsed as Partial<JsonBackup>
  if (backup?.format !== 'pocms-backup' || backup.version !== 1) {
    throw new DatabaseToolsError(
      'That JSON is not a PoCMS backup.',
      'The file must start with "format": "pocms-backup". A seed (.json) or a .sql dump is not a schema description.',
    )
  }
  if (!Array.isArray(backup.tables)) {
    throw new DatabaseToolsError('That backup has no tables.')
  }
  return backup as JsonBackup
}

/** Every column of every table in `public`, read the same way the backup writes them. */
const liveColumns = async (client: pg.Client): Promise<Map<string, ColumnShape[]>> => {
  const { rows } = await client.query<{ table: string } & ColumnShape>(
    `select c.relname as table,
            a.attname as name,
            format_type(a.atttypid, a.atttypmod) as type,
            not a.attnotnull as nullable,
            pg_get_expr(d.adbin, d.adrelid) as "default"
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum`,
  )
  const byTable = new Map<string, ColumnShape[]>()
  for (const row of rows) {
    const list = byTable.get(row.table) ?? []
    list.push({ name: row.name, type: row.type, nullable: row.nullable, default: row.default })
    byTable.set(row.table, list)
  }
  return byTable
}

const renderDefault = (value: string | null | undefined): string =>
  value === null || value === undefined ? 'no default' : value

/** `ADD COLUMN`, with the file's own type, nullability and default. */
const addColumnStatement = (table: string, column: ColumnShape): string =>
  `ALTER TABLE ${quoteTable(table)} ADD COLUMN ${quoteIdent(column.name)} ${column.type}${
    column.nullable ? '' : ' NOT NULL'
  }${column.default ? ` DEFAULT ${column.default}` : ''};`

/**
 * Compare a backup file's schema with the connected database. Read-only: it runs SELECTs against the
 * catalogs and nothing else.
 */
export const diffSchema = async (client: pg.Client, backup: JsonBackup): Promise<DiffReport> => {
  const scoped = Array.isArray(backup.selection) && backup.selection.length > 0
  const live = await liveColumns(client)
  const tables = await listTables(client)
  const estimates = new Map(tables.map((table) => [table.name, table.rows]))

  const differences: SchemaDifference[] = []
  const rows: RowDifference[] = []
  let compared = 0

  for (const table of backup.tables) {
    const actual = live.get(table.name)
    if (!actual) {
      differences.push({
        table: table.name,
        kind: 'missing-table',
        file: `${(table.columns ?? []).length} columns`,
        caution:
          'A table is created by a migration, not by a diff: run `pnpm db:schema-from` against the other database, or `pnpm migrate` if the repository already has it.',
      })
      continue
    }
    compared += 1

    const actualByName = new Map(actual.map((column) => [column.name, column]))
    for (const column of table.columns ?? []) {
      const here = actualByName.get(column.name)
      if (!here) {
        differences.push({
          table: table.name,
          kind: 'missing-column',
          column: column.name,
          file: `${column.type}${column.nullable ? '' : ' NOT NULL'}`,
          statement: addColumnStatement(table.name, column),
          caution: column.nullable
            ? undefined
            : 'A NOT NULL column needs a default, or rows that already exist, before it can be added.',
        })
        continue
      }
      if (here.type !== column.type) {
        differences.push({
          table: table.name,
          kind: 'type',
          column: column.name,
          file: column.type,
          database: here.type,
          statement: `ALTER TABLE ${quoteTable(table.name)} ALTER COLUMN ${quoteIdent(column.name)} TYPE ${column.type};`,
          caution:
            'Changing a type rewrites the table and may need a USING cast; on a serverless database it also takes a lock.',
        })
      }
      if (here.nullable !== column.nullable) {
        differences.push({
          table: table.name,
          kind: 'nullable',
          column: column.name,
          file: column.nullable ? 'nullable' : 'NOT NULL',
          database: here.nullable ? 'nullable' : 'NOT NULL',
          statement: `ALTER TABLE ${quoteTable(table.name)} ALTER COLUMN ${quoteIdent(column.name)} ${
            column.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'
          };`,
          caution: column.nullable
            ? undefined
            : 'SET NOT NULL scans the table and fails on the first null already in it.',
        })
      }
      if (renderDefault(here.default) !== renderDefault(column.default)) {
        differences.push({
          table: table.name,
          kind: 'default',
          column: column.name,
          file: renderDefault(column.default),
          database: renderDefault(here.default),
          statement: `ALTER TABLE ${quoteTable(table.name)} ALTER COLUMN ${quoteIdent(column.name)} ${
            column.default ? `SET DEFAULT ${column.default}` : 'DROP DEFAULT'
          };`,
        })
      }
    }

    // Columns this database has and the file does not: reported, never dropped — and not reported at
    // all when the file was scoped, because then the file simply did not ask for them.
    const inFile = new Set((table.columns ?? []).map((column) => column.name))
    for (const column of scoped ? [] : actual) {
      if (!inFile.has(column.name)) {
        differences.push({
          table: table.name,
          kind: 'extra-column',
          column: column.name,
          database: `${column.type}${column.nullable ? '' : ' NOT NULL'}`,
          caution:
            'The file may simply be older. Dropping a column is a migration, and this report does not write one.',
        })
      }
    }

    // Row counts, for the question a schema diff cannot answer: is the other environment fuller?
    // A table whose rows the backup left out on purpose (`rowsOmitted`) has no count to compare:
    // reporting zero against this database's real rows would be a difference made of policy, not of
    // data. Payload's own preference and lock rows change by browsing the admin panel, so this is the
    // difference that appears most often and means least.
    if (table.rowsOmitted === true) continue

    const fileRows = Array.isArray(table.rows) ? table.rows.length : 0
    const estimate = number(estimates.get(table.name))
    const small = estimate < COUNT_ROWS_BELOW
    const counted = small
      ? await client.query<{ n: number }>(`select count(*)::bigint as n from ${quoteTable(table.name)}`)
      : null
    const here = counted ? number(counted.rows[0]?.n) : estimate
    if (here !== fileRows) {
      rows.push({ table: table.name, file: fileRows, database: here, estimated: !small })
    }
  }

  // Tables this database has and the file does not.
  const inFile = new Set(backup.tables.map((table) => table.name))
  for (const name of scoped ? [] : live.keys()) {
    if (!inFile.has(name)) {
      differences.push({
        table: name,
        kind: 'extra-table',
        database: `${(live.get(name) ?? []).length} columns`,
        caution: 'The file may be from before this table existed, or from a database without it.',
      })
    }
  }

  // What blocks work comes first, then what differs, then what is only newer here.
  const rank: Record<DifferenceKind, number> = {
    'missing-table': 0,
    'missing-column': 1,
    type: 2,
    nullable: 3,
    default: 4,
    'extra-column': 5,
    'extra-table': 6,
  }
  differences.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      a.table.localeCompare(b.table) ||
      (a.column ?? '').localeCompare(b.column ?? ''),
  )

  return {
    source: {
      database: backup.database || 'the file',
      generatedAt: backup.generatedAt ?? '',
    },
    scoped,
    tables: {
      inFile: backup.tables.length,
      inDatabase: live.size,
      compared,
    },
    differences: differences.slice(0, MAX_DIFFERENCES),
    omitted: Math.max(0, differences.length - MAX_DIFFERENCES),
    rows: rows.slice(0, 40),
    same: differences.length === 0,
  }
}
