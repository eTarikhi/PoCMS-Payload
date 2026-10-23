import type pg from 'pg'

import { number } from './connection'
import { listTables } from './introspection'

/**
 * Restore from a `.sql` file produced by the backup tool (or by `pg_dump --no-owner --no-privileges`).
 *
 * Two safeguards, because this is the one operation that can overwrite content:
 *
 *   1. Inspect the file first. It must be plain SQL, and it may not contain the statements that
 *      touch the *server* rather than this database (`DROP DATABASE`, `ALTER SYSTEM`, a psql
 *      `\connect`). Those would either fail or affect something outside what the admin can see.
 *   2. Refuse to run into a database that still has content, unless the caller confirms. The page
 *      asks an admin to type the confirmation phrase; the endpoint checks it again.
 *
 * The file is executed in one `pg` round trip with the simple query protocol, so it keeps the
 * `BEGIN`/`COMMIT` it was written with and a failure rolls the whole thing back. A `pg_dump` file
 * without a transaction is not atomic — the report says which kind ran.
 */

export const RESTORE_CONFIRMATION = 'restore'

/** Tables whose rows mean "this database is in use" — the same five `admin:status` reports on. */
export const CONTENT_TABLES = ['users', 'articles', 'projects', 'media', 'certificates']

export const MAX_RESTORE_BYTES = 25 * 1024 * 1024

const FORBIDDEN = [
  {
    pattern: /\bDROP\s+DATABASE\b/i,
    reason: 'it drops the whole database (the connection would be cut)',
  },
  {
    pattern: /\bCREATE\s+DATABASE\b/i,
    reason: 'it creates another database, which this tool does not manage',
  },
  { pattern: /\bALTER\s+SYSTEM\b/i, reason: 'it changes server settings for every database' },
  {
    pattern: /^\s*\\/m,
    reason: 'it contains psql meta-commands (\\connect, \\copy), which cannot run here',
  },
  {
    pattern: /\bCREATE\s+ROLE\b|\bALTER\s+ROLE\b|\bDROP\s+ROLE\b/i,
    reason: 'it manages server roles',
  },
  {
    pattern: /\bCOPY\b[\s\S]{0,200}?\bFROM\s+PROGRAM\b/i,
    reason: 'it runs a shell command on the database server',
  },
]

export type RestoreInspection = {
  bytes: number
  /** Rough count: the number of statement terminators at the start of a line. */
  statements: number
  transactional: boolean
  /** Tables the file creates or inserts into. */
  tables: string[]
  /** Why the file was refused, when it was. */
  refusal?: string
  /** The rows currently in `CONTENT_TABLES`, which a restore would add to unless `.sql` drops them. */
  existing: { table: string; rows: number }[]
}

const tablePattern =
  /(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INSERT\s+INTO|ALTER\s+TABLE(?:\s+ONLY)?)\s+(?:"?public"?\.)?"?([a-zA-Z0-9_-]+)"?/gi

/** Parse the file without running it. Never throws: a refusal is part of the result. */
export const inspectRestore = async (
  client: pg.Client,
  sql: string,
): Promise<RestoreInspection> => {
  const bytes = Buffer.byteLength(sql, 'utf8')
  const tables = new Set<string>()
  for (const match of sql.matchAll(tablePattern)) {
    const name = match[1]
    if (name) tables.add(name)
  }

  const statements = (sql.match(/;\s*$/gm) ?? []).length
  const transactional = /^\s*BEGIN\s*;/im.test(sql) && /^\s*COMMIT\s*;/im.test(sql)

  const forbidden = FORBIDDEN.find((entry) => entry.pattern.test(sql))
  const empty = sql.trim().length === 0
  const refusal = empty
    ? 'The file is empty.'
    : bytes > MAX_RESTORE_BYTES
      ? `The file is larger than ${Math.round(MAX_RESTORE_BYTES / 1024 / 1024)} MB; run it with psql instead.`
      : forbidden
        ? `The file was refused because ${forbidden.reason}.`
        : undefined

  // Only the five content tables: counting every table would scan the whole database just to warn
  // about it. A missing table (fresh database) simply does not appear.
  const existing: { table: string; rows: number }[] = []
  for (const table of CONTENT_TABLES) {
    const present = await client.query<{ n: number }>(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname = $1`,
      [table],
    )
    if (number(present.rows[0]?.n) === 0) continue
    const counted = await client.query<{ n: number }>(
      `select count(*)::bigint as n from "public"."${table}"`,
    )
    existing.push({ table, rows: number(counted.rows[0]?.n) })
  }

  return {
    bytes,
    statements,
    transactional,
    tables: [...tables],
    refusal,
    existing,
  }
}

/** A restore the tool refuses before running anything: a bad file, or content in the way. */
export class RestoreRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409,
  ) {
    super(message)
    this.name = 'RestoreRefused'
  }
}

export type RestoreResult = {
  ok: boolean
  /** Rows in the content tables afterwards, per table. */
  after: { table: string; rows: number }[]
  /** Row counts of every table, unchanged ones included. */
  tables: number
  durationMs: number
  message: string
}

export const restoreSql = async (
  client: pg.Client,
  sql: string,
  options: { force?: boolean } = {},
): Promise<RestoreResult> => {
  const inspection = await inspectRestore(client, sql)
  if (inspection.refusal) throw new RestoreRefused(inspection.refusal, 400)
  if (inspection.existing.length > 0 && !options.force) {
    throw new RestoreRefused(
      `The database already holds content (${inspection.existing
        .map((entry) => `${entry.table}: ${entry.rows}`)
        .join(', ')}). Confirm the restore to continue.`,
      409,
    )
  }

  const started = Date.now()
  // Session settings, not part of the file: a restore of a large dump should not hit the default
  // statement timeout, and it should fail fast rather than wait forever on a lock.
  await client.query(`set statement_timeout = '30s'`)
  await client.query(`set lock_timeout = '30s'`)
  await client.query(sql)

  const after: { table: string; rows: number }[] = []
  for (const table of CONTENT_TABLES) {
    const { rows } = await client
      .query<{ n: number }>(`select count(*)::bigint as n from "public"."${table}"`)
      .catch(() => ({
        rows: [] as { n: number }[],
      }))
    if (rows[0]) after.push({ table, rows: number(rows[0].n) })
  }

  return {
    ok: true,
    tables: (await listTables(client)).length,
    durationMs: Date.now() - started,
    after,
    message: inspection.transactional
      ? 'Restored inside the file’s own transaction.'
      : 'Restored. The file had no BEGIN/COMMIT, so a failure part-way would have left the earlier statements applied.',
  }
}
