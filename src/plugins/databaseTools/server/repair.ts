import type pg from 'pg'

import { number, quoteIdent, quoteTable } from './connection'
import { listTables } from './introspection'
import { invalidIndexes } from './maintenance'

/**
 * Health checks and the repairs that are safe to automate.
 *
 * The checks answer "is anything wrong that Postgres can tell us about?", not "is the content
 * right" — Payload validates the content, these look at the database itself: a sequence that fell
 * behind its rows (the classic after a manual import), rows in a `*_rels` table whose parent is
 * gone (after a partial delete or a hand-edited restore), indexes left invalid by a failed build,
 * tables the planner has no statistics for, and dead rows that autovacuum has not caught up with.
 *
 * Every fix is narrow and idempotent: `setval` to the current maximum, `DELETE` of rows that no
 * parent can reference, `ANALYZE`, `REINDEX`. None of them rewrite content.
 */

export type RepairCheckId =
  'migrations' | 'sequences' | 'orphans' | 'indexes' | 'statistics' | 'bloat' | 'primary-keys'

export type RepairCheck = {
  id: RepairCheckId
  title: string
  status: 'ok' | 'warn' | 'error'
  summary: string
  details: string[]
  fixable: boolean
}

export type RepairReport = {
  checks: RepairCheck[]
  checkedAt: string
}

export type RepairFixResult = {
  check: RepairCheckId
  fixed: number
  statements: string[]
  detail: string
}

type SequenceRow = { sequence: string; table: string; column: string }

const ownedSequences = async (client: pg.Client): Promise<SequenceRow[]> => {
  const { rows } = await client.query<SequenceRow>(`
    select s.relname as sequence, t.relname as "table", a.attname as column
      from pg_class s
      join pg_depend d
        on d.objid = s.oid and d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = t.relnamespace
     where s.relkind = 'S' and n.nspname = 'public'
     order by t.relname, a.attname`)
  return rows
}

type SequenceDrift = {
  sequence: string
  table: string
  column: string
  max: number
  last: number | null
}

const sequenceDrift = async (client: pg.Client): Promise<SequenceDrift[]> => {
  const drifts: SequenceDrift[] = []
  for (const row of await ownedSequences(client)) {
    const { rows } = await client.query<{ max: unknown; last: unknown }>(
      `select (select max(${quoteIdent(row.column)}) from ${quoteTable(row.table)}) as max,
              (select last_value from ${quoteTable(row.sequence)}) as last`,
    )
    const max = number(rows[0]?.max)
    const rawLast = rows[0]?.last
    const last = rawLast === null || rawLast === undefined ? null : number(rawLast)
    if (max > 0 && (last === null || last < max)) {
      drifts.push({ sequence: row.sequence, table: row.table, column: row.column, max, last })
    }
  }
  return drifts
}

/** Tables named `*_rels` whose base table exists: the join tables Payload creates for relations. */
const relationTables = async (client: pg.Client): Promise<{ rels: string; base: string }[]> => {
  const tables = await listTables(client)
  const names = new Set(tables.map((table) => table.name))
  return tables
    .filter(
      (table) => table.name.endsWith('_rels') && names.has(table.name.slice(0, -'_rels'.length)),
    )
    .map((table) => ({ rels: table.name, base: table.name.slice(0, -'_rels'.length) }))
}

