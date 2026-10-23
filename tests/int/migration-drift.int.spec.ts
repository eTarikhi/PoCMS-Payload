import fs from 'node:fs'
import path from 'node:path'

import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pgClientOptions } from '@/lib/database-readiness'
import { migrations } from '@/migrations'
import {
  alterActions,
  columnsOfCreateBody,
  declaredSchema,
  describeFinding,
  extractSql,
  findDrift,
  liveSchema,
  normaliseIdentifier,
  splitStatements,
  summarise,
  upSection,
  type LiveSchema,
  type MigrationSource,
} from '@/plugins/databaseTools/server/drift'
import { readMigrationSources } from '@/plugins/databaseTools/server/migrationSources'

/**
 * The migration drift guard: does every object in the database come from a migration?
 *
 * The parser is the part that can be silently wrong, so most of this file feeds it migration text
 * in the shapes this repository actually writes — Payload's generated `CREATE TABLE` bodies, a
 * hand-written multi-action `ALTER TABLE`, a loop that builds its table name at runtime, and the
 * `DO $do$` blocks a guarded snapshot wraps its catalog checks in. Getting one of those shapes
 * wrong does not throw; it reports a column as drift that a migration plainly declared, which is how
 * a guard like this gets ignored.
 *
 * The last two tests run against the real database: one asserts this checkout is clean (it is built
 * by `pnpm migrate` alone), the other makes drift on purpose and asserts the guard names it.
 */

const SCRATCH_TABLE = 'drift_scratch'
const SCRATCH_COLUMN = 'hand_made_column'

const sources = (): MigrationSource[] =>
  migrations.map((migration) => ({
    name: migration.name,
    source: fs.readFileSync(
      path.resolve('src/migrations', `${migration.name}.ts`),
      'utf8',
    ),
  }))

/** A migration file in the shape this repository writes them. */
const migration = (name: string, up: string, down = ''): MigrationSource => ({
  name,
  source: `import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
${up}
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
${down}
}
`,
})

describe('reading SQL out of a migration file', () => {
  it('keeps only the up() half', () => {
    const file = migration(
      'x',
      '  await db.execute(sql`ALTER TABLE "a" ADD COLUMN "kept" text;`)',
      '  await db.execute(sql`ALTER TABLE "a" DROP COLUMN "kept";`)',
    )
    const up = upSection(file.source)
    expect(up).toContain('ADD COLUMN "kept"')
    expect(up).not.toContain('DROP COLUMN "kept"')
  })

  it('splits statements on top-level semicolons only', () => {
    const statements = splitStatements(`
      CREATE TYPE "e" AS ENUM('a;b', 'c');
      DO $do$ BEGIN IF true THEN EXECUTE 'ALTER TABLE "t" ADD COLUMN "c" text;'; END IF; END $do$;
      -- a comment; with a semicolon
      ALTER TABLE "t" ADD COLUMN "d" text;`)
    expect(statements).toHaveLength(3)
    expect(statements[0]).toContain("ENUM('a;b', 'c')")
    expect(statements[1]).toMatch(/^DO \$do\$ BEGIN/)
    expect(statements[2]).toContain('ADD COLUMN "d"')
  })

  it('lifts the SQL out of sql`…` templates and keeps the shape of an interpolation', () => {
    const { statements, dynamics } = extractSql(`
  await db.execute(sql\`ALTER TABLE \${sql.identifier(table)} ADD COLUMN "_order" varchar;\`)
  await db.execute(sql\`CREATE INDEX \${sql.identifier(\`\${table}__order_idx\`)} ON \${sql.identifier(table)} USING btree ("_order");\`)
  const label = \`not sql at all\`;`)
    expect(statements).toHaveLength(2)
    // The literal tail of a name built at runtime survives, which is what makes it matchable.
    expect([...dynamics.values()].flat()).toContain('__order_idx')
    expect(statements.join(' ')).not.toContain('not sql at all')
  })

  it('reads a CREATE TABLE body, telling columns from table constraints', () => {
    const columns = columnsOfCreateBody(`
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "price" numeric(10, 2) DEFAULT 0,
      "category" "public"."enum_articles_category",
      CONSTRAINT "articles_title_key" UNIQUE ("title"),
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE set null,
      CHECK ("price" >= 0)`)
    expect(columns).toEqual(['id', 'title', 'price', 'category'])
  })

  it('splits a multi-action ALTER TABLE', () => {
    expect(
      alterActions(
        `ADD COLUMN "meta_title" varchar, ADD COLUMN "meta_description" varchar, ADD COLUMN "meta_image_id" integer`,
      ),
    ).toHaveLength(3)
    expect(alterActions(`ADD CONSTRAINT "fk" FOREIGN KEY ("a") REFERENCES "b"("id")`)).toHaveLength(1)
  })

  it('normalises quoted, schema-qualified and plain names alike', () => {
    expect(normaliseIdentifier('"public"."articles"')).toBe('articles')
    expect(normaliseIdentifier('"Articles"')).toBe('articles')
    expect(normaliseIdentifier('articles')).toBe('articles')
    expect(normaliseIdentifier('"odd""name"')).toBe('odd"name')
  })
})

