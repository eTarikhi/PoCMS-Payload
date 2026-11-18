/**
 * Fail-closed harness for Neon integration testing.
 *
 * The supported runtime is Vercel/Neon PostgreSQL in **every** environment, including local
 * development: the developer runs the app locally, the database is a Neon branch. The real
 * `@payloadcms/db-vercel-postgres` adapter is always used; no local PostgreSQL server or plain
 * `pg.Pool` is involved.
 *
 * The single most dangerous thing an integration suite can do here is connect to — or destroy —
 * the owner's real Neon database. `payload.config.ts` builds its pool from `process.env.POSTGRES_URL`,
 * which in a normal local dev environment points at that real database. This harness therefore:
 *
 *   1. reads only `POSTGRES_TEST_URL`, never `POSTGRES_URL`;
 *   2. proves the test target is a *different* Neon endpoint from the application's, by compare;
 *   3. requires an explicit destructive-operation opt-in;
 *   4. refuses (never skips, never falls back) when any check fails.
 *
 * Nothing here prints a connection string. Only the Neon endpoint id and database name, which are
 * non-secret identifiers, are ever surfaced in messages.
 */

import { detectNeonEndpointId } from './neonTarget'

export class NeonIntegrationEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NeonIntegrationEnvironmentError'
  }
}

export type NeonTestTarget = {
  /** Neon endpoint id of the disposable test database, e.g. `ep-cool-morning-a2bc`. */
  endpointId: string
  /** Database name on that endpoint. */
  database: string
  /** The validated test connection string. Never print this. */
  connectionString: string
}

/** Required opt-in before any destructive operation (drop/truncate/recreate). */
export const DESTRUCTIVE_OPT_IN_ENV = 'PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE'

/** Required marker in the test database name. Necessary, never sufficient, evidence. */
export const DISPOSABLE_DB_MARKER = 'pocms_test'

const isNeonHost = (host: string): boolean => host.endsWith('.neon.tech')

const describeTarget = (endpointId: string, database: string): string =>
  `endpoint ${endpointId} / database ${database}`

/**
 * Validates the Neon integration target.
 *
 * @throws NeonIntegrationEnvironmentError when the environment is not a safe disposable target.
 */
