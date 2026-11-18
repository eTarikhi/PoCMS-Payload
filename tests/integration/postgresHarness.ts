/**
 * Fail-closed PostgreSQL integration harness.
 *
 * The existing `test:int` suite deliberately keeps the permissive behaviour: database-dependent
 * specs skip when `POSTGRES_URL` is unreachable. That behaviour is preserved and unchanged.
 *
 * This module is the opposite contract. It is used only by `test:int:pg`, which:
 *
 *   1. requires an explicit `POSTGRES_TEST_URL` (never `POSTGRES_URL`, so production is never
 *      silently targeted),
 *   2. refuses to run if that URL looks like a remote/managed host,
 *   3. refuses to run if the target database is not clearly disposable,
 *   4. throws — never skips — when anything above is unmet.
 *
 * Guard rails on destroying data are the point of the file, so they are intentionally strict and
 * intentionally boring.
 */

import pg from 'pg'

/** Hosts allowed for the disposable integration database. */
const ALLOWED_TEST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * Required marker in the database name. Destructive lifecycle operations only run against a
 * database whose name contains this token, so a mistyped `POSTGRES_TEST_URL` pointing at a real
 * database cannot be dropped or truncated.
 */
export const DISPOSABLE_DB_MARKER = 'pocms_test'

export class IntegrationEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IntegrationEnvironmentError'
  }
}

export type TestDatabaseTarget = {
  /** Connection string with the database name replaced by the maintenance database. */
  adminUrl: string
  /** Connection string for the disposable database itself. */
  databaseUrl: string
  databaseName: string
  host: string
  port: string
}

const parse = (connectionString: string): URL => {
  try {
    // `pg` accepts postgres:// and postgresql://; WHATWG URL does not, so normalise the scheme.
    return new URL(connectionString.replace(/^postgres(ql)?:\/\//i, 'https://'))
  } catch {
    throw new IntegrationEnvironmentError(
      'POSTGRES_TEST_URL is not a valid PostgreSQL connection string.',
    )
  }
}

/**
 * Validates the integration target and returns its parts.
 *
 * @throws IntegrationEnvironmentError when the environment is not a safe disposable target.
 */
export function resolveTestDatabaseTarget(
  env: Record<string, string | undefined>,
): TestDatabaseTarget {
  const raw = (env.POSTGRES_TEST_URL ?? '').trim()

  if (!raw) {
    throw new IntegrationEnvironmentError(
      [
        'POSTGRES_TEST_URL is not set.',
        '',
        'test:int:pg is fail-closed: it will not run, and will not skip, without an explicit',
        'disposable database. POSTGRES_URL is intentionally not accepted so that a production',
        'connection string can never be targeted by accident.',
        '',
        'Set it to a throwaway PostgreSQL 16 database, for example:',
        '  POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/pocms_test',
        '',
        'See docs/phase2a-postgres-integration.md for the full local/Windows 11 procedure.',
      ].join('\n'),
    )
  }

  const parsed = parse(raw)
  const host = parsed.hostname.toLowerCase()

  if (!ALLOWED_TEST_HOSTS.has(host)) {
    throw new IntegrationEnvironmentError(
      [
        `POSTGRES_TEST_URL points at host "${host}", which is not an allowed integration host.`,
        '',
        `Allowed hosts: ${[...ALLOWED_TEST_HOSTS].join(', ')}`,
        '',
        'This guard exists so that a remote or managed database can never be used as the',
        'disposable target. Use a local PostgreSQL 16 instance.',
      ].join('\n'),
    )
  }

  const databaseName = parsed.pathname.replace(/^\//, '')

  if (!databaseName.includes(DISPOSABLE_DB_MARKER)) {
    throw new IntegrationEnvironmentError(
      [
        `POSTGRES_TEST_URL targets database "${databaseName}", which does not contain the`,
        `required marker "${DISPOSABLE_DB_MARKER}".`,
        '',
        'Database lifecycle operations TRUNCATE and DROP tables. Refusing to run against a',
        'database whose name does not clearly mark it as disposable.',
      ].join('\n'),
    )
  }

  // Maintenance connection: same server, but the always-present `postgres` database, used only to
  // create/drop the disposable database.
  const adminParsed = new URL(parsed.toString())
  adminParsed.pathname = '/postgres'

  return {
    adminUrl: restoreScheme(adminParsed.toString()),
    databaseUrl: raw,
    databaseName,
    host,
    port: parsed.port || '5432',
  }
}

const restoreScheme = (normalized: string): string =>
  normalized.replace(/^https:\/\//i, 'postgres://')

/** Throws unless a server is reachable. Never skips. */
export async function assertDatabaseReachable(
  target: TestDatabaseTarget,
  timeoutMs = 5_000,
): Promise<void> {
  const client = new pg.Client({
    connectionString: target.adminUrl,
    connectionTimeoutMillis: timeoutMs,
  })

  try {
    await client.connect()
    await client.query('SELECT 1')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new IntegrationEnvironmentError(
      [
        `Cannot reach PostgreSQL at ${target.host}:${target.port}.`,
        '',
        `Underlying error: ${detail}`,
        '',
        'test:int:pg is fail-closed and will not silently skip database tests.',
        'Start PostgreSQL 16 first — see docs/phase2a-postgres-integration.md.',
      ].join('\n'),
    )
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Asserts the server really is PostgreSQL 16, so a 13/14/15 target fails loudly. */
export async function assertPostgres16(target: TestDatabaseTarget): Promise<string> {
  const client = new pg.Client({ connectionString: target.adminUrl })
  try {
    await client.connect()
    const result = await client.query<{ server_version_num: string }>('SHOW server_version_num')
    const versionNum = Number(result.rows[0]?.server_version_num ?? 0)
    const major = Math.floor(versionNum / 10_000)

    if (major !== 16) {
      throw new IntegrationEnvironmentError(
        `Expected PostgreSQL 16, but the server reports server_version_num=${versionNum} (major ${major}).`,
      )
    }

    return String(versionNum)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * Drops and recreates the disposable database. Terminates lingering sessions first so a stale
 * connection cannot block the drop.
 */
export async function resetTestDatabase(target: TestDatabaseTarget): Promise<void> {
  const client = new pg.Client({ connectionString: target.adminUrl })
  try {
    await client.connect()

    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [target.databaseName],
    )

    // Identifiers cannot be parameterised; the database name is validated to contain the
    // disposable marker and is quoted defensively.
    const quoted = quoteIdentifier(target.databaseName)
    await client.query(`DROP DATABASE IF EXISTS ${quoted}`)
    await client.query(`CREATE DATABASE ${quoted}`)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Drops the disposable database. Safe to call when it does not exist. */
export async function dropTestDatabase(target: TestDatabaseTarget): Promise<void> {
  const client = new pg.Client({ connectionString: target.adminUrl })
  try {
    await client.connect()
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [target.databaseName],
    )
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(target.databaseName)}`)
  } finally {
    await client.end().catch(() => undefined)
  }
}

const quoteIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`
