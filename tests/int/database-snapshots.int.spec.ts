import pg from 'pg'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pgClientOptions } from '@/lib/database-readiness'
import { buildSchemaMigration } from '@/plugins/databaseTools/server/schemaMigration'
import {
  applySeedSnapshot,
  buildSeedSnapshot,
  clampSeedRows,
  contentTables,
  DEFAULT_SEED_EXCLUDES,
  insertOrder,
  parseSeedSnapshot,
  seedableCollections,
  tableNameFor,
} from '@/plugins/databaseTools/server/seedSnapshot'
import { listTables } from '@/plugins/databaseTools/server/introspection'

/**
 * The two files the database page and `pnpm db:schema-from` / `pnpm db:seed-from` generate: a
 * Payload migration written from the catalogs, and a content seed written from the rows.
 *
 * Both are tested against scratch tables rather than the seeded content, because a seed *replaces*
 * rows: a test that round-trips `articles` would empty it while another file is reading it. What
 * the scratch tables cover is the part that can be silently wrong — foreign-key order, exact values
 * for the types Postgres renders specially, sequences left behind the ids, and a generated file that
 * is not valid TypeScript.
 */

const SCRATCH = ['snap_parent', 'snap_child', 'snap_values', 'snap_a', 'snap_b']

describe('which tables a seed carries', () => {
  const collections = [
    { slug: 'articles' },
    { slug: 'media' },
    { slug: 'users', auth: true },
    { slug: 'job-runs' },
    { slug: 'audit-logs' },
    { slug: 'payload-folders' },
    { slug: 'payload-kv' },
    { slug: 'projects', dbName: 'project_items' },
  ]

  it('leaves out auth, Payload’s own tables and the operational ones', () => {
    expect(seedableCollections(collections)).toEqual(['articles', 'media', 'projects'])
    expect(DEFAULT_SEED_EXCLUDES).toContain('users')
    expect(DEFAULT_SEED_EXCLUDES).toContain('payload-migrations')
  })

  it('takes a host’s own exclusions on top of the defaults', () => {
    expect(seedableCollections(collections, ['media'])).toEqual(['articles', 'projects'])
  })

  it('names tables the way Payload does, including a collection’s dbName', () => {
    expect(tableNameFor('job-runs')).toBe('job_runs')
    expect(tableNameFor('pagespeed-reports')).toBe('pagespeed_reports')
    expect(tableNameFor('About')).toBe('About')
  })

  it('finds a collection’s array, relation and version tables, and nothing else', () => {
    const tables = [
      'articles',
      '_articles_v',
      'about_texts',
      'about_rels',
      'about',
      'users',
      'users_rels',
      'articleish',
      'media',
      'media_folders',
    ].map((name) => ({ name }))

    expect(contentTables(tables, [{ slug: 'articles' }, { slug: 'about' }])).toEqual([
      'articles',
      '_articles_v',
      'about_texts',
      'about_rels',
      'about',
    ])
    // A prefix is not a match on its own: `articleish` is another table, `users_rels` another
    // collection's.
    expect(contentTables(tables, [{ slug: 'articles' }])).not.toContain('articleish')
    expect(contentTables(tables, [{ slug: 'users' }])).toEqual(['users', 'users_rels'])
  })

  it('reads the version table of a collection that keeps drafts, from the real catalog', async () => {
    const client = new pg.Client(pgClientOptions(process.env.POSTGRES_URL as string))
    await client.connect()
    try {
      const all = await listTables(client)
      const names = contentTables(all, [{ slug: 'articles' }])
      expect(names).toContain('articles')
      expect(names).toContain('_articles_v')
      expect(names).not.toContain('users')
      // The global's table and its arrays come with it.
      const footer = contentTables(all, [], ['footer'])
      expect(footer).toContain('footer')
      expect(footer.some((name) => name.startsWith('footer_'))).toBe(true)
    } finally {
      await client.end()
    }
  }, 30_000)
})

describe('clampSeedRows', () => {
  it('reads no parameter as the cap — `Number(null)` is 0, which would seed one row per table', () => {
    expect(clampSeedRows(null, 5_000)).toBe(5_000)
    expect(clampSeedRows(undefined, 5_000)).toBe(5_000)
    expect(clampSeedRows('', 5_000)).toBe(5_000)
    expect(clampSeedRows('   ', 5_000)).toBe(5_000)
    expect(clampSeedRows('not a number', 5_000)).toBe(5_000)
  })

  it('keeps a requested size inside the cap, and at least one row', () => {
    expect(clampSeedRows('250', 5_000)).toBe(250)
    expect(clampSeedRows('5000', 5_000)).toBe(5_000)
    expect(clampSeedRows('999999', 5_000)).toBe(5_000)
    expect(clampSeedRows('0', 5_000)).toBe(1)
    expect(clampSeedRows('-20', 5_000)).toBe(1)
    expect(clampSeedRows('12.9', 5_000)).toBe(12)
    // A host's own cap is honoured even when it is the strange one.
    expect(clampSeedRows('100', 0)).toBe(1)
  })
})

