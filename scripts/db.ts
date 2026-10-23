#!/usr/bin/env node
/**
 * What is in the database, and how to start over.
 *
 *   pnpm db:status            tables, enum types, applied migrations, and the verdict
 *   pnpm db:reset --yes       drops the public schema, then runs `pnpm migrate`
 *   pnpm db:restore <file> --yes   runs a .sql backup from /admin/database into this database
 *   pnpm db:schema-from --from neon    a migration file written from a database's catalogs
 *   pnpm db:seed-from --from neon      a content seed written from a database, `--apply` loads it here
 *
 * The last two read a *source* database — the Neon branch, normally — and write into this checkout.
 * `db:schema-from` is how a branch that drifted ahead of the repository gets a migration again: it
 * asks Postgres what it has and emits the statements, guarded so running them twice changes
 * nothing. `db:seed-from` is how local development gets real content instead of fixtures: it reads
 * the collections this config defines, writes one JSON file, and `--apply` loads it into the local
 * database (deleting those tables' rows first, so it asks for `--yes`). Neither command touches
 * anything it did not read: the seed never includes users, roles, jobs, the audit log or Payload's
 * own tables.
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
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

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
import { inspectRestore, restoreSql } from '../src/plugins/databaseTools/server/restore'
import { buildSchemaMigration } from '../src/plugins/databaseTools/server/schemaMigration'
import {
  applySeedSnapshot,
  buildSeedSnapshot,
  clampSeedRows,
  parseSeedSnapshot,
  seedableCollections,
  type SeedCollection,
  type SeedSnapshot,
} from '../src/plugins/databaseTools/server/seedSnapshot'
import { MAX_SEED_ROWS } from '../src/plugins/databaseTools/options'
import { migrations } from '../src/migrations'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const command = args[0]
const available = migrations.map((migration) => migration.name)

/** Tables whose rows are worth refusing to delete: accounts and content, not Payload's own. */
const CONTENT_TABLES = ['users', 'articles', 'projects', 'media', 'certificates']

const USAGE = `Usage:
  pnpm db:status              list the tables, enum types and applied migrations, with a verdict
  pnpm db:reset --yes         drop the public schema and run \`pnpm migrate\` (destructive)
  pnpm db:reset --yes --force   also allowed when the tables still hold rows
  pnpm db:restore <file.sql>  run a backup from /admin/database (asks for --yes)
  pnpm db:schema-from [--from neon|local|<url>] [--mode guarded|fresh] [--out <dir>]
                      [--tables a,b] [--no-register]
                              write a migration file from a database's catalogs
  pnpm db:seed-from   [--from neon|local|<url>] [--out <file.json>] [--collections a,b]
                      [--max-rows 5000] [--apply --yes]
                              write a content seed from a database; --apply loads it into this one
  pnpm db:seed-apply <file.json> [--yes]
                              replace the rows of the tables the file names with the file's rows

  Argument-free shortcuts (what the admin Terminal and CI run):
    pnpm db:schema-from:neon   = db:schema-from --from neon
    pnpm db:seed-from:neon     = db:seed-from --from neon
    pnpm db:seed-load          = db:seed-apply src/seed/snapshot.json --yes

  --from neon (the default) uses DATABASE_DIRECT_URL, then POSTGRES_URL; --from local always uses
  POSTGRES_URL; --from <url> connects wherever the URL points. Credentials are never printed.`

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const localUrl = process.env.POSTGRES_URL

/** The local database, demanded only by the commands that write to it. */
const requireLocal = (): string => {
  if (!localUrl)
    fail('POSTGRES_URL is not set. Copy .env.example to .env (see docs/getting-started.md).')
  return localUrl
}

/** Host, port and database name, without the credentials. */
const describe = (value: string): string => {
  try {
    const parsed = new URL(value)
    return `${parsed.hostname}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '')}`
  } catch {
    return 'not a valid URL'
  }
}

/** The two parts a generated file names itself with. */
const targetOf = (value: string): { host: string; database: string } => {
  try {
    const parsed = new URL(value)
    return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, '') || 'pocms' }
  } catch {
    return { host: '', database: 'pocms' }
  }
}

const target = localUrl ? describe(localUrl) : 'POSTGRES_URL is not set'

const connectTo = async (url: string) => {
  const client = new pg.Client(pgClientOptions(url))
  try {
    await client.connect()
  } catch (error) {
    fail(describeConnectionError(connectionFailureOf(error)))
  }
  return client
}

const connect = () => connectTo(requireLocal())

