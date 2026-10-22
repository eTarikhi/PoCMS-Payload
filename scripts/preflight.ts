#!/usr/bin/env node
/**
 * Before `next dev` starts: is there a database to talk to?
 *
 * Payload's `onInit` already refuses to serve an unmigrated database, but by then the browser is
 * open and the admin shows "This page couldn't load" with the detail only in the terminal. Running
 * the same check first means `pnpm dev` stops immediately with the command to run, before any of
 * that — which is where a developer hits it (a fresh clone, a reset container, a restored dump).
 *
 *   pnpm preflight        print the state; exit 1 when the database has no schema
 *
 * The classification is the one `onInit` uses (`describeSchema` in src/lib/database-readiness.ts):
 * only "no schema" is fatal here. Pending migrations and an unreachable database are warnings,
 * because the dev server may still come up (the database may be starting, and a stale column only
 * affects some screens).
 */
import 'dotenv/config'

import pg from 'pg'

import {
  APPLIED_SQL,
  TABLES_SQL,
  describeSchema,
  type CoreTable,
  type SchemaFacts,
} from '../src/lib/database-readiness'
import { migrations } from '../src/migrations'

const available = migrations.map((migration) => migration.name)
const connectionString: string | undefined = process.env.POSTGRES_URL

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

if (!connectionString) {
  fail('POSTGRES_URL is not set. Copy .env.example to .env (see docs/getting-started.md).')
}
const url = connectionString

// Local databases are reached directly; anything else may need TLS, as in the Payload adapter.
const ssl = /^(localhost|127\.0\.0\.1|\[::1\])/.test(new URL(url).hostname)
  ? undefined
  : { rejectUnauthorized: false }

const client = new pg.Client({ connectionString: url, ssl })

const readFacts = async (): Promise<SchemaFacts> => {
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

try {
  await client.connect()
} catch (error) {
  // The server may not be up yet; `next dev` can still start and retry per request.
  console.warn(
    `\n⚠ The database could not be reached: ${error instanceof Error ? error.message : String(error)}`,
  )
  console.warn('  Check POSTGRES_URL and that Postgres is running (docker compose up -d db).\n')
  process.exit(0)
}

try {
  const report = describeSchema(await readFacts())

  if (report.state === 'ready') {
    console.log(`✔ Database ready (${available.length} migrations applied).`)
  } else if (report.state === 'pending') {
    console.warn(`\n⚠ ${report.message}\n`)
  } else {
    fail(report.message)
  }
} catch (error) {
  // A failed inspection should not block development: the app will say the same thing on start.
  console.warn(
    `\n⚠ Could not check the database: ${error instanceof Error ? error.message : String(error)}`,
  )
} finally {
  await client.end().catch(() => undefined)
}