export function resolveNeonTestTarget(env: Record<string, string | undefined>): NeonTestTarget {
  const raw = (env.POSTGRES_TEST_URL ?? '').trim()

  if (!raw) {
    throw new NeonIntegrationEnvironmentError(
      [
        'POSTGRES_TEST_URL is not set.',
        '',
        'The Neon integration suite is fail-closed: it will not run and will not skip without an',
        'explicit disposable Neon database. It never falls back to POSTGRES_URL, because that is',
        'the application database.',
        '',
        'Create a disposable Neon branch and point the suite at it, for example:',
        '  POSTGRES_TEST_URL=postgresql://user:pass@ep-<branch>-123456-pooler.<region>.aws.neon.tech/neondb',
        '  PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE=true',
        '  PAYLOAD_DB_PUSH=true',
        '',
        'See docs/phase2a-postgres-integration.md for the branch procedure.',
      ].join('\n'),
    )
  }

  // Refuse the application database outright, before anything else touches it.
  const appUrl = (env.POSTGRES_URL ?? '').trim()
  if (appUrl && appUrl === raw) {
    throw new NeonIntegrationEnvironmentError(
      'POSTGRES_TEST_URL is identical to POSTGRES_URL. Refusing to run: the test suite must never ' +
        'target the application database.',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(raw.replace(/^postgres(ql)?:\/\//i, 'https://'))
  } catch {
    throw new NeonIntegrationEnvironmentError(
      'POSTGRES_TEST_URL is not a valid PostgreSQL connection string.',
    )
  }

  const host = parsed.hostname.toLowerCase()

  if (!isNeonHost(host)) {
    throw new NeonIntegrationEnvironmentError(
      [
        `POSTGRES_TEST_URL points at host "${host}", which is not a Neon host.`,
        '',
        'The supported runtime is Vercel/Neon PostgreSQL. This harness deliberately does not',
        'support local PostgreSQL, Docker PostgreSQL, or plain pg.Pool targets, because those are',
        'not part of the application architecture and would test a code path that is never used.',
      ].join('\n'),
    )
  }

  const endpointId = detectNeonEndpointId(host)
  if (!endpointId) {
    throw new NeonIntegrationEnvironmentError(
      'Could not derive a Neon endpoint id (ep-...) from POSTGRES_TEST_URL. Refusing to guess.',
    )
  }

  const database = parsed.pathname.replace(/^\//, '')
  if (!database) {
    throw new NeonIntegrationEnvironmentError(
      'POSTGRES_TEST_URL does not name a database. Refusing to rely on a default.',
    )
  }

  // Independent disposability evidence #1: the endpoint must differ from the application's.
  const appEndpointId = appUrl ? detectNeonEndpointId(safeHostname(appUrl)) : null
  if (appEndpointId && appEndpointId === endpointId) {
    throw new NeonIntegrationEnvironmentError(
      [
        `POSTGRES_TEST_URL targets the same Neon endpoint as POSTGRES_URL (${endpointId}).`,
        '',
        'A different database name on the same endpoint is NOT sufficient: it is the same Neon',
        'compute and the same project. Use a separate disposable branch, which gets its own',
        'endpoint id.',
      ].join('\n'),
    )
  }

  // Independent disposability evidence #2: the database name must not equal the app database.
  if (appUrl) {
    const appDatabase = new URL(
      appUrl.replace(/^postgres(ql)?:\/\//i, 'https://'),
    ).pathname.replace(/^\//, '')
    if (appDatabase && appDatabase === database) {
      throw new NeonIntegrationEnvironmentError(
        `POSTGRES_TEST_URL uses the same database name as POSTGRES_URL ("${database}"). ` +
          'Refusing to run against the application database.',
      )
    }
  }

  // Evidence #3: the operator must have marked the database as disposable. Necessary only.
  if (!database.includes(DISPOSABLE_DB_MARKER)) {
    throw new NeonIntegrationEnvironmentError(
      [
        `POSTGRES_TEST_URL targets database "${database}", which does not contain the required`,
        `marker "${DISPOSABLE_DB_MARKER}".`,
        '',
        'A name containing "test" is not accepted as proof of disposability on its own; the marker',
        'is required in addition to the endpoint-id and database-name checks above.',
      ].join('\n'),
    )
  }

  return { endpointId, database, connectionString: raw }
}

const safeHostname = (connectionString: string): string => {
  try {
    return new URL(connectionString.replace(/^postgres(ql)?:\/\//i, 'https://')).hostname
  } catch {
    return ''
  }
}

/**
 * Must be called immediately before any destructive operation.
 *
 * Re-asserts the explicit opt-in and re-runs the target validation, so a destructive operation
 * can never proceed on an unverified target, even if the environment changed mid-run.
 */
export function assertDestructiveOptIn(
  env: Record<string, string | undefined>,
  target: NeonTestTarget,
): void {
  if (env[DESTRUCTIVE_OPT_IN_ENV] !== 'true') {
    throw new NeonIntegrationEnvironmentError(
      [
        `${DESTRUCTIVE_OPT_IN_ENV} is not set to "true".`,
        '',
        `Refusing to run a destructive operation against ${describeTarget(target.endpointId, target.database)}.`,
        '',
        "Destructive integration setup is opt-in by design. The owner's real Neon database must",
        'never be dropped or recreated automatically.',
      ].join('\n'),
    )
  }

  // Re-validate rather than trusting a value captured earlier.
  const revalidated = resolveNeonTestTarget(env)
  if (revalidated.endpointId !== target.endpointId || revalidated.database !== target.database) {
    throw new NeonIntegrationEnvironmentError(
      'POSTGRES_TEST_URL changed during the run. Refusing to perform a destructive operation.',
    )
  }
}

/**
 * Verifies the process is pointed at the test database, not the application database.
 *
 * `payload.config.ts` builds its pool from `process.env.POSTGRES_URL`. Overwriting it in the test
 * process is what makes the suite safe, and it must only happen after `resolveNeonTestTarget`
 * has proven the two differ.
 */
export function assertProcessPointsAtTestDatabase(
  target: NeonTestTarget,
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.POSTGRES_URL !== target.connectionString) {
    throw new NeonIntegrationEnvironmentError(
      'The Payload config would not use the disposable test database. ' +
        'Refusing to boot Payload, because it could connect to the application database.',
    )
  }
}