const orphanCounts = async (
  client: pg.Client,
): Promise<{ rels: string; base: string; orphans: number }[]> => {
  const found: { rels: string; base: string; orphans: number }[] = []
  for (const { rels, base } of await relationTables(client)) {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::bigint as n
         from ${quoteTable(rels)} r
         left join ${quoteTable(base)} p on p.id = r.parent_id
        where p.id is null`,
    )
    const orphans = number(rows[0]?.n)
    if (orphans > 0) found.push({ rels, base, orphans })
  }
  return found
}

const unanalyzed = async (client: pg.Client): Promise<string[]> => {
  const { rows } = await client.query<{ name: string }>(`
    select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
       and coalesce(s.n_live_tup, 0) > 0
       and s.last_analyze is null and s.last_autoanalyze is null
     order by c.relname`)
  return rows.map((row) => row.name)
}

const bloated = async (
  client: pg.Client,
): Promise<{ name: string; dead: number; rows: number }[]> => {
  const { rows } = await client.query<{ name: string; dead: number; rows: number }>(`
    select c.relname as name, coalesce(s.n_dead_tup, 0)::bigint as dead, coalesce(s.n_live_tup, 0)::bigint as rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
       and s.n_dead_tup > 1000
       and s.n_dead_tup > s.n_live_tup * 0.1
     order by s.n_dead_tup desc`)
  return rows.map((row) => ({
    name: row.name,
    dead: number(row.dead),
    rows: number(row.rows),
  }))
}

const tablesWithoutPrimaryKey = async (client: pg.Client): Promise<string[]> => {
  const { rows } = await client.query<{ name: string }>(`
    select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (select 1 from pg_constraint con where con.conrelid = c.oid and con.contype = 'p')
     order by c.relname`)
  return rows.map((row) => row.name)
}

const format = (n: number): string => n.toLocaleString('en')

/**
 * Run every check. Read-only, and each query is independent: one failing check (an extension that
 * is not installed, a catalog the provider hides) does not hide the others.
 */
export const runRepairChecks = async (
  client: pg.Client,
  knownMigrations: string[],
): Promise<RepairReport> => {
  const tables = await listTables(client)
  const appliedResult = await client
    .query<{ name: string }>('select name from payload_migrations order by id')
    .catch(() => ({ rows: [] as { name: string }[] }))
  const appliedRows = appliedResult.rows
  // Serial on one connection: pg queues concurrent queries on a client and warns about it.
  const drifts = await sequenceDrift(client)
  const orphans = await orphanCounts(client)
  const invalid = await invalidIndexes(client)
  const stats = await unanalyzed(client)
  const dead = await bloated(client)
  const noPrimaryKey = await tablesWithoutPrimaryKey(client)

  const applied = appliedRows.map((row) => row.name)
  const known = new Set(knownMigrations)
  const pending = knownMigrations.filter((name) => !applied.includes(name))
  const unknown = applied.filter(
    (name) => !known.has(name) && !name.endsWith('_baseline') && knownMigrations.length > 0,
  )

  const checks: RepairCheck[] = [
    {
      id: 'migrations',
      title: 'Migration history',
      status: pending.length > 0 ? 'error' : unknown.length > 0 ? 'warn' : 'ok',
      summary:
        pending.length > 0
          ? `${pending.length} migration${pending.length === 1 ? '' : 's'} not applied.`
          : unknown.length > 0
            ? `${unknown.length} recorded migration${unknown.length === 1 ? '' : 's'} not in this checkout.`
            : `${applied.length} migrations applied; nothing pending.`,
      details: [
        ...pending.map((name) => `Pending: ${name}`),
        ...unknown.map((name) => `Unknown here: ${name}`),
      ],
      fixable: false,
    },
    {
      id: 'sequences',
      title: 'ID sequences',
      status: drifts.length > 0 ? 'error' : 'ok',
      summary:
        drifts.length > 0
          ? `${drifts.length} sequence${drifts.length === 1 ? '' : 's'} behind the rows — the next insert would fail with a duplicate key.`
          : 'Every sequence is at or ahead of its table’s highest id.',
      details: drifts.map(
        (drift) =>
          `${drift.table}.${drift.column}: sequence ${drift.sequence} is at ${drift.last ?? 'never used'}, highest row is ${format(drift.max)}`,
      ),
      fixable: drifts.length > 0,
    },
    {
      id: 'orphans',
      title: 'Relation rows',
      status: orphans.length > 0 ? 'warn' : 'ok',
      summary:
        orphans.length > 0
          ? `${orphans.reduce((sum, item) => sum + item.orphans, 0)} rows in relation tables point at a parent that no longer exists.`
          : 'No relation row points at a missing parent.',
      details: orphans.map(
        (item) => `${item.rels}: ${format(item.orphans)} orphaned rows (parent table ${item.base})`,
      ),
      fixable: orphans.length > 0,
    },
    {
      id: 'indexes',
      title: 'Indexes',
      status: invalid.length > 0 ? 'error' : 'ok',
      summary:
        invalid.length > 0
          ? `${invalid.length} invalid index${invalid.length === 1 ? '' : 'es'} — usually a failed CREATE INDEX CONCURRENTLY.`
          : `${tables.length} tables, every index valid.`,
      details: invalid.map((index) => `${index.name} on ${index.table}`),
      fixable: invalid.length > 0,
    },
    {
      id: 'statistics',
      title: 'Planner statistics',
      status: stats.length > 0 ? 'warn' : 'ok',
      summary:
        stats.length > 0
          ? `${stats.length} table${stats.length === 1 ? '' : 's'} have rows but have never been analyzed.`
          : 'Every table with rows has statistics.',
      details: stats,
      fixable: stats.length > 0,
    },
    {
      id: 'bloat',
      title: 'Dead rows',
      status: dead.length > 0 ? 'warn' : 'ok',
      summary:
        dead.length > 0
          ? `${dead.length} table${dead.length === 1 ? '' : 's'} hold more than 10% dead rows — a VACUUM reclaims them.`
          : 'No table holds a significant share of dead rows.',
      details: dead.map(
        (table) =>
          `${table.name}: ${format(table.dead)} dead of ${format(table.rows + table.dead)} rows`,
      ),
      fixable: false,
    },
    {
      id: 'primary-keys',
      title: 'Primary keys',
      status: noPrimaryKey.length > 0 ? 'warn' : 'ok',
      summary:
        noPrimaryKey.length > 0
          ? `${noPrimaryKey.length} table${noPrimaryKey.length === 1 ? '' : 's'} have no primary key — rows cannot be addressed individually from the admin.`
          : 'Every table has a primary key.',
      details: noPrimaryKey,
      fixable: false,
    },
  ]

  return { checks, checkedAt: new Date().toISOString() }
}

/**
 * Run one repair. Returns what it did, not a boolean: the page shows the statements and the count,
 * because "fixed" without a number is not something anyone should have to trust.
 */
export const applyRepair = async (
  client: pg.Client,
  check: RepairCheckId,
): Promise<RepairFixResult> => {
  const statements: string[] = []

  if (check === 'sequences') {
    const drifts = await sequenceDrift(client)
    for (const drift of drifts) {
      // Qualified and quoted: the sequence comes from `pg_class`, but a name is still a name.
      const target = `${quoteIdent('public')}.${quoteIdent(drift.sequence)}`
      await client.query(`select setval($1, $2, true)`, [target, drift.max])
      statements.push(`SELECT setval('${target.replace(/'/g, "''")}', ${drift.max}, true);`)
    }
    return {
      check,
      fixed: drifts.length,
      statements,
      detail:
        drifts.length > 0
          ? `Moved ${drifts.length} sequence${drifts.length === 1 ? '' : 's'} to the highest existing id.`
          : 'Nothing to fix.',
    }
  }

  if (check === 'orphans') {
    const orphans = await orphanCounts(client)
    let fixed = 0
    for (const item of orphans) {
      const { rowCount } = await client.query(
        `delete from ${quoteTable(item.rels)} r
          where not exists (select 1 from ${quoteTable(item.base)} p where p.id = r.parent_id)`,
      )
      fixed += rowCount ?? 0
      statements.push(
        `DELETE FROM ${quoteTable(item.rels)} r WHERE NOT EXISTS (SELECT 1 FROM ${quoteTable(item.base)} p WHERE p.id = r.parent_id);`,
      )
    }
    return { check, fixed, statements, detail: `Deleted ${format(fixed)} orphaned row(s).` }
  }

  if (check === 'indexes') {
    const invalid = await invalidIndexes(client)
    for (const index of invalid) {
      const sql = `REINDEX INDEX CONCURRENTLY ${quoteIdent(index.name)}`
      await client.query(sql)
      statements.push(`${sql};`)
    }
    return {
      check,
      fixed: invalid.length,
      statements,
      detail: `Rebuilt ${invalid.length} index(es).`,
    }
  }

  if (check === 'statistics') {
    const tables = await unanalyzed(client)
    if (tables.length > 0) {
      await client.query('ANALYZE')
      statements.push('ANALYZE;')
    }
    return {
      check,
      fixed: tables.length,
      statements,
      detail: `Analyzed the database (${tables.length} table(s) had no statistics).`,
    }
  }

  throw new Error(`“${check}” has no automatic repair.`)
}

