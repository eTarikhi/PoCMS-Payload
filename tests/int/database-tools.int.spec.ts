import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { CAPABILITIES, hasCapability } from '@/access/permissions'
import { buildJsonBackup, buildSqlBackup, NO_ROWS_BY_DEFAULT } from '@/database/backup'
import { databaseTarget, quoteIdent, quoteTable } from '@/database/connection'
import { pgClientOptions } from '@/lib/database-readiness'
import { listTables, overview, readRows, resolveTable, tableDetail } from '@/database/introspection'
import { runMaintenance } from '@/database/maintenance'
import { NeonClient, NeonError, neonConsoleUrl } from '@/database/neon'
import { applyRepair, runRepairChecks } from '@/database/repair'
import { inspectRestore, RestoreRefused, restoreSql } from '@/database/restore'
import { validateTableSelection } from '@/database/selection'
import { migrations } from '@/migrations'

/**
 * The database tools behind /admin/database.
 *
 * Most of this is tested live against this project's database — the SQL is the part that can be
 * wrong in a way a mock would not catch. The Neon client is the exception: it is the control plane,
 * so a fake `fetch` records the requests and returns the shapes the API documents, and the test
 * asserts the paths and bodies rather than the network.
 */

const known = migrations.map((migration) => migration.name)

describe('databaseTarget', () => {
  const original = { ...process.env }

  afterAll(() => {
    process.env = { ...original }
  })

  it('reports host, port and database, and never the credentials', () => {
    process.env.POSTGRES_URL = 'postgres://user:secret@db.example.com:6543/portfolio'
    delete process.env.DATABASE_DIRECT_URL
    const target = databaseTarget()
    expect(target).toMatchObject({ host: 'db.example.com', port: '6543', database: 'portfolio' })
    expect(JSON.stringify(target)).not.toContain('secret')
    expect(JSON.stringify(target)).not.toContain('user')
  })

  it('prefers DATABASE_DIRECT_URL and recognises a pooled Neon host', () => {
    process.env.POSTGRES_URL = 'postgres://u:p@ep-a-pooler.eu-central-1.aws.neon.tech/app'
    process.env.DATABASE_DIRECT_URL = 'postgres://u:p@ep-a.eu-central-1.aws.neon.tech/app'
    const target = databaseTarget()
    expect(target.source).toBe('DATABASE_DIRECT_URL')
    expect(target.pooled).toBe(false)
    expect(target.host).toBe('ep-a.eu-central-1.aws.neon.tech')
  })

  it('flags the pooled endpoint', () => {
    process.env.POSTGRES_URL = 'postgres://u:p@ep-a-pooler.eu-central-1.aws.neon.tech/app'
    delete process.env.DATABASE_DIRECT_URL
    expect(databaseTarget().pooled).toBe(true)
  })

  it('is empty rather than throwing when nothing is set', () => {
    delete process.env.POSTGRES_URL
    delete process.env.DATABASE_DIRECT_URL
    expect(databaseTarget()).toMatchObject({ host: '', source: 'none' })
  })

  it('quotes identifiers and tables', () => {
    expect(quoteIdent('articles')).toBe('"articles"')
    expect(quoteIdent('odd"name')).toBe('"odd""name"')
    expect(quoteTable('articles')).toBe('"public"."articles"')
  })
})

describe('validateTableSelection', () => {
  it('treats no selection as every table', () => {
    expect(validateTableSelection(null)).toEqual({ ok: true })
    expect(validateTableSelection('')).toEqual({ ok: true })
    expect(validateTableSelection(' , ')).toEqual({ ok: true })
  })

  it('accepts names, trims them and drops duplicates', () => {
    expect(validateTableSelection(' articles, users ,articles')).toEqual({
      ok: true,
      tables: ['articles', 'users'],
    })
  })

  it('refuses names that cannot be a table', () => {
    const result = validateTableSelection('articles; drop table users')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Not a table name')
  })
})

describe('the migration registry covers the capability', () => {
  it('has a capability for the database tools', () => {
    const capability = CAPABILITIES.find((entry) => entry.name === 'manageDatabase')
    expect(capability?.label).toBe('Database tools')
    expect(capability?.description).toContain('back up')
  })

  it('is not granted by a role without it', () => {
    const user = {
      permissions: { fullAccess: false, roles: ['Editor'], levels: {}, capabilities: [] },
    }
    expect(hasCapability(user, 'manageDatabase')).toBe(false)
    expect(
      hasCapability(
        { permissions: { ...user.permissions, capabilities: ['manageDatabase'] } },
        'manageDatabase',
      ),
    ).toBe(true)
  })

  it('is a field on the roles collection, so it can be granted', async () => {
    const resolved = await config
    const roles = resolved.collections.find((collection) => collection.slug === 'roles')
    const group = roles?.fields.find((field) => 'name' in field && field.name === 'capabilities')
    const names =
      group && 'fields' in group
        ? group.fields.map((field) => ('name' in field ? field.name : ''))
        : []
    expect(names).toContain('manageDatabase')
    expect(known).toContain('20261022_140000_database_tools_capability')
  })
})

