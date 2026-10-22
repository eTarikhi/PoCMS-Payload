import type pg from 'pg'

import {
  createTable,
  listEnums,
  listForeignKeys,
  listIndexes,
  listKeys,
  listSequences,
} from './backup'
import { databaseTarget } from './connection'
import { listTables, type TableSummary } from './introspection'

/**
 * A Payload migration generated from the connected database.
 *
 * The Neon branch is usually ahead of the repository: a column was added by hand, an index was
 * created during an incident, a migration file was lost. This turns "what the database actually
 * has" into a file the repository can run, so a fresh environment can be rebuilt from it and the
 * difference stops being tribal knowledge.
 *
 * Every statement comes from Postgres's own deparsing — the same calls the `.sql` dump uses
 * (`pg_get_constraintdef`, `pg_get_indexdef`, `format_type`), so the file describes the database
 * rather than a guess about it.
 *
 * Two modes, and the difference is whether the file may touch an existing database:
 *
 *   - `guarded` (default): every statement is safe to run twice. Tables are `CREATE TABLE IF NOT
 *     EXISTS`, indexes gain `IF NOT EXISTS`, and types and constraints are wrapped in a `DO` block
 *     that checks the catalog first. Running it against the database it was generated from changes
 *     nothing; running it against an empty database builds the schema. This is the mode to commit:
 *     it can be added after the existing migrations without breaking `pnpm migrate` anywhere.
 *   - `fresh`: plain `CREATE` statements, meant for a file that *defines* a database from scratch.
 *     Its `down` drops what it created. Committing it next to the baseline would make two
 *     migrations claim the same tables, so use it deliberately.
 *
 * What it cannot know: row data (that is the seed), ownership and grants, extensions, and the
 * history in `payload_migrations`. `pnpm migrate:adopt` records a schema that already exists as
 * migrated; the two commands are meant to be used together.
 */

export type SchemaMigrationMode = 'guarded' | 'fresh'

export type SchemaMigrationFile = {
  /** The migration's name, also its file name without `.ts`. */
  name: string
  filename: string
  content: string
  mode: SchemaMigrationMode
  /** How many statements the file holds, and how many tables it describes. */
  statements: number
  tables: number
  /** The statements as they would run, grouped — the file is these, wrapped in `db.execute`. */
  groups: SchemaGroups
}

const guardLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`

/** `"public"."articles"` or `public.articles` → its two parts, unquoted. */
export const splitQualified = (raw: string): { schema: string; name: string } | null => {
  const parts = raw.trim().split('.')
  if (parts.length !== 2) return null
  const clean = (part: string): string => part.trim().replace(/^"|"$/g, '')
  return { schema: clean(parts[0]), name: clean(parts[1]) }
}

/** `"public"."x"` — how a name is written back into SQL, always quoted. */
const qualified = (schema: string, name: string): string =>
  `"${schema.replace(/"/g, '""')}"."${name.replace(/"/g, '""')}"`

/** `CREATE TYPE <name> AS ENUM (…)` → a `DO` block that checks `pg_type` first. */
export const guardType = (statement: string): string => {
  const match = /^CREATE TYPE (.+?) AS ENUM/i.exec(statement)
  const target = match ? splitQualified(match[1]) : null
  if (!target) return statement
  return [
    'DO $do$ BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace`,
    `                 WHERE n.nspname = ${guardLiteral(target.schema)} AND t.typname = ${guardLiteral(target.name)}) THEN`,
    `    ${statement.trim()}`,
    '  END IF;',
    'END $do$;',
  ].join('\n')
}

export const guardSequence = (statement: string): string =>
  statement.replace(/^CREATE SEQUENCE (?!IF NOT EXISTS)/i, 'CREATE SEQUENCE IF NOT EXISTS ')

export const guardTable = (statement: string): string =>
  statement.replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')

/** `ALTER TABLE <name> ADD CONSTRAINT <c> …` → a `DO` block that checks `pg_constraint`. */
export const guardConstraint = (statement: string): string => {
  const match = /^ALTER TABLE (.+?) ADD CONSTRAINT (.+?) /i.exec(statement)
  const target = match ? splitQualified(match[1]) : null
  if (!target || !match) return statement
  const constraint = match[2].trim().replace(/^"|"$/g, '')
  return [
    'DO $do$ BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ${guardLiteral(constraint)}`,
    `                 AND conrelid = ${guardLiteral(qualified(target.schema, target.name))}::regclass) THEN`,
    `    ${statement.trim()}`,
    '  END IF;',
    'END $do$;',
  ].join('\n')
}

export const guardIndex = (statement: string): string =>
  statement.replace(
    /^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i,
    (_all: string, unique: string | undefined) => `CREATE ${unique ?? ''}INDEX IF NOT EXISTS `,
  )

export type SchemaGroups = {
  types: string[]
  sequences: string[]
  tables: string[]
  keys: string[]
  indexes: string[]
  foreignKeys: string[]
}

/** Every schema statement for the chosen tables, grouped in the order a restore needs. */
export const schemaGroups = async (
  client: pg.Client,
  chosen: TableSummary[],
): Promise<SchemaGroups> => {
  const groups: SchemaGroups = {
    types: await listEnums(client),
    sequences: (await listSequences(client)).create,
    tables: [],
    keys: [],
    indexes: [],
    foreignKeys: [],
  }
  for (const table of chosen) {
    groups.tables.push(await createTable(client, table.oid, table.name))
    groups.keys.push(...(await listKeys(client, table.oid)))
    groups.indexes.push(...(await listIndexes(client, table.oid)))
    groups.foreignKeys.push(...(await listForeignKeys(client, table.oid)))
  }
  return groups
}

