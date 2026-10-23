import type pg from 'pg'

import { DatabaseToolsError, number, quoteTable } from './connection'
import { listTables, type TableSummary } from './introspection'

/**
 * A seed built from a real database: the content tables of a Neon branch, written to one JSON file
 * that `pnpm db:snapshot apply <file>` loads into a local database.
 *
 * Why not dump and restore? A dump carries the whole schema and every internal table, and restoring
 * it into a database created by this checkout fails on the first object that already exists. A seed
 * carries only *content* — the collections and globals the app seeds today, with their `_rels`,
 * array and version tables — and is applied by deleting those tables and inserting the rows again,
 * so ids and relationships survive exactly and nothing else in the database is touched.
 *
 * Three details make the file faithful:
 *
 *   - Rows are read by Postgres itself (`row_to_json`), so enums, timestamps, `jsonb`, arrays and
 *     `bytea` keep their own textual form, and inserted back with `jsonb_populate_recordset`, which
 *     runs the same types' input functions. Nothing is coerced by JavaScript.
 *   - Tables are ordered by their foreign keys (parents first) from `pg_constraint`, because
 *     Payload's keys are not deferrable: children cannot be inserted before the rows they point at.
 *     A cycle (none in this schema, but a host may have one) breaks at the point it closes and is
 *     reported in `warnings` rather than throwing.
 *   - The sequences touched by the insert are set to the maximum id of their table afterwards.
 *     `RESTART IDENTITY` is wrong here: the point is to keep the ids the rows already have.
 *
 * The file is a seed, not a backup: it holds the content the app needs to render, so a developer
 * gets the real articles instead of fixtures. Media *rows* are included (their `url` points at the
 * blob store), the files themselves stay where they are.
 */

/** Collection table names are the slug with every run of non-alphanumerics as `_`. */
export const tableNameFor = (slug: string): string => slug.replace(/[^a-z0-9]+/gi, '_')

/** Payload's own tables, auth, and the operational collections a seed must not copy. */
export const DEFAULT_SEED_EXCLUDES = [
  'users',
  'roles',
  'job-runs',
  'pagespeed-reports',
  'audit-logs',
  // Payload's own bookkeeping is never content.
  'payload-kv',
  'payload-folders',
  'payload-locked-documents',
  'payload-preferences',
  'payload-migrations',
]

export type SeedCollection = { slug: string; dbName?: string | null; auth?: boolean }

/**
 * The collections a seed should carry, from the Payload config: everything except auth, Payload's
 * own tables and the operational ones. `exclude` is the host's own list, on top of the defaults.
 */
export const seedableCollections = (
  collections: SeedCollection[],
  exclude: string[] = [],
): string[] => {
  const skip = new Set([...DEFAULT_SEED_EXCLUDES, ...exclude])
  return collections
    .filter((collection) => !collection.auth)
    .filter((collection) => !skip.has(collection.slug))
    .filter((collection) => !collection.slug.startsWith('payload-'))
    .map((collection) => collection.slug)
}

/**
 * The tables that belong to a set of collections and globals: the table itself, its `_rels`, array
 * and relationship tables (`<table>_*`), and the version table (`_<table>_v`, `<table>_v_*`).
 *
 * Prefix matching is what Payload's naming gives us; the exact names still come from the catalog,
 * so a table that does not exist is simply not in the list.
 */
export const contentTables = (
  tables: { name: string }[],
  collections: SeedCollection[],
  globals: string[] = [],
): string[] => {
  const bases = new Set<string>()
  for (const collection of collections) {
    bases.add(tableNameFor(collection.dbName ?? collection.slug))
  }
  for (const slug of globals) bases.add(tableNameFor(slug))

  const wanted = new Set<string>()
  for (const table of tables) {
    for (const base of bases) {
      if (
        table.name === base ||
        table.name.startsWith(`${base}_`) ||
        table.name === `_${base}_v` ||
        table.name.startsWith(`_${base}_v_`)
      ) {
        wanted.add(table.name)
        break
      }
    }
  }
  return [...wanted]
}

/**
 * The `maxRows` query parameter, clamped to the host's cap.
 *
 * An absent value means the cap, and it has to be checked as a string: `Number(null)` is `0`, which
 * is finite, so the obvious `Number.isFinite(Number(param))` reads "no parameter" as "one row per
 * table" and silently writes an almost empty seed.
 */