describe('what a set of migrations declares', () => {
  it('reads the shapes this repository writes', () => {
    const declared = declaredSchema([
      migration(
        'baseline',
        `  await db.execute(sql\`CREATE TABLE "articles" (
     "id" serial PRIMARY KEY NOT NULL,
     "title" varchar NOT NULL,
     "order" numeric DEFAULT 0,
     CONSTRAINT "articles_title_key" UNIQUE ("title")
   );\`)
  await db.execute(sql\`CREATE TYPE "public"."enum_articles_category" AS ENUM('news');\`)
  await db.execute(sql\`CREATE INDEX "articles_title_idx" ON "articles" USING btree ("title");\`)`,
      ),
      // A hand-written migration: several ADD COLUMNs in one statement, plus IF NOT EXISTS.
      migration(
        'seo',
        `  await db.execute(sql\`ALTER TABLE "articles"
     ADD COLUMN "meta_title" varchar,
     ADD COLUMN "meta_description" varchar,
     ADD COLUMN IF NOT EXISTS "meta_image_id" integer;\`)`,
      ),
      // A loop: the table name is built at runtime, so only the column's shape is knowable.
      migration(
        'orderable',
        `  for (const table of ['articles'] as const) {
    await db.execute(sql\`ALTER TABLE \${sql.identifier(table)} ADD COLUMN "_order" varchar;
    ALTER TABLE \${sql.identifier(table)} DROP COLUMN "order";\`)
    await db.execute(
      sql\`CREATE INDEX \${sql.identifier(\`\${table}__order_idx\`)} ON \${sql.identifier(table)} USING btree ("_order");\`,
    )
  }`,
      ),
      // A guarded snapshot: the DDL is inside a DO block's EXECUTE string.
      migration(
        'snapshot',
        `  await db.execute(sql\`DO $do$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_guarded') THEN
       EXECUTE 'CREATE TYPE "enum_guarded" AS ENUM (''a'')';
     END IF;
     ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "guarded_column" text;
   END $do$\`)`,
      ),
    ])

    expect([...declared.tables.keys()]).toEqual(['articles'])
    expect([...(declared.tables.get('articles') ?? [])].sort()).toEqual([
      'guarded_column',
      'id',
      'meta_description',
      'meta_image_id',
      'meta_title',
      'order',
      'title',
    ])
    expect(declared.indexes.has('articles_title_idx')).toBe(true)
    expect(declared.types.has('enum_articles_category')).toBe(true)
    expect(declared.types.has('enum_guarded')).toBe(true)

    // The loop built its table name at runtime, so what it declares is a shape, not an object: the
    // column it adds excuses any table's `_order`, the one it drops excuses any table's missing
    // `order`, and the index it names is matched by the literal tail of the name.
    expect(declared.wildcardColumns.has('_order')).toBe(true)
    expect(declared.wildcardDrops.has('order')).toBe(true)
    expect(declared.wildcardIndexes.has('__order_idx')).toBe(true)
    expect(declared.wildcards).toBeGreaterThan(0)

    // …and the report is what that buys: a table with `_order` and no `order` is neither drift nor
    // pending, which is exactly the four collections this repository renamed.
    const report = findDrift(
      {
        tables: new Map([
          [
            'articles',
            new Set([
              'id',
              'title',
              '_order',
              'meta_title',
              'meta_description',
              'meta_image_id',
              'guarded_column',
            ]),
          ],
        ]),
        indexes: new Set(['articles_pkey', 'articles_title_idx', 'articles__order_idx']),
        types: new Set(['enum_articles_category', 'enum_guarded']),
      },
      declared,
    )
    expect(report.drift).toEqual([])
    expect(report.pending).toEqual([])
  })

  it('lets a later migration drop what an earlier one created', () => {
    const declared = declaredSchema([
      migration('a', `  await db.execute(sql\`CREATE TABLE "t" ("id" serial, "gone" text);\`)`),
      migration('b', `  await db.execute(sql\`ALTER TABLE "t" DROP COLUMN "gone"; DROP TABLE "t";\`)`),
    ])
    expect(declared.tables.has('t')).toBe(false)
  })

  it('does not read the down() half, which would declare nothing at all', () => {
    const declared = declaredSchema([
      migration(
        'a',
        `  await db.execute(sql\`CREATE TABLE "t" ("id" serial);\`)`,
        `  await db.execute(sql\`DROP TABLE "t";\`)`,
      ),
    ])
    expect(declared.tables.has('t')).toBe(true)
  })
})