const guarded = (groups: SchemaGroups): SchemaGroups => ({
  types: groups.types.map(guardType),
  sequences: groups.sequences.map(guardSequence),
  tables: groups.tables.map(guardTable),
  keys: groups.keys.map(guardConstraint),
  indexes: groups.indexes.map(guardIndex),
  foreignKeys: groups.foreignKeys.map(guardConstraint),
})

/** `db.execute(sql\`…\`)` cannot contain a backtick or a `${`; SQL from the catalogs does not, but
 * an identifier a host created with a backtick in it could. Escaping keeps the file valid TS. */
const escapeTemplate = (sql: string): string => sql.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const timestamp = (date: Date): { stamp: string; iso: string } => {
  const iso = date.toISOString()
  return {
    stamp: `${iso.slice(0, 10).replace(/-/g, '')}_${iso.slice(11, 19).replace(/:/g, '')}`,
    iso,
  }
}

export type BuildSchemaMigrationOptions = {
  mode?: SchemaMigrationMode
  /** Tables to capture. The default is every table in `public`. */
  tables?: string[]
  now?: Date
  target?: { host: string; database: string }
}

export const buildSchemaMigration = async (
  client: pg.Client,
  options: BuildSchemaMigrationOptions = {},
): Promise<SchemaMigrationFile> => {
  const mode: SchemaMigrationMode = options.mode === 'fresh' ? 'fresh' : 'guarded'
  const now = options.now ?? new Date()
  const target = options.target ?? databaseTarget()
  const { stamp } = timestamp(now)

  const all = await listTables(client)
  const wanted = options.tables && options.tables.length > 0 ? new Set(options.tables) : null
  const chosen = all.filter((table) => (wanted ? wanted.has(table.name) : true))
  const groups =
    mode === 'guarded'
      ? guarded(await schemaGroups(client, chosen))
      : await schemaGroups(client, chosen)

  const sections: { title: string; statements: string[] }[] = [
    { title: mode === 'guarded' ? 'Types (only when missing)' : 'Types', statements: groups.types },
    { title: 'Sequences', statements: groups.sequences },
    { title: 'Tables', statements: groups.tables },
    { title: 'Primary keys and unique constraints', statements: groups.keys },
    { title: 'Indexes', statements: groups.indexes },
    { title: 'Foreign keys and checks', statements: groups.foreignKeys },
  ]

  const body = sections
    .filter((section) => section.statements.length > 0)
    .map((section) => {
      const sql = section.statements
        .map((statement) => `${statement.trim().replace(/;?$/, ';')}`)
        .join('\n\n')
      return `  // ${section.title}\n  await db.execute(sql\`\n${escapeTemplate(sql)}\n  \`)`
    })
    .join('\n\n')

  const downStatements: string[] = []
  if (mode === 'fresh') {
    downStatements.push(
      ...chosen
        .slice()
        .reverse()
        .map((table) => `DROP TABLE IF EXISTS "${table.name}" CASCADE;`),
    )
    for (const statement of groups.types) {
      const match = /^CREATE TYPE (.+?) AS ENUM/i.exec(statement)
      const target = match ? splitQualified(match[1]) : null
      if (target)
        downStatements.push(`DROP TYPE IF EXISTS ${qualified(target.schema, target.name)} CASCADE;`)
    }
  }

  const down =
    mode === 'fresh' && downStatements.length > 0
      ? `  // Reverse order: the tables first (CASCADE takes their keys and indexes), then the types.
${downStatements
  .map((statement) => `  await db.execute(sql\`\n${escapeTemplate(statement)}\n  \`)`)
  .join('\n')}`
      : `  // A guarded snapshot describes what a database already has; it never drops anything.
  // Removing a column or a table is a decision with data behind it, so it is not generated here.
  void _args`

  const modeNote =
    mode === 'guarded'
      ? 'Every statement is safe to run twice: tables use IF NOT EXISTS, and types and constraints\n * check the catalog first. Applied to the database it came from it changes nothing; applied to an\n * empty database it builds the schema.'
      : 'Plain CREATE statements: this file defines a database from scratch, and its down drops what\n * it created.'

  const content = `import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * The schema of ${target.database || 'the database'} on ${target.host || '?'}, captured ${now.toISOString()}.
 *
 * Generated by the admin's database tools from the catalogs: every statement is Postgres's own
 * deparsing of what the database has, not a guess from the Payload config. ${modeNote}
 *
 * Not included: rows (that is the seed), ownership, grants, extensions, and the migration history
 * itself (\`pnpm migrate:adopt\` records a schema that already exists as migrated).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
${body || '  // The database has no tables in the public schema.'}
}

export async function down(_args: MigrateDownArgs): Promise<void> {
${down}
}
`

  return {
    name: `${stamp}_schema_snapshot`,
    filename: `${stamp}_schema_snapshot.ts`,
    content,
    mode,
    statements: sections.reduce((sum, section) => sum + section.statements.length, 0),
    tables: chosen.length,
    groups,
  }
}