export const clampSeedRows = (raw: string | null | undefined, cap: number): number => {
  const limit = Math.max(1, Math.trunc(cap))
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === '') return limit
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return limit
  return Math.min(Math.max(1, Math.trunc(parsed)), limit)
}

export type SeedTableRows = {
  name: string
  rows: number
  truncated: boolean
  /** Column names as they are, for a reader and for a schema check on apply. */
  columns: string[]
}

export type SeedSnapshot = {
  format: 'pocms-seed'
  version: 1
  generatedAt: string
  source: { host: string; database: string }
  collections: string[]
  /** Parents before children; `apply` deletes them in the opposite order. */
  tables: { name: string; columns: string[]; data: Record<string, unknown>[] }[]
  sequences: { table: string; sequence: string; value: number }[]
  counts: { tables: number; rows: number }
  warnings: string[]
}

/** `articles` → `articles_id_seq`: the sequence behind the table's serial `id`, if it has one. */
const sequenceOf = async (client: pg.Client, name: string): Promise<string | null> => {
  const { rows } = await client.query<{ sequence: string | null }>(
    `select pg_get_serial_sequence($1, 'id') as sequence`,
    [quoteTable(name)],
  )
  return rows[0]?.sequence ?? null
}

/**
 * Parents first, from the foreign keys between the chosen tables only.
 *
 * A table that references itself is put first (its own rows are inserted in file order and Payload
 * writes folders parent-first); a cycle between two tables is broken where it closes and named in
 * `warnings` — better a seed that loads in a strange order than one that refuses to be written.
 */
export const insertOrder = async (
  client: pg.Client,
  names: string[],
): Promise<{ order: string[]; warnings: string[] }> => {
  if (names.length === 0) return { order: [], warnings: [] }
  const { rows } = await client.query<{ child: string; parent: string }>(
    `select c.relname as child, p.relname as parent
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_class p on p.oid = con.confrelid
       join pg_namespace n on n.oid = c.relnamespace
      where con.contype = 'f' and n.nspname = 'public'
        and con.conrelid <> con.confrelid`,
  )
  const chosen = new Set(names)
  const parents = new Map(names.map((name) => [name, new Set<string>()]))
  for (const edge of rows) {
    if (chosen.has(edge.child) && chosen.has(edge.parent)) parents.get(edge.child)!.add(edge.parent)
  }

  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const warnings: string[] = []
  const visit = (name: string, path: string[]): void => {
    if (state.get(name) === 'done') return
    if (state.get(name) === 'visiting') {
      const cycle = [...path.slice(path.indexOf(name)), name]
      warnings.push(`Foreign-key cycle between ${cycle.join(' → ')}: inserted in the order shown.`)
      return
    }
    state.set(name, 'visiting')
    for (const parent of parents.get(name) ?? []) visit(parent, [...path, name])
    state.set(name, 'done')
    order.push(name)
  }
  // Stable: the catalog's order, so the same database produces the same file.
  for (const name of names) visit(name, [])

  return { order, warnings }
}

export type BuildSeedOptions = {
  collections: SeedCollection[]
  globals?: string[]
  /** Rows per table. A larger table is cut and named in `warnings`. @default 5000 */
  maxRowsPerTable?: number
  /**
   * An explicit list of tables, instead of the ones the collections imply. Names are checked
   * against the catalog, so a table that does not exist is simply not in the file.
   */
  tables?: string[]
  now?: Date
  target?: { host: string; database: string }
}

