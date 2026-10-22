#!/usr/bin/env node
/**
 * Before `next dev` starts: is there a database to talk to?
 *
 * Payload's `onInit` already refuses to serve an unmigrated database, but by then the browser is
 * open and the admin shows "This page couldn't load" with the detail only in the terminal. Running
 * the same check first means `pnpm dev` stops immediately with the command to run, before any of
 * that — which is where a developer hits it (a fresh clone, a reset container, a restored dump).
 *
 *   pnpm preflight        print the state; exit 1 when the database cannot be used
 *
 * Transient connection failures are retried: `ECONNRESET` is normal for a container or proxy that
 * has just been started, and a single reset should not be reported as a broken setup. If the
 * database is still unreachable after the retries, the script fails, because a dev server without
 * one can only render errors. To start it anyway (to work on something that does not read the
 * database), run `pnpm exec next dev` directly.
 */
import 'dotenv/config'

import pg from 'pg'

import {
  APPLIED_SQL,
  TABLES_SQL,
  connectionFailureOf,
  describeConnectionError,
  describeSchema,
  type CoreTable,
  type ConnectionTarget,
  type SchemaFacts,
} from '../src/lib/database-readiness'
import { migrations } from '../src/migrations'

const available = migrations.map((migration) => migration.name)
const connectionString: string | undefined = process.env.POSTGRES_URL

/** Connection errors that usually mean "not ready yet" rather than "misconfigured". */
const TRANSIENT = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE'])
const ATTEMPTS = 4
const BACKOFF_MS = [400, 800, 1600]

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

if (!connectionString) {
  fail('POSTGRES_URL is not set. Copy .env.example to .env (see docs/getting-started.md).')
}
const url = connectionString

const parsed = new URL(url)
const target: ConnectionTarget = {
  host: parsed.hostname,
  port: parsed.port || '5432',
  database: parsed.pathname.replace(/^\//, ''),
}

// Local databases are reached directly; anything else may need TLS, as in the Payload adapter.
const ssl = /^(localhost|127\.0\.0\.1|\[::1\])/.test(parsed.hostname)
  ? undefined
  : { rejectUnauthorized: false }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Connect, retrying the failures that are usually a server still starting. Returns the client, or
 * the last failure's reason.
 */
const connect = async (): Promise<{ client?: pg.Client; failure?: string }> => {
  let failure: ReturnType<typeof connectionFailureOf> | undefined

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const client = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 10_000 })
    try {
      await client.connect()
      return { client }
    } catch (error) {
      failure = connectionFailureOf(error)
      await client.end().catch(() => undefined)

      const transient = failure.code !== undefined && TRANSIENT.has(failure.code)
      if (!transient || attempt === ATTEMPTS) break

      const wait = BACKOFF_MS[attempt - 1] ?? 1600
      console.warn(
        `  … ${failure.code} on attempt ${attempt}/${ATTEMPTS}, retrying in ${wait} ms ` +
          `(${target.host}:${target.port})`,
      )
      await sleep(wait)
    }
  }

  return { failure: describeConnectionError(failure ?? { message: 'unknown error' }) }
}

const readFacts = async (client: pg.Client): Promise<SchemaFacts> => {
  const { rows: tableRows } = await client.query(TABLES_SQL)
  const [tableRow] = tableRows as Record<string, boolean>[]
  const tables = Object.fromEntries(
    (['users', 'articles'] as CoreTable[]).map((table) => [table, tableRow?.[table] === true]),
  ) as SchemaFacts['tables']
  const hasMigrationsTable = tableRow?.payload_migrations === true

  const applied = hasMigrationsTable
    ? ((await client.query(APPLIED_SQL)).rows as { name: string }[]).map((row) => row.name)
    : []

  return { tables, hasMigrationsTable, applied, available }
}

const { client, failure } = await connect()

if (!client) {
  // A dev server without a database can only render errors; say so here, not in the browser.
  fail(`${failure}\n  pnpm exec next dev   start anyway, without a database`)
}

try {
  const report = describeSchema(await readFacts(client))

  if (report.state === 'ready') {
    console.log(`✔ Database ready (${available.length} migrations applied).`)
  } else if (report.state === 'pending') {
    // A stale column only affects some screens; it should not stop the dev server.
    console.warn(`\n⚠ ${report.message}\n`)
  } else {
    fail(report.message)
  }
} catch (error) {
  // The connection worked but the inspection did not (a permission problem, a schema mid-change).
  // Let the app report it on start rather than blocking every command on it.
  console.warn(`\n⚠ Could not check the database: ${connectionFailureOf(error).message}`)
} finally {
  await client.end().catch(() => undefined)
}