describe('the generated files, live', () => {
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client(pgClientOptions(process.env.POSTGRES_URL as string))
    await client.connect()

    for (const table of SCRATCH) await client.query(`drop table if exists ${table} cascade`)
    await client.query('drop type if exists snap_kind cascade')

    await client.query(`create type snap_kind as enum ('a', 'b')`)
    await client.query(`
      create table snap_parent (
        id serial primary key,
        name text not null default 'unnamed',
        kind snap_kind not null default 'a',
        created_at timestamptz not null default now()
      )`)
    await client.query(`
      create table snap_child (
        id serial primary key,
        parent_id integer not null references snap_parent (id) on delete cascade,
        note text check (note is null or length(note) > 0)
      )`)
    await client.query(`create index snap_child_parent_idx on snap_child (parent_id)`)
    // The types whose textual form is easy to lose on the way through JSON.
    await client.query(`
      create table snap_values (
        id serial primary key,
        kind snap_kind not null default 'b',
        at timestamptz,
        doc jsonb,
        tags text[],
        blob bytea,
        amount numeric(10, 2)
      )`)
    // A cycle, so `insertOrder` has something to break.
    await client.query(`create table snap_b (id integer primary key, a integer)`)
    await client.query(
      `create table snap_a (id integer primary key, b integer references snap_b (id))`,
    )
    await client.query(
      `alter table snap_b add constraint snap_b_a_fkey foreign key (a) references snap_a (id)`,
    )

    await client.query(`insert into snap_parent (name, kind) values ('one', 'a'), ('two', 'b')`)
    await client.query(
      `insert into snap_child (parent_id, note) select id, 'n' || id from snap_parent`,
    )
    await client.query(`
      insert into snap_values (kind, at, doc, tags, blob, amount)
      values ('b', '2026-01-02T03:04:05.678+00:00', '{"a": [1, 2], "b": null}'::jsonb,
              array['x', 'y'], decode('deadbeef', 'hex'), 12.34)`)
  }, 60_000)

  afterAll(async () => {
    for (const table of SCRATCH) await client.query(`drop table if exists ${table} cascade`)
    await client.query('drop type if exists snap_kind cascade')
    await client.end()
  })

  describe('the schema migration', () => {
    it('writes guarded statements for the tables it is given, as valid TypeScript', async () => {
      const file = await buildSchemaMigration(client, {
        tables: ['snap_parent', 'snap_child', 'snap_values'],
        mode: 'guarded',
        now: new Date('2026-10-22T10:00:00Z'),
      })

      expect(file.name).toBe('20261022_100000_schema_snapshot')
      expect(file.filename).toBe('20261022_100000_schema_snapshot.ts')
      expect(file.tables).toBe(3)
      expect(file.statements).toBeGreaterThan(6)

      // A migration file that does not parse is worse than no file at all.
      const transpiled = ts.transpileModule(file.content, {
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      })
      expect(transpiled.diagnostics ?? []).toEqual([])
      expect(file.content).toContain(`from '@payloadcms/db-vercel-postgres'`)
      expect(file.content).toContain('export async function up({ db }: MigrateUpArgs)')

      expect(file.groups.tables.join('\n')).toContain(
        'CREATE TABLE IF NOT EXISTS "public"."snap_parent"',
      )
      expect(file.groups.indexes.join('\n')).toContain('CREATE INDEX IF NOT EXISTS')
      // The enum is guarded by a catalog check, because `CREATE TYPE` has no `IF NOT EXISTS`.
      const kinds = file.groups.types.filter((statement) => statement.includes('snap_kind'))
      expect(kinds).toHaveLength(1)
      expect(kinds[0]).toContain('DO $do$ BEGIN')
      expect(kinds[0]).toContain(`t.typname = 'snap_kind'`)
      expect(kinds[0]).toContain('CREATE TYPE public.snap_kind AS ENUM')
      // Constraints too: `ADD CONSTRAINT` has no `IF NOT EXISTS` either.
      const checks = file.groups.foreignKeys.filter((statement) => statement.includes('snap_child'))
      expect(checks.length).toBeGreaterThan(0)
      expect(checks.every((statement) => statement.startsWith('DO $do$ BEGIN'))).toBe(true)
      expect(checks.join('\n')).toContain('::regclass')
      // A guarded snapshot never drops anything.
      expect(file.content).not.toContain('DROP TABLE')
      expect(file.content).not.toContain('DROP TYPE')
    }, 60_000)

    it('runs twice against the database it came from, and changes nothing', async () => {
      const file = await buildSchemaMigration(client, {
        tables: ['snap_parent', 'snap_child', 'snap_values'],
      })
      const before = await client.query(
        `select count(*)::int as n from pg_attribute a
          where a.attrelid = 'public.snap_values'::regclass and a.attnum > 0 and not a.attisdropped`,
      )
      const groups = [
        file.groups.types,
        file.groups.sequences,
        file.groups.tables,
        file.groups.keys,
        file.groups.indexes,
        file.groups.foreignKeys,
      ]
      // The second run is the point: a guarded file has to survive being applied where it already
      // has been, which is what makes it safe to commit next to the migrations that exist.
      for (const round of [1, 2]) {
        for (const group of groups) await client.query(group.join('\n'))
        expect(round).toBeGreaterThan(0)
      }
      const after = await client.query(
        `select count(*)::int as n from pg_attribute a
          where a.attrelid = 'public.snap_values'::regclass and a.attnum > 0 and not a.attisdropped`,
      )
      expect(after.rows[0].n).toBe(before.rows[0].n)
      const rows = await client.query('select count(*)::int as n from snap_parent')
      expect(rows.rows[0].n).toBe(2)
    }, 60_000)

    it('builds the same tables in an empty database, from the file alone', async () => {
      const file = await buildSchemaMigration(client, {
        tables: ['snap_parent', 'snap_child', 'snap_values'],
      })
      // `snap_copy` stands in for a database that has nothing yet: the statements are rewritten to
      // a name that does not exist, run, and compared with the original.
      await client.query('drop table if exists snap_copy cascade')
      const renamed = [
        file.groups.types,
        file.groups.sequences,
        file.groups.tables,
        file.groups.keys,
        file.groups.indexes,
        file.groups.foreignKeys,
      ]
        .flat()
        .map((statement) => statement.replaceAll('snap_values', 'snap_copy'))
      for (const statement of renamed) await client.query(statement)
      try {
        const shape = async (table: string) => {
          const { rows } = await client.query(
            `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull
               from pg_attribute a
              where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
              order by a.attnum`,
            [`public.${table}`],
          )
          return rows
        }
        expect(await shape('snap_copy')).toEqual(await shape('snap_values'))
        const indexes = await client.query(
          `select count(*)::int as n from pg_index where indrelid = 'public.snap_copy'::regclass`,
        )
        expect(indexes.rows[0].n).toBeGreaterThan(0)
      } finally {
        await client.query('drop table if exists snap_copy cascade')
      }
    }, 60_000)

    it('offers a from-scratch mode whose down drops what it created', async () => {
      const file = await buildSchemaMigration(client, {
        tables: ['snap_parent', 'snap_child'],
        mode: 'fresh',
      })
      expect(file.mode).toBe('fresh')
      expect(file.groups.tables.join('\n')).toContain('CREATE TABLE "public"."snap_parent"')
      expect(file.groups.tables.join('\n')).not.toContain('IF NOT EXISTS')
      expect(file.content).toContain('DROP TABLE IF EXISTS "snap_child" CASCADE')
      expect(file.content).toContain('DROP TABLE IF EXISTS "snap_parent" CASCADE')
      expect(file.content).toContain('DROP TYPE IF EXISTS "public"."snap_kind" CASCADE')
      // Children before parents, so the drops do not need CASCADE to work.
      expect(file.content.indexOf('"snap_child"')).toBeLessThan(
        file.content.lastIndexOf('"snap_parent" CASCADE'),
      )
      const transpiled = ts.transpileModule(file.content, {
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      })
      expect(transpiled.diagnostics ?? []).toEqual([])
    }, 60_000)
  })

  describe('the content seed', () => {
    it('orders parents before children and keeps the sequences with them', async () => {
      const { snapshot, json, filename } = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_child', 'snap_parent', 'snap_values'],
        target: { host: 'db.example.com', database: 'portfolio' },
        now: new Date('2026-10-22T10:00:00Z'),
      })

      expect(filename).toBe('portfolio-seed-2026-10-22.json')
      expect(snapshot.format).toBe('pocms-seed')
      expect(snapshot.tables.map((table) => table.name)).toEqual([
        'snap_parent',
        'snap_child',
        'snap_values',
      ])
      expect(snapshot.counts).toEqual({ tables: 3, rows: 5 })
      expect(snapshot.sequences.map((entry) => entry.table)).toEqual([
        'snap_parent',
        'snap_child',
        'snap_values',
      ])
      expect(snapshot.sequences[0]?.value).toBe(2)
      expect(snapshot.warnings).toEqual([])
      expect(JSON.parse(json)).toMatchObject({ format: 'pocms-seed', version: 1 })
    }, 30_000)

    it('keeps the values Postgres renders specially', async () => {
      const read = async () => {
        const { rows } = await client.query(
          `select kind, at, doc, tags, encode(blob, 'hex') as blob, amount from snap_values order by id`,
        )
        return rows
      }
      const before = await read()

      const { snapshot } = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_values'],
      })
      const applied = await applySeedSnapshot(client, snapshot)
      expect(applied.rows).toBe(1)
      expect(await read()).toEqual(before)
      // The enum, the timestamp, the jsonb, the array and the numeric all came back through
      // `jsonb_populate_recordset`, not through JavaScript's idea of them.
      expect(before[0]).toMatchObject({ kind: 'b', tags: ['x', 'y'], blob: 'deadbeef' })
      expect(Number(before[0]?.amount)).toBe(12.34)
      expect((before[0]?.doc as { a: number[] }).a).toEqual([1, 2])
    }, 60_000)

    it('replaces the rows and leaves the sequence past the highest id', async () => {
      const { snapshot } = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_parent', 'snap_child'],
      })
      // Rows added since the file was written must not survive: a seed replaces, it does not merge.
      await client.query(`insert into snap_parent (name) values ('three')`)
      expect((await client.query('select count(*)::int as n from snap_parent')).rows[0].n).toBe(3)

      const applied = await applySeedSnapshot(client, snapshot)
      expect(applied.tables.map((table) => [table.name, table.deleted, table.inserted])).toEqual([
        ['snap_parent', 3, 2],
        ['snap_child', 2, 2],
      ])
      expect(applied.rows).toBe(4)

      const next = await client.query(`insert into snap_parent (name) values ('four') returning id`)
      expect(Number(next.rows[0].id)).toBe(3)
      const child = await client.query(
        `insert into snap_child (parent_id, note) values (3, 'n3') returning id`,
      )
      expect(Number(child.rows[0].id)).toBe(3)
    }, 60_000)

    it('caps a table and says how many rows it left behind', async () => {
      const { snapshot } = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_parent', 'snap_child'],
        maxRowsPerTable: 1,
      })
      expect(snapshot.tables[0]?.data).toHaveLength(1)
      // `counts.rows` is what the file holds, not what the table holds.
      expect(snapshot.counts.rows).toBe(
        snapshot.tables.reduce((sum, table) => sum + table.data.length, 0),
      )
      const total = Number(
        (await client.query('select count(*)::int as n from snap_parent')).rows[0].n,
      )
      expect(total).toBeGreaterThan(1)
      expect(snapshot.warnings.join(' ')).toContain(
        `snap_parent: 1 of ${total.toLocaleString('en')} rows kept (the cap).`,
      )

      // Without a cap there is nothing to warn about.
      const whole = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_parent', 'snap_child'],
      })
      expect(whole.snapshot.warnings).toEqual([])
      expect(whole.snapshot.tables[0]?.data).toHaveLength(total)
    }, 30_000)

    it('breaks a foreign-key cycle and names it', async () => {
      const { order, warnings } = await insertOrder(client, ['snap_a', 'snap_b'])
      expect(order.sort()).toEqual(['snap_a', 'snap_b'])
      expect(warnings.join(' ')).toMatch(/Foreign-key cycle between snap_[ab] → snap_[ab]/)

      const { snapshot } = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_a', 'snap_b'],
      })
      expect(snapshot.warnings.join(' ')).toContain('Foreign-key cycle')
    }, 30_000)

    it('refuses a file that is not a seed, and one naming a table that is not here', async () => {
      expect(() => parseSeedSnapshot('not json')).toThrow(/not JSON/)
      expect(() => parseSeedSnapshot('{"format":"pocms-backup","version":1}')).toThrow(
        /not a PoCMS seed/,
      )
      expect(() => parseSeedSnapshot('{"format":"pocms-seed","version":1,"tables":[]}')).toThrow(
        /no tables/,
      )

      const { snapshot } = await buildSeedSnapshot(client, {
        collections: [],
        tables: ['snap_parent'],
      })
      await expect(
        applySeedSnapshot(client, {
          ...snapshot,
          tables: [...snapshot.tables, { name: 'snap_missing', columns: ['id'], data: [] }],
        }),
      ).rejects.toThrow(/does not have: snap_missing/)
    }, 30_000)

    it('refuses to build a seed that would be empty', async () => {
      await expect(
        buildSeedSnapshot(client, { collections: [{ slug: 'no-such-collection' }], globals: [] }),
      ).rejects.toThrow(/No content table matched/)
    }, 30_000)
  })
})