/** Read the content tables of the connected database into one seed file. Read-only. */
export const buildSeedSnapshot = async (
  client: pg.Client,
  options: BuildSeedOptions,
): Promise<{ snapshot: SeedSnapshot; json: string; filename: string }> => {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const maxRows = Math.max(1, options.maxRowsPerTable ?? 5_000)
  const all = await listTables(client)
  const byName = new Map<string, TableSummary>(all.map((table) => [table.name, table]))
  const names =
    options.tables && options.tables.length > 0
      ? all.filter((table) => options.tables!.includes(table.name)).map((table) => table.name)
      : contentTables(all, options.collections, options.globals ?? [])

  if (names.length === 0) {
    throw new DatabaseToolsError(
      'No content table matched the selected collections.',
      'Run `pnpm migrate` and `pnpm seed` first, or choose collections that have tables.',
    )
  }

  const { order, warnings } = await insertOrder(client, names)
  const tables: SeedSnapshot['tables'] = []
  const sequences: SeedSnapshot['sequences'] = []
  let rows = 0

  await client.query('begin isolation level repeatable read read only')
  try {
    for (const name of order) {
      const table = byName.get(name) as TableSummary
      if (!table) continue
      const columns = await client.query<{ name: string }>(
        `select a.attname as name
           from pg_attribute a
          where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
          order by a.attnum`,
        [table.oid],
      )
      // The catalog's `n_live_tup` is an estimate and reads 0 for a table nobody has ANALYZEd, so
      // the count comes from the table itself — the same query the `.sql` dump runs.
      const counted = await client.query<{ n: number }>(
        `select count(*)::bigint as n from ${quoteTable(name)}`,
      )
      const total = number(counted.rows[0]?.n)
      const { rows: data } = await client.query<{ row: Record<string, unknown> }>(
        `select row_to_json(t) as row
           from (select * from ${quoteTable(name)} order by ctid limit $1) t`,
        [Math.min(total, maxRows + 1)],
      )
      const truncated = total > maxRows
      if (truncated) {
        warnings.push(
          `${name}: ${maxRows.toLocaleString('en')} of ${total.toLocaleString('en')} rows kept (the cap).`,
        )
      }
      tables.push({
        name,
        columns: columns.rows.map((column) => column.name),
        data: data.slice(0, maxRows).map((row) => row.row),
      })
      rows += Math.min(data.length, maxRows)

      const sequence = await sequenceOf(client, name)
      if (sequence) {
        const value = await client.query<{ last: string | null }>(
          `select last_value::bigint as last from pg_sequences
            where schemaname = 'public' and sequencename = $1`,
          [sequence.split('.').pop()],
        )
        const last = value.rows[0]?.last
        if (last !== null && last !== undefined) {
          sequences.push({ table: name, sequence, value: number(last) })
        }
      }
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }

  const target = options.target ?? { host: '', database: '' }
  const snapshot: SeedSnapshot = {
    format: 'pocms-seed',
    version: 1,
    generatedAt,
    source: target,
    collections: [
      ...options.collections.map((collection) => collection.slug),
      ...(options.globals ?? []),
    ],
    tables,
    sequences,
    counts: { tables: tables.length, rows },
    warnings,
  }

  return {
    snapshot,
    json: JSON.stringify(snapshot, null, 2),
    filename: `${(target.database || 'pocms').replace(/\W+/g, '-')}-seed-${generatedAt.slice(0, 10)}.json`,
  }
}

export type ApplySeedResult = {
  tables: { name: string; deleted: number; inserted: number }[]
  rows: number
  sequences: number
  warnings: string[]
}

/** A file is only a seed if it says so: a backup or a random JSON must not empty a database. */
export const parseSeedSnapshot = (text: string): SeedSnapshot => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DatabaseToolsError(
      'That file is not JSON.',
      'A seed is the file `pnpm db:snapshot seed` writes.',
    )
  }
  const snapshot = parsed as Partial<SeedSnapshot>
  if (snapshot?.format !== 'pocms-seed' || snapshot.version !== 1) {
    throw new DatabaseToolsError(
      'That JSON is not a PoCMS seed.',
      'The file must start with "format": "pocms-seed" and "version": 1. A backup is not a seed.',
    )
  }
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length === 0) {
    throw new DatabaseToolsError('The seed has no tables.')
  }
  return snapshot as SeedSnapshot
}

export type SeedPlanTable = {
  name: string
  /** Rows in the table now, which an apply deletes. */
  willDelete: number
  /** Rows the file holds for it, which an apply inserts. */
  willInsert: number
  /** True when `willDelete` is the planner's estimate rather than a count. */
  estimated: boolean
}

export type SeedPlan = {
  tables: SeedPlanTable[]
  rows: number
  /** Sequences an apply would move past the highest id it inserts. */
  sequences: number
  warnings: string[]
}

/** Above this many estimated rows the plan trusts the estimate instead of counting. */
const COUNT_ROWS_BELOW = 100_000

/**
 * What an apply of this seed *would* do, without doing any of it.
 *
 * The same refusals as the real thing run first, so a dry run also answers "will this file even
 * load here": a seed naming a table this database does not have is refused here rather than after
 * somebody has typed the confirmation word. Row counts come from the planner's estimate when a table
 * is big enough that counting it would be slower than the apply itself, and say so.
 */