/** `--from neon|local|<url>`: which database to read. Defaults to the one the app points at. */
const sourceOf = (): { url: string; label: string } => {
  const at = args.indexOf('--from')
  const raw = at === -1 ? undefined : args[at + 1]
  if (!raw || raw === 'neon') {
    const url = process.env.DATABASE_DIRECT_URL || localUrl
    if (!url) fail('Set DATABASE_DIRECT_URL or POSTGRES_URL, or pass --from <url>.')
    return { url, label: `${describe(url)} (DATABASE_DIRECT_URL or POSTGRES_URL)` }
  }
  if (raw === 'local') {
    const url = requireLocal()
    return { url, label: `${describe(url)} (POSTGRES_URL)` }
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))
    fail(`--from takes neon, local or a postgres:// URL, not "${raw}".`)
  return { url: raw, label: describe(raw) }
}

const optionOf = (flag: string): string | undefined => {
  const at = args.indexOf(flag)
  return at === -1 ? undefined : args[at + 1]
}

/**
 * Where to write: an `--out` that already is a directory, or that does not carry the file's own
 * extension, is a directory the generated name goes into; anything else is the file itself.
 */
const destinationFor = (out: string, filename: string): string => {
  const resolved = path.resolve(repo, out)
  if (fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory())
    return path.join(resolved, filename)
  return path.extname(resolved) === path.extname(filename)
    ? resolved
    : path.join(resolved, filename)
}