describe('comparing the two sides', () => {
  const declared = declaredSchema([
    migration(
      'a',
      `  await db.execute(sql\`CREATE TABLE "articles" ("id" serial PRIMARY KEY NOT NULL, "title" varchar, "later_dropped" text);
   CREATE INDEX "articles_title_idx" ON "articles" USING btree ("title");
   CREATE TYPE "public"."enum_articles_category" AS ENUM('news');
   CREATE TABLE "absent" ("id" serial);\`)`,
    ),
    migration('b', `  await db.execute(sql\`ALTER TABLE "articles" DROP COLUMN "later_dropped";\`)`),
  ])
  const live: LiveSchema = {
    tables: new Map([
      ['articles', new Set(['id', 'title', 'hand_made'])],
      ['mystery', new Set(['id'])],
    ]),
    indexes: new Set(['articles_pkey', 'articles_title_idx', 'mystery_pkey', 'loose_idx']),
    types: new Set(['enum_articles_category', 'enum_loose']),
  }

  it('names every object the migrations do not account for', () => {
    const report = findDrift(live, declared, [])
    expect(report.clean).toBe(false)
    const kinds = report.drift.map((finding) => `${finding.kind}:${finding.table}.${finding.object ?? ''}`)
    expect(kinds).toContain('undeclared-column:articles.hand_made')
    expect(kinds).toContain('undeclared-table:mystery.')
    expect(kinds).toContain('undeclared-index:.loose_idx')
    expect(kinds).toContain('undeclared-type:.enum_loose')
    // A primary key Postgres built for a declared table is not drift…
    expect(kinds).not.toContain('undeclared-index:articles.articles_pkey')
    // …and neither are the indexes of a table already reported as undeclared.
    expect(kinds).not.toContain('undeclared-index:mystery.mystery_pkey')
  })

  const declaredSources = [
    migration(
      'a',
      `  await db.execute(sql\`CREATE TABLE "articles" ("id" serial PRIMARY KEY NOT NULL, "title" varchar, "later_dropped" text);
   CREATE INDEX "articles_title_idx" ON "articles" USING btree ("title");
   CREATE TYPE "public"."enum_articles_category" AS ENUM('news');
   CREATE TABLE "absent" ("id" serial);\`)`,
    ),
    migration('b', `  await db.execute(sql\`ALTER TABLE "articles" DROP COLUMN "later_dropped";\`)`),
  ]

  it('reports a declared-but-absent object separately, naming the migration', () => {
    const report = findDrift(live, declaredSchema(declaredSources), declaredSources)
    const pending = report.pending.map((finding) => finding.kind)
    expect(pending).toContain('missing-table')
    expect(report.pending.find((finding) => finding.kind === 'missing-table')?.declaredBy).toBe('a')
    // A column a later migration dropped is absent on purpose, so it is not pending.
    expect(report.pending.some((finding) => finding.object === 'later_dropped')).toBe(false)
    // Pending findings never make a run fail.
    expect(report.clean).toBe(false)
    expect(findDrift({ tables: new Map(), indexes: new Set(), types: new Set() }, declared).clean)
      .toBe(true)
  })

  it('describes a finding in one readable line', () => {
    expect(describeFinding({ kind: 'undeclared-column', table: 'articles', object: 'hand_made' })).toBe(
      'column "articles"."hand_made" exists here, no migration adds it',
    )
    expect(
      describeFinding({ kind: 'missing-table', table: 'absent', declaredBy: 'a' }),
    ).toContain('declared by a')
  })
})