export const planSeedApply = async (
  client: pg.Client,
  snapshot: SeedSnapshot,
): Promise<SeedPlan> => {
  const existing = new Set((await listTables(client)).map((table) => table.name))
  const missing = snapshot.tables.map((table) => table.name).filter((name) => !existing.has(name))
  if (missing.length > 0) {
    throw new DatabaseToolsError(
      `This seed names ${missing.length} table(s) this database does not have: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}.`,
      'Run `pnpm migrate` first, or generate the seed from a database with the same schema.',
    )
  }

  const plan: SeedPlan = { tables: [], rows: 0, sequences: 0, warnings: [] }

  for (const table of snapshot.tables) {
    // Serial: pg queues concurrent queries on one client and warns about it.
    const estimate = await client.query<{ reltuples: number }>(
      `select c.reltuples::bigint as reltuples
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1`,
      [table.name],
    )
    const reltuples = number(estimate.rows[0]?.reltuples)
    const estimated = reltuples >= COUNT_ROWS_BELOW
    const willDelete = estimated
      ? Math.max(0, reltuples)
      : number(
          (
            await client.query<{ n: number }>(
              `select count(*)::bigint as n from ${quoteTable(table.name)}`,
            )
          ).rows[0]?.n,
        )
    const willInsert = Array.isArray(table.data) ? table.data.length : 0
    plan.tables.push({ name: table.name, willDelete, willInsert, estimated })
    plan.rows += willInsert
  }

  // One setval per sequence the file names, plus one per table whose sequence it did not name.
  const named = new Set((snapshot.sequences ?? []).map((entry) => entry.sequence))
  plan.sequences = named.size
  for (const table of snapshot.tables) {
    const sequence = await sequenceOf(client, table.name)
    if (sequence && !named.has(sequence)) plan.sequences += 1
  }

  plan.warnings.push(...(snapshot.warnings ?? []))
  if (plan.tables.some((table) => table.estimated)) {
    plan.warnings.push(
      'A table with more than 100 000 rows is counted from the planner’s estimate, so its “deleted” number is approximate.',
    )
  }
  return plan
}

/**
 * Load a seed into the connected database: delete the tables it names (children first), insert the
 * rows (parents first), set the sequences. One transaction — a seed that fails halfway leaves the
 * database as it was.
 */
export const applySeedSnapshot = async (
  client: pg.Client,
  snapshot: SeedSnapshot,
): Promise<ApplySeedResult> => {
  const existing = new Set((await listTables(client)).map((table) => table.name))
  const missing = snapshot.tables.map((table) => table.name).filter((name) => !existing.has(name))
  if (missing.length > 0) {
    throw new DatabaseToolsError(
      `This seed names ${missing.length} table(s) this database does not have: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}.`,
      'Run `pnpm migrate` first, or generate the seed from a database with the same schema.',
    )
  }

  const results: ApplySeedResult = { tables: [], rows: 0, sequences: 0, warnings: [] }
  await client.query('begin')
  try {
    // Children first, so no deleted row is still referenced when its parent goes.
    for (const table of [...snapshot.tables].reverse()) {
      const deleted = await client.query(`delete from ${quoteTable(table.name)}`)
      results.tables.unshift({
        name: table.name,
        deleted: deleted.rowCount ?? 0,
        inserted: 0,
      })
    }

    for (const [index, table] of snapshot.tables.entries()) {
      if (!Array.isArray(table.columns) || table.columns.length === 0) {
        throw new DatabaseToolsError(`Table ${table.name} in this seed has no columns.`)
      }
      const inserted = await client.query(
        `insert into ${quoteTable(table.name)}
         select * from jsonb_populate_recordset(null::${quoteTable(table.name)}, $1::jsonb)`,
        [JSON.stringify(table.data)],
      )
      results.tables[index].inserted = inserted.rowCount ?? 0
      results.rows += inserted.rowCount ?? 0
    }

    for (const entry of snapshot.sequences ?? []) {
      // The ids came with the rows; the sequence has to be moved past them or the next insert
      // collides with a row that already exists.
      await client.query(`select setval($1, $2, true)`, [entry.sequence, Math.max(1, entry.value)])
      results.sequences += 1
    }

    // A table whose sequence was not in the file still needs one: compute it from its own rows.
    for (const table of snapshot.tables) {
      const sequence = await sequenceOf(client, table.name)
      if (!sequence || (snapshot.sequences ?? []).some((entry) => entry.sequence === sequence))
        continue
      await client.query(
        `select setval($1, greatest(coalesce((select max(id) from ${quoteTable(table.name)}), 1), 1), true)`,
        [sequence],
      )
      results.sequences += 1
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }

  results.warnings.push(...(snapshot.warnings ?? []))
  return results
}
