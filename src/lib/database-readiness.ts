/**
 * Is this database ready to serve the app?
 *
 * Schema changes reach a database only through `pnpm migrate` (`push: false` in `payload.config.ts`),
 * so a database that was never migrated — a fresh one, a reset container, a new branch — looks
 * healthy until the first query, and then the admin shows Drizzle's raw failure:
 *
 *     Runtime Error · Failed query: select "users"."id", … from "users" …
 *
 * with the actual cause (`error: relation "users" does not exist`) buried in the server log. That
 * message says nothing about what to do, and it costs a debugging session every time.
 *
 * This module answers three questions cheaply, from the database itself:
 *
 * - do the core tables exist at all (has anything been migrated)?
 * - is there migration history (`payload_migrations`), or was the schema created by an old push?
 * - are all the migrations in `src/migrations` recorded as applied?
 *
 * The decision is a pure function of those facts, so it is tested without a database; `onInit`
 * logs the result, or throws a message with the command to run when there is no schema to use.
 */

/**
 * Tables the app cannot work without. Their absence means "nothing has been migrated here".
 * `payload_migrations` is handled separately: tables can exist without history (an old schema push).
 */
export const CORE_TABLES = ['users', 'articles'] as const

/** Payload's migration history. */
export const MIGRATIONS_TABLE = 'payload_migrations'

export type CoreTable = (typeof CORE_TABLES)[number]

export type SchemaFacts = {
  /** Which of `CORE_TABLES` exist. */
  tables: Record<CoreTable, boolean>
  /** Whether Payload's migration history table exists. */
  hasMigrationsTable: boolean
  /** Names recorded in `payload_migrations`, oldest first. Empty when the table is missing. */
  applied: string[]
  /** Names of the migrations in `src/migrations`, oldest first. */
  available: string[]
  /** Why the database could not be inspected, when it could not be reached at all. */
  connectionError?: string
}

export type SchemaState =
  /** Every table exists and every migration is applied. */
  | 'ready'
  /** No schema at all: nothing has been migrated. */
  | 'missing'
  /** Tables exist but there is no migration history: the baseline has to be adopted. */
  | 'unmanaged'
  /** The schema exists but is behind `src/migrations`. */
  | 'pending'
  /** The database could not be queried. */
  | 'unreachable'

export type SchemaReport = {
  state: SchemaState
  /** Migrations in `src/migrations` that are not recorded as applied. */
  pending: string[]
  /** A multi-line, actionable explanation. Empty only when the state is `ready`. */
  message: string
}

const COMMAND_HINT =
  'Schema changes are only applied by migrations (push is off).\n' +
  '  pnpm migrate        apply them\n' +
  '  pnpm seed           demo content, on an empty database'

/**
 * Decide the state and write the message. Pure: everything comes in through `facts`, so the wording
 * and the classification are unit-tested without a database.
 */
export const describeSchema = (facts: SchemaFacts): SchemaReport => {
  const missingTables = CORE_TABLES.filter((table) => !facts.tables[table])

  if (facts.connectionError) {
    return {
      state: 'unreachable',
      pending: facts.available,
      message:
        `The database could not be reached: ${facts.connectionError}\n` +
        '  Check POSTGRES_URL in .env, and that the database is running (docker compose up -d db).',
    }
  }

  // Nothing has run: not even `users` or the migration history table exists.
  if (missingTables.length > 0) {
    const names = missingTables.join(', ')
    return {
      state: 'missing',
      pending: facts.available,
      message:
        `This database has no schema (missing table${missingTables.length > 1 ? 's' : ''}: ${names}).\n` +
        '  It has never been migrated, so every query fails with a “relation does not exist” error.\n' +
        `  ${COMMAND_HINT}`,
    }
  }

  const pending = facts.available.filter((name) => !facts.applied.includes(name))

  // Tables but no history: the database was created by a development push, before migrations.
  if (!facts.hasMigrationsTable || (facts.applied.length === 0 && facts.available.length > 0)) {
    return {
      state: 'unmanaged',
      pending,
      message:
        'The tables exist but this database has no migration history.\n' +
        '  It was probably created by the old development schema push. Record the baseline once:\n' +
        '  pnpm migrate:adopt   (adds no tables, only the history rows)\n' +
        '  then pnpm migrate    for everything after the baseline.',
    }
  }

  if (pending.length > 0) {
    return {
      state: 'pending',
      pending,
      message:
        `${pending.length} migration${pending.length > 1 ? 's are' : ' is'} not applied:\n` +
        pending.map((name) => `    ${name}`).join('\n') +
        '\n  Some screens will fail until they run. ' +
        COMMAND_HINT.replace(/\n/g, '\n  '),
    }
  }

  return { state: 'ready', pending: [], message: '' }
}

/** The raw query behind `SchemaFacts.tables` and `hasMigrationsTable`, as one round trip. */
export const TABLES_SQL = `select ${[...CORE_TABLES, MIGRATIONS_TABLE].map(
  (table) => `to_regclass('public.${table}') is not null as "${table}"`,
).join(', ')}`

/** The applied migrations, oldest first. Only valid when `hasMigrationsTable` is true. */
export const APPLIED_SQL = 'select "name" from "payload_migrations" order by "created_at" asc'

type Execute = (args: { drizzle: unknown; raw: string }) => Promise<unknown>

/** `payload.db.execute` returns `{ rows }` for Postgres and an array for SQLite; accept both. */
const rowsOf = (result: unknown): Record<string, unknown>[] => {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const rows = (result as { rows?: unknown })?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/**
 * Read the facts from a running Payload instance and decide. Never throws: a failure to reach the
 * database is itself a state, so the caller can decide whether to log or to stop.
 */
export const checkSchema = async (
  payload: { db: unknown },
  available: string[],
): Promise<SchemaReport> => {
  const db = payload.db as { drizzle: unknown; execute: Execute }
  // The adapter's `execute` needs the Drizzle instance: `payload.db.execute({ drizzle, raw })`.
  const execute = (raw: string) => db.execute({ drizzle: db.drizzle, raw })

  try {
    const [tableRow] = rowsOf(await execute(TABLES_SQL))
    const tables = Object.fromEntries(
      CORE_TABLES.map((table) => [table, tableRow?.[table] === true]),
    ) as Record<CoreTable, boolean>
    const hasMigrationsTable = tableRow?.[MIGRATIONS_TABLE] === true

    const applied = hasMigrationsTable
      ? rowsOf(await execute(APPLIED_SQL)).map((row) => String(row.name))
      : []

    return describeSchema({ tables, hasMigrationsTable, applied, available })
  } catch (error) {
    return describeSchema({
      tables: { users: false, articles: false },
      hasMigrationsTable: false,
      applied: [],
      available,
      connectionError: error instanceof Error ? error.message : String(error),
    })
  }
}