describe('reading the migration sources', () => {
  it('finds every registered migration of this repository', () => {
    const result = readMigrationSources({
      names: migrations.map((migration) => migration.name),
      dir: path.resolve('src/migrations'),
    })
    expect(result.unreadable).toEqual([])
    expect(result.sources).toHaveLength(migrations.length)
    expect(result.sources[0]?.source).toContain('export async function up')
  })

  it('refuses a name that could walk out of the directory', () => {
    const result = readMigrationSources({
      names: ['../../etc/passwd', 'ok_name'],
      dir: path.resolve('src/migrations'),
    })
    expect(result.unreadable).toContain('../../etc/passwd')
    expect(result.sources.every((source) => source.name === 'ok_name' || source.name !== '../../etc/passwd')).toBe(true)
  })

  it('names what it could not read instead of silently declaring nothing', () => {
    const result = readMigrationSources({ names: ['no_such_migration'], dir: path.resolve('src/migrations') })
    expect(result.sources).toHaveLength(0)
    expect(result.unreadable).toEqual(['no_such_migration'])
  })
})

describe('against the real database', () => {
  const url = process.env.POSTGRES_URL
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client(pgClientOptions(url as string))
    await client.connect()
  })

  afterAll(async () => {
    await client.query(`drop table if exists ${SCRATCH_TABLE}`).catch(() => undefined)
    await client.end()
  })

  it('finds no drift in a database that pnpm migrate built', async () => {
    const declared = declaredSchema(sources())
    const report = findDrift(await liveSchema(client), declared, sources())

    // This is the assertion that fails when somebody changes the database by hand.
    expect(report.drift).toEqual([])
    expect(report.clean).toBe(true)
    expect(report.counts.tables).toBeGreaterThan(20)
    expect(report.counts.migrations).toBe(migrations.length)
    expect(summarise(report)).toContain('migration(s)')
  })

  it('names an object made by hand, and stops naming it once it is gone', async () => {
    const declared = declaredSchema(sources())

    await client.query(
      `create table ${SCRATCH_TABLE} (id serial primary key, ${SCRATCH_COLUMN} text)`,
    )
    const drifted = findDrift(await liveSchema(client), declared, sources())
    expect(drifted.clean).toBe(false)
    expect(drifted.drift.map((finding) => finding.table)).toContain(SCRATCH_TABLE)
    expect(describeFinding(drifted.drift.find((f) => f.kind === 'undeclared-table')!)).toContain(
      'no migration creates it',
    )

    await client.query(`alter table "articles" add column ${SCRATCH_COLUMN} text`)
    const columnDrift = findDrift(await liveSchema(client), declared, sources())
    expect(
      columnDrift.drift.some(
        (finding) => finding.kind === 'undeclared-column' && finding.object === SCRATCH_COLUMN,
      ),
    ).toBe(true)

    await client.query(`alter table "articles" drop column ${SCRATCH_COLUMN}`)
    await client.query(`drop table ${SCRATCH_TABLE}`)
    expect(findDrift(await liveSchema(client), declared, sources()).clean).toBe(true)
  })
})
