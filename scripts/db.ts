#!/usr/bin/env node
/**
 * What is in the database, and how to start over.
 *
 *   pnpm db:status            tables, enum types, applied migrations, and the verdict
 *   pnpm db:reset --yes       drops the public schema, then runs `pnpm migrate`
 *
 * `db:status` answers the question the app's error messages cannot: *which* objects are already
 * there. It reads the database with `pg` and the same classifier the app uses
 * (`src/lib/database-readiness.ts`), so it works on a database Payload refuses to start on.
 *
 * `db:reset` exists for one specific mess: a migration that stopped partway. The adapter runs each
 * migration inside a transaction, but a connection dropped in the middle — a serverless database
 * suspending, a stopped container — can leave the earlier `CREATE TYPE` statements behind, and
 * every later attempt then dies on `type "…" already exists`. Dropping the schema is the only way
 * back, and it is destructive, so it asks for `--yes` and refuses to throw away rows unless it is
 * given `--force` as well.
 */
import 'dotenv/config'

import { spawnSync } from 'node:child_process'

import pg from 'pg'

import {
  APPLIED_SQL,
  LEFTOVERS_SQL,
  TABLES_SQL,
  connectionFailureOf,
  describeConnectionError,
  describeSchema,
  pgClientOptions,
  type CoreTable,
  type SchemaFacts,
} from '../src/lib/database-readiness'
import { migrations } from '../src/migrations'

const args = process.argv.slice(2)
const command = args[0]
const available = migrations.map((migration) => migration.name)

/** Tables whose rows are worth refusing to delete: accounts and content, not Payload's own. */
const CONTENT_TABLES = ['users', 'articles', 'projects', 'media', 'certificates']

const USAGE = `Usage:
  pnpm db:status              list the tables, enum types and applied migrations, with a verdict
  pnpm db:reset --yes         drop the public schema and run \`pnpm migrate\` (destructive)
  pnpm db:reset --yes --force   also allowed when the tables still hold rows`

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const url = process.env.POSTGRES_URL
if (!url) fail('POSTGRES_URL is not set. Copy .env.example to .env (see docs/getting-started.md).')

/** Host, port and database name, without the credentials. */
const target = (() => {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '')}`
  } catch {
    return 'POSTGRES_URL is not a valid URL'
  }
})()

const connect = async () => {
  const client = new pg.Client(pgClientOptions(url))
  try {
    await client.connect()
  } catch (error) {
    fail(describeConnectionError(connectionFailureOf(error)))
  }
  return client
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

  const { rows: leftoverRows } = await client.query(LEFTOVERS_SQL)
  const { tables: tableCount, enums } = (leftoverRows[0] ?? {}) as { tables?: number; enums?: number }

  return {
    tables,
    hasMigrationsTable,
    applied,
    available,
    leftovers: { tables: Number(tableCount ?? 0), enums: Number(enums ?? 0) },
  }
}

/** Rows in the content tables that exist, so `reset` can say what it would delete. */
const contentRows = async (client: pg.Client): Promise<{ table: string; rows: number }[]> => {
  const { rows } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name = any($1)`,
    [CONTENT_TABLES],
  )
  const found: { table: string; rows: number }[] = []
  for (const { table_name: table } of rows as { table_name: string }[]) {
    const count = await client.query(`select count(*)::int as n from "${table}"`)
    const n = Number((count.rows[0] as { n: number }).n)
    if (n > 0) found.push({ table, rows: n })
  }
  return found
}

const describeTarget = async () => {
  const client = await connect()
  try {
    const { rows } = await client.query('select current_database() as db, version() as version')
    const { db, version } = rows[0] as { db: string; version: string }
    return { db, version: version.split(' ').slice(0, 2).join(' ') }
  } finally {
    await client.end()
  }
}

const status = async () => {
  const client = await connect()
  try {
    const facts = await readFacts(client)
    const report = describeSchema(facts)
    const { rows: tables } = await client.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    )
    const server = (await client.query('select current_database() as db')).rows[0] as { db: string }

    console.log(`\nDatabase: ${target}  (${server.db})`)
    console.log(`Tables:   ${facts.leftovers?.tables ?? tables.length}   Enum types: ${facts.leftovers?.enums ?? 0}`)
    console.log(`History:  ${facts.hasMigrationsTable ? `${facts.applied.length} of ${available.length} migrations applied` : 'no payload_migrations table'}`)

    if (tables.length > 0 && tables.length <= 40) {
      console.log(`\n  ${(tables as { table_name: string }[]).map((row) => row.table_name).join('\n  ')}`)
    }

    console.log()
    if (report.state === 'ready') console.log('✔ The schema is up to date.')
    else console.log(`⚠ ${report.state.toUpperCase()}\n${report.message}`)

    if (report.state !== 'ready') process.exitCode = 1
  } finally {
    await client.end()
  }
}

const reset = async () => {
  if (!args.includes('--yes')) {
    const client = await connect()
    const facts = await readFacts(client)
    const rows = await contentRows(client)
    await client.end()

    console.log(`\nThis would drop every table and type in the public schema of ${target}.`)
    console.log(`  ${facts.leftovers?.tables ?? 0} table(s), ${facts.leftovers?.enums ?? 0} enum type(s)`)
    if (rows.length > 0) {
      console.log(`  Rows that would be lost: ${rows.map((row) => `${row.rows} in ${row.table}`).join(', ')}`)
    }
    fail('Nothing was dropped. Run `pnpm db:reset --yes` to do it.')
  }

  const client = await connect()
  try {
    const rows = await contentRows(client)
    if (rows.length > 0 && !args.includes('--force')) {
      fail(
        `The database still holds rows (${rows
          .map((row) => `${row.rows} in ${row.table}`)
          .join(', ')}).\n  If they really can go, run \`pnpm db:reset --yes --force\`.`,
      )
    }

    console.log(`\nDropping the public schema of ${target} …`)
    await client.query('drop schema public cascade')
    await client.query('create schema public')
    console.log('  ✔ Empty.')
  } finally {
    await client.end()
  }

  console.log('\nRunning `pnpm migrate` …\n')
  const result = spawnSync('pnpm', ['migrate'], { shell: true, stdio: 'inherit' })
  if (result.status !== 0) fail('The migrations failed. The database is empty; fix the cause and run `pnpm migrate`.')

  console.log('\n✔ The schema is in place. Next:')
  console.log('  pnpm admin:create --email you@example.com   the first administrator')
  console.log('  pnpm seed                                   demo content\n')
}

const main = async () => {
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }

  if (command === 'status') {
    const { version } = await describeTarget()
    console.log(`Server:   ${version}`)
    await status()
    return
  }

  if (command === 'reset') return reset()

  fail(`Unknown command "${command}".\n\n${USAGE}`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