describe('the database tools, live', () => {
  let client: pg.Client

  beforeAll(async () => {
    // One connection for the whole file: these are reads and small maintenance runs.
    client = new pg.Client(pgClientOptions(process.env.POSTGRES_URL as string))
    await client.connect()
  }, 60_000)

  afterAll(async () => {
    await client.end()
  })

  it('lists the app’s tables and reads the overview', async () => {
    const tables = await listTables(client)
    const names = tables.map((table) => table.name)
    expect(names).toContain('users')
    expect(names).toContain('articles')
    expect(names).toContain('payload_migrations')
    // Largest first: the order the page shows.
    expect(tables[0]?.bytes).toBeGreaterThanOrEqual(tables[tables.length - 1]?.bytes ?? 0)

    const summary = await overview(client)
    expect(summary.version).toContain('PostgreSQL')
    expect(summary.tables.length).toBe(tables.length)
    expect(summary.migrations.map((migration) => migration.name)).toEqual(known)
    expect(summary.connections).toBeGreaterThan(0)
    expect(summary.cacheHitRatio).toBeGreaterThanOrEqual(0)
    expect(summary.cacheHitRatio).toBeLessThanOrEqual(1)
  })

  it('describes a table: columns, primary key, indexes, constraints', async () => {
    const detail = await tableDetail(client, 'articles')
    expect(detail.table.name).toBe('articles')
    expect(detail.columns.find((column) => column.name === 'id')?.primaryKey).toBe(true)
    expect(detail.columns.some((column) => column.name === 'slug')).toBe(true)
    expect(detail.indexes.some((index) => index.primary)).toBe(true)
    expect(detail.indexes.every((index) => index.valid)).toBe(true)
    expect(detail.constraints.length).toBeGreaterThan(0)
  })

  it('pages rows without needing a primary key in the query', async () => {
    const first = await readRows(client, 'articles', { limit: 2, offset: 0 })
    expect(first.rows.length).toBeLessThanOrEqual(2)
    expect(first.total).toBeGreaterThanOrEqual(first.rows.length)
    expect(first.rows[0]).toHaveProperty('id')
    if (first.total > 2) {
      const second = await readRows(client, 'articles', { limit: 2, offset: 2 })
      expect(second.rows[0]).not.toEqual(first.rows[0])
    }
  })

  it('refuses a table that is not there, and a suspicious name', async () => {
    expect(await resolveTable(client, 'nope_not_here')).toBeNull()
    expect(await resolveTable(client, 'articles; drop table users')).toBeNull()
    await expect(tableDetail(client, 'nope_not_here')).rejects.toThrow(/no table called/)
  })

  it('writes a dump that Postgres can read back, in the documented order', async () => {
    const backup = await buildSqlBackup(client, { tables: ['articles', 'users'] })
    expect(backup.filename).toMatch(/\.sql$/)
    expect(backup.tables.map((table) => table.name).sort()).toEqual(['articles', 'users'])
    expect(backup.sql).toContain('BEGIN;')
    expect(backup.sql).toContain('COMMIT;')
    expect(backup.sql).toContain('CREATE TABLE "public"."articles"')
    expect(backup.sql).toContain('INSERT INTO articles (')
    // The migration history is part of a full backup; a selected subset is not.
    expect(backup.skipped).toContain('users_rels')
    expect(backup.sql).not.toContain('CREATE TABLE "public"."users_rels"')
    expect(backup.rows).toBeGreaterThan(0)
  })

  it('leaves locks and preferences without rows, but keeps their tables', async () => {
    const backup = await buildSqlBackup(client)
    for (const table of NO_ROWS_BY_DEFAULT) {
      expect(backup.sql).toContain(`CREATE TABLE "public"."${table}"`)
      expect(backup.sql).not.toContain(`INSERT INTO ${table} (`)
    }
    expect(backup.sql).toContain('CREATE TABLE "public"."payload_migrations"')
    expect(backup.sql).toContain('INSERT INTO payload_migrations (')
    expect(backup.skipped).toEqual([])
  })

  it('can produce a schema-only dump and a JSON one', async () => {
    const schema = await buildSqlBackup(client, { tables: ['articles'], includeData: false })
    expect(schema.sql).toContain('CREATE TABLE "public"."articles"')
    expect(schema.sql).not.toContain('INSERT INTO articles (')
    expect(schema.sql).toContain('SCHEMA ONLY')

    const json = await buildJsonBackup(client, { tables: ['articles'] })
    const parsed = JSON.parse(json.json) as {
      format: string
      tables: { name: string; rows: unknown[]; columns: { name: string }[] }[]
    }
    expect(parsed.format).toBe('pocms-backup')
    expect(parsed.tables).toHaveLength(1)
    expect(parsed.tables[0].name).toBe('articles')
    expect(parsed.tables[0].columns.map((column) => column.name)).toContain('slug')
    expect(json.filename).toMatch(/\.json$/)
  })

  it('inspects a restore file without running it', async () => {
    const backup = await buildSqlBackup(client, { tables: ['articles'] })
    const inspection = await inspectRestore(client, backup.sql)
    expect(inspection.refusal).toBeUndefined()
    expect(inspection.transactional).toBe(true)
    expect(inspection.tables).toContain('articles')
    expect(inspection.statements).toBeGreaterThan(5)
    expect(inspection.existing.map((entry) => entry.table)).toContain('users')
  })

  it('refuses a restore into a database that holds content, and runs it when forced', async () => {
    const sql = 'BEGIN;\nCREATE TABLE IF NOT EXISTS tool_probe ("id" integer PRIMARY KEY);\nCOMMIT;'
    await expect(restoreSql(client, sql)).rejects.toBeInstanceOf(RestoreRefused)

    const result = await restoreSql(client, sql, { force: true })
    expect(result.ok).toBe(true)
    expect(result.tables).toBeGreaterThan(0)
    await client.query('drop table if exists tool_probe')
  })

  it('refuses a file that touches the server rather than this database', async () => {
    for (const sql of [
      'DROP DATABASE postgres;',
      'ALTER SYSTEM SET work_mem = 1;',
      '\\connect other',
      'CREATE ROLE someone;',
    ]) {
      const inspection = await inspectRestore(client, sql)
      expect(inspection.refusal, sql).toBeDefined()
    }
    await expect(
      restoreSql(client, 'DROP DATABASE postgres;', { force: true }),
    ).rejects.toBeInstanceOf(RestoreRefused)
  })

  it('runs ANALYZE and VACUUM and finds no invalid index', async () => {
    const analyze = await runMaintenance(client, 'analyze')
    expect(analyze.statements).toEqual(['ANALYZE;'])
    expect(analyze.durationMs).toBeGreaterThanOrEqual(0)

    const vacuum = await runMaintenance(client, 'vacuum-analyze', 'articles')
    expect(vacuum.table).toBe('articles')
    expect(vacuum.statements).toEqual(['ANALYZE "articles";', 'VACUUM "articles";'])

    const reindex = await runMaintenance(client, 'reindex')
    expect(reindex.detail).toBe('No invalid index.')
  })

  it('runs every health check and fixes what is fixable', async () => {
    const report = await runRepairChecks(client, known)
    expect(report.checks.map((check) => check.id)).toEqual([
      'migrations',
      'sequences',
      'orphans',
      'indexes',
      'statistics',
      'bloat',
      'primary-keys',
    ])
    const migrationsCheck = report.checks.find((check) => check.id === 'migrations')
    expect(migrationsCheck?.status).toBe('ok')
    expect(migrationsCheck?.summary).toContain(String(known.length))

    // The live database is migrated: nothing pending, nothing unknown.
    const sequences = report.checks.find((check) => check.id === 'sequences')
    expect(sequences?.status).toBe('ok')

    const indexes = await applyRepair(client, 'indexes')
    expect(indexes.fixed).toBe(0)
    const stats = await applyRepair(client, 'statistics')
    expect(stats.check).toBe('statistics')
  })

  it('repairs a sequence that is behind its rows', async () => {
    await client.query('drop table if exists seq_probe')
    await client.query('create table seq_probe (id serial primary key, v text)')
    await client.query("insert into seq_probe (v) values ('a'), ('b')")
    await client.query("select setval('seq_probe_id_seq', 1, true)")
    try {
      const before = await runRepairChecks(client, known)
      const check = before.checks.find((entry) => entry.id === 'sequences')
      expect(check?.status).toBe('error')
      expect(check?.summary).toContain('duplicate key')

      const fixed = await applyRepair(client, 'sequences')
      expect(fixed.fixed).toBeGreaterThanOrEqual(1)
      expect(fixed.statements.join(' ')).toContain('setval')

      const after = await runRepairChecks(client, known)
      expect(after.checks.find((entry) => entry.id === 'sequences')?.status).toBe('ok')
      const inserted = await client.query<{ id: number }>(
        "insert into seq_probe (v) values ('c') returning id",
      )
      expect(Number(inserted.rows[0].id)).toBe(3)
    } finally {
      await client.query('drop table seq_probe')
    }
  }, 30_000)

  it('rebuilds an index a failed concurrent build left invalid', async () => {
    await client.query('drop table if exists idx_probe')
    await client.query('create table idx_probe (id serial primary key, v int)')
    await client.query('insert into idx_probe (v) values (1), (1)')
    try {
      await expect(
        client.query('create unique index concurrently idx_probe_v on idx_probe (v)'),
      ).rejects.toThrow()

      const report = await runRepairChecks(client, known)
      const check = report.checks.find((entry) => entry.id === 'indexes')
      expect(check?.status).toBe('error')
      expect(check?.details.join(' ')).toContain('idx_probe_v')

      // The duplicate is why the build failed; the repair can only succeed once it is gone.
      await client.query('delete from idx_probe where id = (select max(id) from idx_probe)')
      const result = await runMaintenance(client, 'reindex')
      expect(result.detail).toBe('Rebuilt 1 index.')
      expect(result.statements).toEqual(['REINDEX INDEX CONCURRENTLY "idx_probe_v";'])

      const valid = await client.query<{ indisvalid: boolean }>(
        "select indisvalid from pg_index where indexrelid = 'idx_probe_v'::regclass",
      )
      expect(valid.rows[0].indisvalid).toBe(true)
    } finally {
      await client.query('drop table idx_probe')
    }
  }, 30_000)

  it('deletes relation rows whose parent is gone', async () => {
    // Payload's own relation tables have a foreign key, so an orphan cannot exist there. The check
    // exists for a database where the constraint was lost (an import, a hand-edited restore), which
    // is what this scratch pair imitates.
    await client.query('drop table if exists orphan_probe_rels')
    await client.query('drop table if exists orphan_probe')
    await client.query('create table orphan_probe (id serial primary key, name text)')
    await client.query(
      'create table orphan_probe_rels (id serial primary key, "order" int, parent_id int not null, path text)',
    )
    await client.query("insert into orphan_probe_rels (parent_id, path) values (424242, 'roles')")
    try {
      const report = await runRepairChecks(client, known)
      const check = report.checks.find((entry) => entry.id === 'orphans')
      expect(check?.status).toBe('warn')
      expect(check?.details.join(' ')).toContain('orphan_probe_rels')

      const fixed = await applyRepair(client, 'orphans')
      expect(fixed.fixed).toBe(1)
      const left = await client.query<{ n: string }>('select count(*) as n from orphan_probe_rels')
      expect(Number(left.rows[0].n)).toBe(0)
    } finally {
      await client.query('drop table orphan_probe_rels')
      await client.query('drop table orphan_probe')
    }
  }, 30_000)

  it('reports a partly-migrated database as a problem, not as healthy', async () => {
    const report = await runRepairChecks(client, [...known, '20990101_000000_not_in_this_checkout'])
    const migrationsCheck = report.checks.find((check) => check.id === 'migrations')
    expect(migrationsCheck?.status).toBe('error')
    expect(migrationsCheck?.summary).toContain('1 migration not applied')
  })
})

