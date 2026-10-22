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
  /**
   * Objects already in `public`. Only read when a core table is missing: a database with
   * leftovers but no schema is one where a migration stopped partway, not a fresh one.
   */
  leftovers?: SchemaLeftovers
  /** Why the database could not be inspected, when it could not be reached at all. */
  connectionError?: ConnectionFailure
}

export type SchemaLeftovers = {
  /** Base tables in `public`. */
  tables: number
  /** Enum types in `public` (`enum_articles_category`, …). */
  enums: number
}

/** The parts of a failed connection that change the advice. */
export type ConnectionFailure = {
  /** Node's errno (`ECONNREFUSED`) or PostgreSQL's SQLSTATE (`28P01`). */
  code?: string
  message: string
}

/** Where the connection was aimed, so the advice can name the address. */
export type ConnectionTarget = {
  host?: string
  port?: string
  database?: string
}

export type SchemaState =
  /** Every table exists and every migration is applied. */
  | 'ready'
  /** No schema at all: nothing has been migrated. */
  | 'missing'
  /** Objects exist but the core tables do not: a migration stopped partway. */
  | 'partial'
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

const hasLeftovers = (leftovers: SchemaLeftovers): boolean =>
  leftovers.tables > 0 || leftovers.enums > 0

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
      message: describeConnectionError(facts.connectionError),
    }
  }

  // Leftovers without the tables the app needs. The Postgres adapter applies a migration inside a
  // transaction, but a connection dropped mid-run (a serverless database suspending, a stopped
  // container) can still leave the earlier statements behind. The next attempt then dies on
  // "type … already exists", which says nothing about the real problem.
  if (missingTables.length > 0 && facts.leftovers && hasLeftovers(facts.leftovers)) {
    const { tables, enums } = facts.leftovers
    const found = [
      tables > 0 ? `${tables} table${tables === 1 ? '' : 's'}` : '',
      enums > 0 ? `${enums} enum type${enums === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(' and ')

    return {
      state: 'partial',
      pending: facts.available,
      message:
        `This database has part of a schema, but not the tables the app needs ` +
        `(missing: ${missingTables.join(', ')}).\n` +
        `  It already holds ${found} in the public schema, so a migration then stops at\n` +
        '  “type … already exists” or “relation … already exists”. A migration was interrupted,\n' +
        '  or an older checkout pushed a schema and its tables were dropped since.\n' +
        '  On a database with nothing to keep — a new Neon/Vercel database, a local one you can\n' +
        '  recreate — drop what is there and migrate from zero:\n' +
        '    pnpm db:reset --yes     drops the public schema, then runs `pnpm migrate`\n' +
        '  pnpm db:status            shows what exists before you decide',
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

/**
 * What the failure actually was.
 *
 * `pg` does not always keep the errno: a connection that is accepted and then dropped arrives as
 * `Error: Connection terminated unexpectedly` with no `code` at all, and a reset during a query
 * arrives as `read ECONNRESET` with the text but no field. Matching the text recovers the useful
 * classification — without it, "connection terminated" would fall through to the generic advice
 * that says to check the password.
 */
const CODE_PATTERNS: [RegExp, string][] = [
  [/ECONNRESET/i, 'ECONNRESET'],
  [/ECONNREFUSED/i, 'ECONNREFUSED'],
  [/ETIMEDOUT|timeout expired/i, 'ETIMEDOUT'],
  [/ENOTFOUND|EAI_AGAIN/i, 'ENOTFOUND'],
  [/password authentication failed|no pg_hba\.conf entry/i, '28P01'],
  [/database .* does not exist/i, '3D000'],
  // The socket was accepted and closed: a stopped container's port mapping, a proxy, a restart.
  [/connection terminated unexpectedly|connection terminated|server closed the connection/i, 'ECONNRESET'],
]

/** The errno, from the field when there is one and from the text otherwise. */
export const classifyConnectionFailure = (failure: ConnectionFailure): ConnectionFailure => {
  if (failure.code) return failure
  for (const [pattern, code] of CODE_PATTERNS) {
    if (pattern.test(failure.message)) return { ...failure, code }
  }
  return failure
}

/**
 * Turn a failed connection into advice that matches the failure.
 *
 * `ECONNREFUSED` and `ECONNRESET` look alike in a log and mean different things: nothing listened
 * on the address, versus something accepted the connection and then dropped it (a container or
 * proxy that is not ready, or a host that wants TLS when the client did not send it). Telling a
 * developer to check their password when the server is simply not up is how a five-minute problem
 * becomes an hour.
 */
export const describeConnectionError = (raw: ConnectionFailure): string => {
  const failure = classifyConnectionFailure(raw)
  const code = failure.code ?? ''
  const line = `The database could not be reached: ${failure.message}`

  if (code === 'ECONNREFUSED')
    return (
      `${line}\n` +
      '  Nothing is listening on that address, so the database is not running — or POSTGRES_URL\n' +
      '  names the wrong port. Start it (docker compose up -d db) and check the URL in .env.'
    )

  if (code === 'ECONNRESET')
    return (
      `${line}\n` +
      '  Something accepted the connection and then closed it — the usual sign of a database that\n' +
      '  is not actually serving yet: a stopped container (Docker’s port mapping answers and then\n' +
      '  resets), a server still starting, a proxy in front of it, or a server that wants TLS when\n' +
      '  the URL says sslmode=disable. Check the container (docker compose ps) and its logs, retry\n' +
      '  in a few seconds, or add ?sslmode=require to a hosted database’s URL.'
    )

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return (
      `${line}\n` +
      '  The host name in POSTGRES_URL does not resolve. Check it for typos and for a VPN or DNS\n' +
      '  setting that the terminal does not have.'
    )

  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH')
    return (
      `${line}\n` +
      '  The address did not answer in time. A firewall, a stopped host or a proxy can do that;\n' +
      '  check POSTGRES_URL and whether the database is reachable from this machine.'
    )

  if (code === '28P01' || code === '28000')
    return (
      `${line}\n` +
      '  The server was reached but refused the credentials: the user or password in POSTGRES_URL\n' +
      '  is wrong, or the database does not accept connections from this host (pg_hba.conf).'
    )

  if (code === '3D000')
    return (
      `${line}\n` +
      '  The server was reached but that database does not exist. Create it, or point POSTGRES_URL\n' +
      '  at the right one.'
    )

  return `${line}\n  Check POSTGRES_URL in .env, and that the database is running (docker compose up -d db).`
}

/** What is in `public`, for the partial-schema diagnosis. */
export const LEFTOVERS_SQL = `
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE')::int as "tables",
    (select count(*) from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e')::int as "enums"`

/** The raw query behind `SchemaFacts.tables` and `hasMigrationsTable`, as one round trip. */
/**
 * Connection options for a `pg` client, from the URL alone.
 *
 * Local databases are reached directly; anything else may need TLS, as with the Payload adapter.
 * `rejectUnauthorized: false` because a hosted Postgres (Neon, Vercel) presents a certificate that
 * is not in Node's bundle, and the connection still runs over TLS.
 */
export const pgClientOptions = (connectionString: string) => {
  const { hostname } = new URL(connectionString)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)
  return {
    connectionString,
    ssl: local ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  }
}

export const TABLES_SQL = `select ${[...CORE_TABLES, MIGRATIONS_TABLE].map(
  (table) => `to_regclass('public.${table}') is not null as "${table}"`,
).join(', ')}`

/** The applied migrations, oldest first. Only valid when `hasMigrationsTable` is true. */
export const APPLIED_SQL = 'select "name" from "payload_migrations" order by "created_at" asc'

type Execute = (args: { drizzle: unknown; raw: string }) => Promise<unknown>

/**
 * `pg` puts the errno on the error; Node's socket errors can also arrive as `cause`. Take the first
 * code that looks like one, so the advice above is chosen from the real reason.
 */
export const connectionFailureOf = (error: unknown): ConnectionFailure => {
  const seen: unknown[] = []
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.includes(current) && seen.length < 5) {
    seen.push(current)
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (typeof candidate.code === 'string') {
      return { code: candidate.code, message: String(candidate.message ?? candidate.code) }
    }
    current = candidate.cause
  }
  const message = error instanceof Error ? error.message : String(error)
  return classifyConnectionFailure({ message })
}

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

    // Only needed to tell "nothing was ever here" from "something stopped partway"; the query is
    // cheap, and a failure to run it must not turn a readable message into a connection error.
    const leftovers = Object.values(tables).every(Boolean)
      ? undefined
      : await execute(LEFTOVERS_SQL)
          .then((result) => {
            const [row] = rowsOf(result)
            return { tables: Number(row?.tables ?? 0), enums: Number(row?.enums ?? 0) }
          })
          .catch(() => undefined)

    return describeSchema({ tables, hasMigrationsTable, applied, available, leftovers })
  } catch (error) {
    return describeSchema({
      tables: { users: false, articles: false },
      hasMigrationsTable: false,
      applied: [],
      available,
      connectionError: connectionFailureOf(error),
    })
  }
}
