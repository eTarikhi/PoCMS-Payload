#!/usr/bin/env node
/**
 * Adopts the baseline migration on a database whose schema already exists, then leaves the rest to
 * `pnpm migrate`.
 *
 * The programme's databases were created by Payload's development schema push, so they have every
 * table but no `payload_migrations` history: `payload migrate` would try to create the tables again
 * and fail halfway. This script records the baseline (`*_baseline`) as applied without running it;
 * every migration created afterwards runs normally.
 *
 *   pnpm migrate:adopt                    # record the baseline as applied
 *   pnpm migrate:adopt --dry-run          # say what would be recorded, change nothing
 *   pnpm migrate:adopt --name 2026…_x     # record one specific migration
 *
 * A fresh, empty database needs no adoption: `pnpm migrate` creates everything from the baseline.
 * Safe to run twice: it reports what is already recorded and exits without writing.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(repo, 'src/migrations')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const nameFlag = args.indexOf('--name')
const requested = nameFlag === -1 ? null : args[nameFlag + 1]

const connectionString = process.env.POSTGRES_URL
if (!connectionString) {
  console.error('POSTGRES_URL is not set (see .env.example).')
  process.exit(1)
}

const migrationNames = fs
  .readdirSync(migrationsDir)
  .filter((file) => /^\d{8}_\d{6}_.+\.ts$/.test(file))
  .map((file) => file.replace(/\.ts$/, ''))
  .sort()

if (migrationNames.length === 0) {
  console.error('No migrations in src/migrations. Run `pnpm migrate:create` first.')
  process.exit(1)
}

const ssl = /^(localhost|127\.0\.0\.1|\[::1\])/.test(new URL(connectionString).hostname)
  ? undefined
  : { rejectUnauthorized: false }
const client = new pg.Client({ connectionString, ssl })

await client.connect()
try {
  const table = await client.query("select to_regclass('public.payload_migrations') as name")
  if (!table.rows[0].name) {
    console.log(
      'This database has no migration history table, so it has never run a migration.\n' +
        'If it is empty, `pnpm migrate` creates the whole schema from the baseline.\n' +
        'If it already has the tables (development schema push), the history table is created by\n' +
        'the first `pnpm migrate`; run it once against a scratch copy, or use\n' +
        '`pnpm migrate:adopt` after the baseline has been applied elsewhere.',
    )
    process.exit(0)
  }

  const { rows } = await client.query('select name, batch from payload_migrations order by id')
  const applied = new Set(rows.map((row) => row.name))

  // Everything but the baseline is a real change and must run. Adopt only a migration whose effect
  // is already in the database: by default the oldest `*_baseline`, or the one --name was given.
  const baseline = migrationNames.find((name) => name.endsWith('_baseline'))
  const target = requested ?? baseline
  if (!target) {
    console.log('No *_baseline migration found. Nothing to adopt; run `pnpm migrate`.')
    process.exit(0)
  }
  if (!migrationNames.includes(target)) {
    console.error(`Unknown migration "${target}". Files:\n  ${migrationNames.join('\n  ')}`)
    process.exit(1)
  }
  if (applied.has(target)) {
    console.log(`Already recorded: ${target} (batch ${rows.find((r) => r.name === target).batch}).`)
    const pending = migrationNames.filter((name) => !applied.has(name))
    console.log(
      pending.length ? `Pending: ${pending.join(', ')}\nRun \`pnpm migrate\`.` : 'Nothing pending.',
    )
    process.exit(0)
  }

  // The schema must already look like the baseline's, or adoption would hide a real migration.
  const schema = await client.query(
    "select to_regclass('public.articles') as articles, to_regclass('public.users') as users",
  )
  if (!schema.rows[0].articles || !schema.rows[0].users) {
    console.error(
      'This database does not have the baseline schema (articles/users missing).\n' +
        'Run `pnpm migrate` to create it instead of adopting.',
    )
    process.exit(1)
  }

  const batch = rows.reduce((max, row) => Math.max(max, Number(row.batch) || 0), 0) + 1 || 1
  console.log(
    `${dryRun ? 'Would record' : 'Recording'} ${target} as applied, batch ${batch} (not running it).`,
  )
  if (!dryRun) {
    await client.query(
      'insert into payload_migrations (name, batch, created_at, updated_at) values ($1, $2, now(), now())',
      [target, batch],
    )
  }
  const pending = migrationNames.filter((name) => name !== target && !applied.has(name))
  console.log(
    pending.length
      ? `Pending after this: ${pending.join(', ')}\nRun \`pnpm migrate\` to apply them.`
      : 'Nothing else pending.',
  )
} finally {
  await client.end()
}