describe('the Neon client', () => {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const path = url.replace('https://console.neon.tech/api/v2', '')
    calls.push({
      method: init?.method ?? 'GET',
      path,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    })

    if (path === '/projects') return reply({ projects: [{ id: 'proj-1', name: 'portfolio' }] })
    if (path === '/projects/proj-1') return reply({ project: { id: 'proj-1', name: 'portfolio' } })
    if (path === '/projects/proj-1/endpoints')
      return reply({
        endpoints: [
          { id: 'ep-1', host: 'ep-cool-1.eu-central-1.aws.neon.tech', branch_id: 'br-main' },
        ],
      })
    if (path === '/projects/proj-1/branches' && (init?.method ?? 'GET') === 'GET')
      return reply({
        branches: [
          {
            id: 'br-main',
            name: 'main',
            default: true,
            current_state: 'ready',
            created_at: '2026-10-01T00:00:00Z',
          },
          {
            id: 'br-backup',
            name: 'backup',
            current_state: 'ready',
            created_at: '2026-10-20T00:00:00Z',
            parent_id: 'br-main',
          },
        ],
      })
    if (path === '/projects/proj-1/branches' && init?.method === 'POST')
      return reply({
        branch: {
          id: 'br-new',
          name: 'backup-now',
          current_state: 'init',
          created_at: '2026-10-22T00:00:00Z',
        },
      })
    if (path === '/projects/proj-1/branches/br-main/restore')
      return reply({
        branch: { id: 'br-main', name: 'main', default: true, current_state: 'ready' },
      })
    if (path.startsWith('/projects/proj-1/branches/br-backup') && init?.method === 'DELETE')
      return reply({})
    return reply({ message: 'not found' }, 404)
  }) as unknown as typeof fetch

  beforeAll(() => {
    calls.length = 0
  })

  it('says so instead of calling the API without a key', async () => {
    const client = new NeonClient({ apiKey: '', fetch: fakeFetch })
    expect(client.configured).toBe(false)
    await expect(client.branches()).rejects.toBeInstanceOf(NeonError)
  })

  it('finds the project by matching this database’s endpoint host', async () => {
    vi.stubEnv(
      'POSTGRES_URL',
      'postgres://u:p@ep-cool-1-pooler.eu-central-1.aws.neon.tech/portfolio',
    )
    const client = new NeonClient({ apiKey: 'key', fetch: fakeFetch })
    const resolved = await client.resolve()
    expect(resolved).toEqual({
      projectId: 'proj-1',
      projectName: 'portfolio',
      branchId: 'br-main',
      fromEnvironment: false,
    })
    vi.unstubAllEnvs()
  })

  it('uses NEON_PROJECT_ID when set, and lists the default branch first', async () => {
    const client = new NeonClient({
      apiKey: 'key',
      projectId: 'proj-1',
      branchId: 'br-main',
      fetch: fakeFetch,
    })
    const branches = await client.branches()
    expect(branches[0]).toMatchObject({ id: 'br-main', default: true })
    expect(branches[1]).toMatchObject({ id: 'br-backup', parentId: 'br-main' })
  })

  it('creates a backup branch without a compute endpoint unless asked', async () => {
    const client = new NeonClient({
      apiKey: 'key',
      projectId: 'proj-1',
      branchId: 'br-main',
      fetch: fakeFetch,
    })
    const branch = await client.createBackupBranch({ name: 'backup-now' })
    expect(branch).toMatchObject({ id: 'br-new', name: 'backup-now' })
    const call = calls.filter((entry) => entry.method === 'POST').at(-1)
    expect(call?.path).toBe('/projects/proj-1/branches')
    expect(call?.body).toEqual({ branch: { name: 'backup-now', parent_id: 'br-main' } })

    calls.length = 0
    await client.createBackupBranch({ name: 'backup-queryable', withEndpoint: true })
    expect(calls.at(-1)?.body).toMatchObject({ endpoints: [{ type: 'read_write' }] })
  })

  it('restores a branch to a timestamp, keeping the current state under a name', async () => {
    const client = new NeonClient({
      apiKey: 'key',
      projectId: 'proj-1',
      branchId: 'br-main',
      fetch: fakeFetch,
    })
    await client.restoreTo({
      timestamp: '2026-10-21T12:00:00.000Z',
      preserveUnderName: 'before-restore',
    })
    const call = calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.path).toBe('/projects/proj-1/branches/br-main/restore')
    expect(call?.body).toEqual({
      source_branch_id: 'br-main',
      source_timestamp: '2026-10-21T12:00:00.000Z',
      preserve_under_name: 'before-restore',
    })
  })

  it('deletes a branch by id', async () => {
    const client = new NeonClient({ apiKey: 'key', projectId: 'proj-1', fetch: fakeFetch })
    await client.deleteBranch('br-backup')
    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/projects/proj-1/branches/br-backup',
    })
  })

  it('turns an HTTP error into an explanation, with the status', async () => {
    const denied = (async () => reply({ message: 'unauthorized' }, 401)) as unknown as typeof fetch
    const client = new NeonClient({ apiKey: 'bad', projectId: 'proj-1', fetch: denied })
    await expect(client.branches()).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('API key was rejected'),
    })
  })

  it('links to the console', () => {
    expect(neonConsoleUrl('proj-1')).toBe('https://console.neon.tech/app/projects/proj-1')
    expect(neonConsoleUrl()).toBe('https://console.neon.tech')
  })
})