/** A path inside the checkout is shown relative to it; anything else is shown as it is. */
const shown = (file: string): string => {
  const relative = path.relative(repo, file)
  return relative.startsWith('..') ? file : relative
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
  const { tables: tableCount, enums } = (leftoverRows[0] ?? {}) as {
    tables?: number
    enums?: number
  }

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
    console.log(
      `Tables:   ${facts.leftovers?.tables ?? tables.length}   Enum types: ${facts.leftovers?.enums ?? 0}`,
    )
    console.log(
      `History:  ${facts.hasMigrationsTable ? `${facts.applied.length} of ${available.length} migrations applied` : 'no payload_migrations table'}`,
    )

    if (tables.length > 0 && tables.length <= 40) {
      console.log(
        `\n  ${(tables as { table_name: string }[]).map((row) => row.table_name).join('\n  ')}`,
      )
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
    console.log(
      `  ${facts.leftovers?.tables ?? 0} table(s), ${facts.leftovers?.enums ?? 0} enum type(s)`,
    )
    if (rows.length > 0) {
      console.log(
        `  Rows that would be lost: ${rows.map((row) => `${row.rows} in ${row.table}`).join(', ')}`,
      )
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
  if (result.status !== 0)
    fail('The migrations failed. The database is empty; fix the cause and run `pnpm migrate`.')

  console.log('\n✔ The schema is in place. Next:')
  console.log('  pnpm admin:create --email you@example.com   the first administrator')
  console.log('  pnpm seed                                   demo content\n')
}

/**
 * Restore a backup from the admin's database page. The same checks as the endpoint (`restore.ts`),
 * plus a terminal confirmation: these are the operations that can replace content.
 */
const restore = async () => {
  const file = args[1]
  if (!file || file.startsWith('-')) fail(`Name the backup file.\n\n${USAGE}`)

  let sql: string
  try {
    sql = readFileSync(file, 'utf8')
  } catch {
    fail(`Cannot read ${file}.`)
  }

  const client = await connect()
  try {
    const inspection = await inspectRestore(client, sql)
    if (inspection.refusal) fail(inspection.refusal)

    console.log(`\n${file}`)
    console.log(`  ${inspection.statements} statements, ${inspection.tables.length} tables`)
    console.log(
      `  ${inspection.transactional ? 'Has' : 'Has no'} BEGIN/COMMIT — ${
        inspection.transactional
          ? 'a failure rolls back'
          : 'a failure leaves earlier statements applied'
      }`,
    )
    if (inspection.existing.length > 0) {
      console.log(
        `  The database already holds: ${inspection.existing
          .map((entry) => `${entry.rows} in ${entry.table}`)
          .join(', ')}`,
      )
      if (!args.includes('--yes'))
        fail('Nothing was restored. Add --yes to add the file to this content.')
    } else if (!args.includes('--yes')) {
      fail(`Nothing was restored. Add --yes to run it into ${target}.`)
    }

    console.log(`\nRestoring into ${target} …`)
    const result = await restoreSql(client, sql, { force: true })
    console.log(`  ✔ ${result.tables} tables after ${result.durationMs} ms`)
    if (result.after.length > 0) {
      console.log(`  ${result.after.map((entry) => `${entry.rows} in ${entry.table}`).join(', ')}`)
    }
    console.log(`\n${result.message}`)
    console.log('\nNext: check the site and /admin; a restore does not run migrations.\n')
  } finally {
    await client.end()
  }
}

/**
 * A migration file written from a database's catalogs. The default mode guards every statement, so
 * the file can be committed next to the existing migrations and run anywhere — including against
 * the database it was generated from, where it changes nothing.
 */
const schemaFrom = async () => {
  const mode = optionOf('--mode') === 'fresh' ? 'fresh' : 'guarded'
  const out = optionOf('--out') ?? path.join(repo, 'src/migrations')
  const tables = optionOf('--tables')
    ?.split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const source = sourceOf()

  const client = await connectTo(source.url)
  let file
  try {
    console.log(`\nReading the schema of ${source.label} …`)
    file = await buildSchemaMigration(client, {
      mode,
      ...(tables && tables.length > 0 ? { tables } : {}),
    })
  } finally {
    await client.end()
  }

  const destination = destinationFor(out, file.filename)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, file.content, 'utf8')

  console.log(`  ✔ ${shown(destination)}`)
  console.log(
    `    ${file.tables} table(s), ${file.statements} statement(s), ${
      file.groups.types.length
    } enum type(s), mode ${file.mode}`,
  )

  const inMigrations = path.dirname(destination) === path.join(repo, 'src/migrations')
  if (inMigrations && mode === 'guarded' && !args.includes('--no-register')) {
    const registered = registerMigration(file.name)
    console.log(
      registered
        ? `    Registered in src/migrations/index.ts, so \`pnpm migrate\` will run it.`
        : `    Already registered in src/migrations/index.ts.`,
    )
  } else if (inMigrations && mode === 'fresh') {
    console.log(
      `    Not registered: a fresh-mode file recreates tables the baseline already creates.\n` +
        `    Register it by hand only for a database that starts from this file alone.`,
    )
  } else if (!inMigrations) {
    console.log(`    Outside src/migrations, so it is not registered; move it there to run it.`)
  }

  console.log('\nNext:')
  console.log('  review the file, then `pnpm migrate` (a guarded snapshot is safe to run twice)')
  console.log(
    '  on a database that already has this schema: `pnpm migrate:adopt --name ' + file.name + '`\n',
  )
}

/**
 * Append one migration to `src/migrations/index.ts` — the import and the array entry. Payload's own
 * generator writes this file, and a migration that is not in it never runs, so the script does the
 * edit rather than leaving it as a note. Returns false when the entry is already there.
 */
const registerMigration = (name: string): boolean => {
  const indexFile = path.join(repo, 'src/migrations/index.ts')
  const current = fs.readFileSync(indexFile, 'utf8')
  if (current.includes(`'${name}'`)) return false

  const importLine = `import * as migration_${name} from './${name}';\n`
  const anchor = '\nexport const migrations = ['
  if (!current.includes(anchor)) {
    console.log('    Could not find `export const migrations = [` to register it; add it by hand.')
    return false
  }
  const entry = `  {\n    up: migration_${name}.up,\n    down: migration_${name}.down,\n    name: '${name}'\n  },\n`
  const withImport = current.replace(anchor, `${importLine}${anchor}`)
  const closing = withImport.lastIndexOf('];')
  const registered = `${withImport.slice(0, closing)}${entry}${withImport.slice(closing)}`
  fs.writeFileSync(indexFile, registered, 'utf8')
  return true
}

/**
 * A content seed written from a database, and optionally loaded into the local one.
 *
 * The collections come from this checkout's Payload config, so the seed follows the schema the code
 * expects rather than whatever tables happen to exist. Rows are read by Postgres and written back
 * with `jsonb_populate_recordset`, which keeps enums, timestamps, `jsonb` and arrays exact, and the
 * sequences are set past the highest id so the next insert does not collide with a seeded row.
 */
const seedFrom = async () => {
  const out = optionOf('--out') ?? path.join(repo, 'src/seed/snapshot.json')
  const rawMax = optionOf('--max-rows')
  if (rawMax !== undefined && !/^\d+$/.test(rawMax.trim()))
    fail('--max-rows must be a whole number of rows, at least 1.')
  const maxRows = clampSeedRows(rawMax, MAX_SEED_ROWS)
  const requested = optionOf('--collections')
    ?.split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
  const source = sourceOf()

  // The config is imported here, not at the top: reading it costs a few seconds and only this
  // command needs it. `buildConfig` describes the schema; it does not connect to a database.
  const { default: config } = await import('../src/payload.config')
  const resolved = await config
  const collections: SeedCollection[] = resolved.collections.map((collection) => ({
    slug: collection.slug,
    dbName:
      typeof collection.dbName === 'function'
        ? collection.dbName({ tableName: collection.slug })
        : (collection.dbName ?? null),
    auth: Boolean(collection.auth),
  }))
  const seedable = seedableCollections(collections)
  const chosen =
    requested && requested.length > 0
      ? seedable.filter((slug) => requested.includes(slug))
      : seedable
  if (requested && requested.length > 0) {
    const ignored = requested.filter((slug) => !seedable.includes(slug))
    if (ignored.length > 0) console.log(`\n  Not seedable, so left out: ${ignored.join(', ')}`)
  }

  const client = await connectTo(source.url)
  let snapshotFile: { snapshot: SeedSnapshot; json: string; filename: string }
  try {
    console.log(`\nReading ${chosen.length} collection(s) from ${source.label} …`)
    snapshotFile = await buildSeedSnapshot(client, {
      collections: collections.filter((collection) => chosen.includes(collection.slug)),
      globals: requested && requested.length > 0 ? [] : resolved.globals.map((g) => g.slug),
      maxRowsPerTable: maxRows,
      target: targetOf(source.url),
    })
  } finally {
    await client.end()
  }

  const destination = destinationFor(out, snapshotFile.filename)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, snapshotFile.json, 'utf8')

  const { snapshot } = snapshotFile
  console.log(`  ✔ ${shown(destination)}`)
  console.log(
    `    ${snapshot.counts.tables} table(s), ${snapshot.counts.rows} row(s), ${(
      Buffer.byteLength(snapshotFile.json, 'utf8') / 1024
    ).toFixed(0)} kB`,
  )
  for (const warning of snapshot.warnings) console.log(`    ⚠ ${warning}`)
  console.log(
    '\n  Review it before committing: this file holds whatever the source database holds.',
  )

  if (!args.includes('--apply')) {
    console.log('\n  Load it into this checkout’s database with:')
    console.log(`    pnpm db:seed-apply ${shown(destination)} --yes`)
    if (destination === path.join(repo, 'src/seed/snapshot.json'))
      console.log('    pnpm db:seed-load            (the same file, no arguments to get wrong)')
    console.log('  or generate and apply in one step: add --apply --yes.\n')
    return
  }

  if (!args.includes('--yes')) {
    fail(
      `Applying replaces the rows of ${snapshot.counts.tables} table(s) in ${target}.\n` +
        '  Nothing was written. Add --yes to do it.',
    )
  }

  const local = await connect()
  try {
    console.log(`\nApplying into ${target} …`)
    const result = await applySeedSnapshot(local, parseSeedSnapshot(snapshotFile.json))
    console.log(
      `  ✔ ${result.tables.length} table(s), ${result.rows} row(s), ${result.sequences} sequence(s) set`,
    )
    const replaced = result.tables.filter((table) => table.deleted > 0)
    if (replaced.length > 0)
      console.log(`    replaced rows in ${replaced.map((table) => table.name).join(', ')}`)
    console.log('\nNext: `pnpm dev` and look at the site; media files stay in the blob store.\n')
  } finally {
    await local.end()
  }
}

