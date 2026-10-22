import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import {
  CORE_TABLES,
  checkSchema,
  describeSchema,
  type SchemaFacts,
} from '@/lib/database-readiness'
import { migrations } from '@/migrations'

/**
 * The database-readiness check (onInit).
 *
 * With schema push off, an unmigrated database answers the first request with Drizzle's raw
 * `Failed query: select "users"…` and the cause (`relation "users" does not exist`) only reaches the
 * server log. The check turns that into a message naming the command to run.
 *
 * Most of this is the pure classifier, so the wording and the states are tested without a database;
 * the live case at the end proves the SQL and the adapter call work against this project's schema.
 */

const allTables = Object.fromEntries(CORE_TABLES.map((table) => [table, true])) as Record<
  (typeof CORE_TABLES)[number],
  boolean
>
const names = migrations.map((migration) => migration.name)

const facts = (overrides: Partial<SchemaFacts> = {}): SchemaFacts => ({
  tables: allTables,
  hasMigrationsTable: true,
  applied: names,
  available: names,
  ...overrides,
})

describe('describeSchema', () => {
  it('is ready when every table exists and every migration is applied', () => {
    const report = describeSchema(facts())
    expect(report.state).toBe('ready')
    expect(report.message).toBe('')
    expect(report.pending).toEqual([])
  })

  it('says the database has no schema, and names `pnpm migrate`, when nothing has been migrated', () => {
    const report = describeSchema(
      facts({ tables: { users: false, articles: false }, hasMigrationsTable: false, applied: [] }),
    )
    expect(report.state).toBe('missing')
    expect(report.message).toContain('no schema')
    expect(report.message).toContain('users, articles')
    expect(report.message).toContain('pnpm migrate')
    // The whole point: it explains the error the developer actually saw.
    expect(report.message).toContain('relation does not exist')
  })

  it('names the one table that is missing', () => {
    const report = describeSchema(
      facts({ tables: { ...allTables, articles: false }, applied: ['20261020_125655_baseline'] }),
    )
    expect(report.state).toBe('missing')
    expect(report.message).toContain('missing table: articles')
  })

  it('asks for `pnpm migrate:adopt` when the tables exist but the history does not', () => {
    const report = describeSchema(facts({ hasMigrationsTable: false, applied: [] }))
    expect(report.state).toBe('unmanaged')
    expect(report.message).toContain('pnpm migrate:adopt')
    expect(report.message).toContain('pnpm migrate')
  })

  it('lists the migrations that have not been applied, in order', () => {
    const report = describeSchema(facts({ applied: names.slice(0, 8) }))
    expect(report.state).toBe('pending')
    expect(report.pending).toEqual(names.slice(8))
    expect(report.message).toContain(names[8])
    expect(report.message).toContain('2 migrations are not applied')
    expect(report.message).toContain('pnpm migrate')
  })

  it('uses the singular for one pending migration', () => {
    const report = describeSchema(facts({ applied: names.slice(0, -1) }))
    expect(report.message).toContain('1 migration is not applied')
  })

  it('reports an unreachable database without blaming the schema', () => {
    const report = describeSchema(
      facts({
        tables: { users: false, articles: false },
        hasMigrationsTable: false,
        applied: [],
        connectionError: 'ECONNREFUSED 127.0.0.1:5432',
      }),
    )
    expect(report.state).toBe('unreachable')
    expect(report.message).toContain('ECONNREFUSED')
    expect(report.message).toContain('POSTGRES_URL')
    // Not "run pnpm migrate": the problem is the connection, not the schema.
    expect(report.message).not.toContain('pnpm migrate')
  })

  it('ignores a migration recorded in the database that no longer exists in the code', () => {
    const report = describeSchema(facts({ applied: [...names, '20200101_000000_removed'] }))
    expect(report.state).toBe('ready')
  })
})

describe('checkSchema against this database', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    // The adapter keeps a pool open; leave the process to vitest.
  })

  it('reads the tables and the applied migrations and reports ready', async () => {
    const report = await checkSchema(payload, names)
    expect(report.state, report.message).toBe('ready')
    expect(report.message).toBe('')
  })

  it('treats an unavailable database as unreachable instead of throwing', async () => {
    // A `db` whose execute always fails stands in for a stopped server or a bad POSTGRES_URL.
    const failing = {
      db: {
        drizzle: {},
        execute: () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5432')),
      },
    }
    const report = await checkSchema(failing, names)
    expect(report.state).toBe('unreachable')
    expect(report.message).toContain('ECONNREFUSED')
  })
})