/** Apply a seed file that is already on disk (the second half of `db:seed-from --apply`). */
const seedApply = async () => {
  const file = args[1]
  if (!file || file.startsWith('-')) fail(`Name the seed file.\n\n${USAGE}`)

  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    fail(`Cannot read ${file}.`)
  }

  let snapshot: SeedSnapshot
  try {
    snapshot = parseSeedSnapshot(text)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }

  if (!args.includes('--yes')) {
    console.log(
      `\nThis replaces the rows of ${snapshot.tables.length} table(s) in ${target} ` +
        `with ${snapshot.counts.rows} row(s) from ${snapshot.source.database || 'the file'}.`,
    )
    fail('Nothing was written. Run `pnpm db:seed-apply <file> --yes` to do it.')
  }

  const client = await connect()
  try {
    const result = await applySeedSnapshot(client, snapshot)
    console.log(
      `\n✔ ${result.tables.length} table(s), ${result.rows} row(s), ${result.sequences} sequence(s) set in ${target}`,
    )
    for (const warning of result.warnings) console.log(`  ⚠ ${warning}`)
  } finally {
    await client.end()
  }
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
  if (command === 'restore') return restore()
  if (command === 'schema-from') return schemaFrom()
  if (command === 'seed-from') return seedFrom()
  if (command === 'seed-apply') return seedApply()

  fail(`Unknown command "${command}".\n\n${USAGE}`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
