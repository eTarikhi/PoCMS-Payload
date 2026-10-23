import type pg from 'pg'

/**
 * Migration drift: what the database has that no migration ever declared.
 *
 * `push: false` means the only writer of this schema is `src/migrations`, so every table, column,
 * index and enum type in the database should be traceable to a statement in one of them. When one
 * is not, somebody changed the database by hand — or an older deployment ran with `push: true` — and
 * the next environment built from the migrations will not have it. That is the failure this guard
 * catches, and it catches it without a second database, so it can run on every commit.
 *
 * How it reads the two sides:
 *
 *   - **declared** — the `up()` of every migration, with the SQL lifted out of its `sql` template
 *     literals, split into statements, and parsed: `CREATE TABLE` bodies (columns and table
 *     constraints told apart), multi-action `ALTER TABLE … ADD COLUMN a, ADD COLUMN b`,
 *     `CREATE INDEX`, `CREATE TYPE`, and the `DROP`s that cancel an earlier `CREATE`. Only `up()` is
 *     read: `down()` drops what `up()` made, so counting it would declare nothing.
 *   - **live** — `pg_class`, `pg_attribute`, `pg_indexes` and `pg_type` for the `public` schema.
 *
 * Two directions are reported, because they mean different things:
 *
 *   - `undeclared-*` — in the database, in no migration. **Drift.** The fix is a migration
 *     (`pnpm db:schema-from` writes one from the catalogs) or dropping the object.
 *   - `missing-*` — declared by a migration, absent here. Normally a migration that has not run on
 *     this database yet (`pnpm migrate:status` names it), so it is reported separately and does not
 *     fail a run.
 *
 * Migrations are TypeScript, and some of them build their SQL in a loop
 * (`for (const table of TABLES) … ALTER TABLE ${sql.identifier(table)} ADD COLUMN "_order" …`).
 * The table name in such a statement cannot be known statically, so the parser keeps the *shape*:
 * the column is recorded as declared for an unresolved table, and a live column with that name is
 * not drift. The report counts those statements (`wildcards`) so the guard says how much of it was
 * exact and how much was shape-matched.
 *
 * What it deliberately does not compare: column types, nullability, defaults, constraints,
 * sequences, ownership or grants. Two databases are `diff.ts`'s question; one database's whole shape
 * is `db:schema-from`'s. This answers the narrower one — *is every object here accounted for?*
 */

export type MigrationSource = { name: string; source: string }

/** A name the parser could not resolve, and the literal fragments it did see. */
export type Wildcard = { fragments: string[] }

/** The objects a set of migrations declares, after their own drops are applied. */
export type DeclaredSchema = {
  /** Table name → the columns its `CREATE TABLE` body and later `ADD COLUMN`s declare. */
  tables: Map<string, Set<string>>
  indexes: Set<string>
  types: Set<string>
  /** Columns declared on a table whose name was built at runtime (`${sql.identifier(table)}`). */
  wildcardColumns: Set<string>
  /**
   * Columns *dropped* from a table whose name was built at runtime. Such a drop cannot be aimed at
   * one table, so it cancels the column everywhere: a migration that renames `order` to `_order` in
   * a loop over four tables adds the new column and removes the old one, and without this the old
   * one stays "declared but absent" forever.
   */
  wildcardDrops: Set<string>
  /** Index names declared on, or built for, an unresolved table. */
  wildcardIndexes: Set<string>
  /** Every quoted identifier any migration mentions, for the last-resort check. */
  mentioned: Set<string>
  /** How many statements had an unresolved name. */
  wildcards: number
}

export type DriftKind =
  | 'undeclared-table'
  | 'undeclared-column'
  | 'undeclared-index'
  | 'undeclared-type'
  | 'missing-table'
  | 'missing-column'

export type DriftFinding = {
  kind: DriftKind
  table: string
  /** The column, index or type the finding is about, when it is not the table itself. */
  object?: string
  /** Which migration declared it, for the `missing-*` kinds. */
  declaredBy?: string
}

export type DriftReport = {
  /** True when nothing in the database is unaccounted for. */
  clean: boolean
  /** In the database, declared by no migration: the drift that fails a run. */
  drift: DriftFinding[]
  /** Declared by a migration, absent from the database: usually one that has not run here. */
  pending: DriftFinding[]
  counts: {
    tables: number
    columns: number
    indexes: number
    types: number
    migrations: number
    /** Statements whose table or index name is built at runtime. */
    wildcards: number
  }
}

/** Marks the position of a `${…}` interpolation inside extracted SQL. */
const SENTINEL = '\u0000'

/** A synthetic identifier the existing name regexes accept, standing in for an interpolation. */
const dynamicName = (index: number): string => `__dyn${index}__`

const SQL_STARTS = /^\s*(?:create|alter|drop|do|comment|truncate|grant|revoke|update|insert|delete|with|select|set|analyze|vacuum|reindex)\b/i

/** The static text inside an interpolation's own literals: `` `${table}__order_idx` `` → `__order_idx`. */
const fragmentsOf = (expression: string): string[] => {
  const fragments: string[] = []
  const literal = /'([^']*)'|"([^"]*)"|`([^`]*)`/g
  for (const match of expression.matchAll(literal)) {
    const text = match[1] ?? match[2] ?? match[3] ?? ''
    // A template literal inside the expression has its own interpolations; keep the static runs.
    for (const part of text.split(/\$\{[^}]*\}/)) {
      const trimmed = part.replace(/[^A-Za-z0-9_]/g, '')
      if (trimmed.length >= 4) fragments.push(trimmed.toLowerCase())
    }
  }
  return [...new Set(fragments)]
}

/** The index of the `}` closing the `${` at `start`, skipping nested strings and templates. */
const closeOfInterpolation = (text: string, start: number): number => {
  let depth = 0
  let index = start
  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char
      index += 1
      while (index < text.length && text[index] !== quote) {
        if (text[index] === '\\') index += 1
        index += 1
      }
      index += 1
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
    index += 1
  }
  return text.length
}

export type ExtractedSql = {
  statements: string[]
  /** Synthetic name → the literal fragments that stood around the interpolation. */
  dynamics: Map<string, string[]>
}

/**
 * Lift the SQL out of one migration's `up()`: every template literal whose text starts with a SQL
 * keyword, with each `${…}` replaced by a synthetic identifier so the statement keeps its shape.
 */
export const extractSql = (up: string): ExtractedSql => {
  const dynamics = new Map<string, string[]>
  const statements: string[] = []
  let counter = 0
  let index = 0

  while (index < up.length) {
    const start = up.indexOf('`', index)
    if (start === -1) break

    let cursor = start + 1
    let text = ''
    while (cursor < up.length && up[cursor] !== '`') {
      const char = up[cursor]
      if (char === '\\') {
        text += up[cursor + 1] ?? ''
        cursor += 2
        continue
      }
      if (char === '$' && up[cursor + 1] === '{') {
        const end = closeOfInterpolation(up, cursor + 1)
        const expression = up.slice(cursor + 2, end)
        const name = dynamicName(counter++)
        dynamics.set(name, fragmentsOf(expression))
        text += `${SENTINEL}${name}${SENTINEL}`
        cursor = end + 1
        continue
      }
      text += char
      cursor += 1
    }

    index = cursor + 1
    if (!SQL_STARTS.test(text)) continue
    for (const statement of splitStatements(text)) statements.push(statement)
  }

  return { statements, dynamics }
}

/** The `up()` half of a migration file: what running it forward declares. */
export const upSection = (source: string): string => {
  const start = /export\s+(?:async\s+)?function\s+up\b/.exec(source)
  if (!start) return source
  const rest = source.slice(start.index)
  const down = /export\s+(?:async\s+)?function\s+down\b/.exec(rest)
  return down ? rest.slice(0, down.index) : rest
}

/**
 * Split SQL into statements on top-level semicolons, keeping dollar-quoted bodies (`DO $do$ … $do$`)
 * together and dropping comments. A semicolon inside a string or a `DO` block is not an end.
 */
export const splitStatements = (sql: string): string[] => {
  const statements: string[] = []
  let current = ''
  let index = 0
  let lineComment = false
  let blockComment = false
  let singleQuoted = false
  let dollarTag: string | null = null

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      index += 1
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 2
        continue
      }
      index += 1
      continue
    }
    if (singleQuoted) {
      if (char === "'" && next === "'") {
        current += "''"
        index += 2
        continue
      }
      if (char === "'") singleQuoted = false
      current += char
      index += 1
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag
        index += dollarTag.length
        dollarTag = null
        continue
      }
      current += char
      index += 1
      continue
    }

    if (char === '-' && next === '-') {
      lineComment = true
      index += 2
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 2
      continue
    }
    if (char === "'") {
      singleQuoted = true
      current += char
      index += 1
      continue
    }
    if (char === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index))
      if (tag) {
        dollarTag = tag[0]
        current += dollarTag
        index += dollarTag.length
        continue
      }
    }
    if (char === ';') {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      index += 1
      continue
    }

    current += char
    index += 1
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

/** `"public"."articles"`, `"articles"` and `articles` all mean the same table here. */
export const normaliseIdentifier = (raw: string): string => {
  const parts = raw
    .trim()
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  return last.replace(/^"|"$/g, '').replace(/""/g, '"').replace(new RegExp(SENTINEL, 'g'), '').toLowerCase()
}

/** True when the name came from an interpolation, so the object it names is unknown statically. */
const isDynamic = (raw: string): boolean => raw.includes(SENTINEL)

/** Table constraints, not columns, when they open a `CREATE TABLE` body or an `ALTER` action. */
const TABLE_CONSTRAINTS = new Set([
  'constraint',
  'primary',
  'foreign',
  'unique',
  'check',
  'exclude',
  'like',
])

/** An identifier, quoted or not, optionally schema-qualified, or a synthetic dynamic name. */
const IDENTIFIER = `(?:"?(?:public"?\\.)?"?(?:[A-Za-z_][A-Za-z0-9_$]*|${SENTINEL}__dyn[0-9]+__${SENTINEL})"?)`

/**
 * The column names of a `CREATE TABLE` body: split on top-level commas (a `numeric(10, 2)` or a
 * `CHECK (a IN ('x','y'))` keeps its own commas), then take the first word of each entry unless the
 * entry is a table constraint.
 */
export const columnsOfCreateBody = (body: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let quoted = false

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === "'") quoted = !quoted
    if (!quoted) {
      if (char === '(') depth += 1
      if (char === ')') depth -= 1
      if (char === ',' && depth === 0) {
        parts.push(current)
        current = ''
        continue
      }
    }
    current += char
  }
  if (current.trim()) parts.push(current)

  const columns: string[] = []
  for (const part of parts) {
    const text = part.trim()
    if (!text) continue
    const first = /^("?(?:[A-Za-z_][A-Za-z0-9_$]*|\u0000__dyn[0-9]+__\u0000)"?)/.exec(text)?.[1]
    if (!first) continue
    if (TABLE_CONSTRAINTS.has(first.replace(/"/g, '').toLowerCase())) continue
    columns.push(normaliseIdentifier(first))
  }
  return columns
}

/** Split an `ALTER TABLE` action list on top-level commas: `ADD COLUMN a, ADD COLUMN b`. */
export const alterActions = (rest: string): string[] => {
  const actions: string[] = []
  let depth = 0
  let current = ''
  let quoted = false

  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index]
    if (char === "'") quoted = !quoted
    if (!quoted) {
      if (char === '(') depth += 1
      if (char === ')') depth -= 1
      if (char === ',' && depth === 0) {
        actions.push(current)
        current = ''
        continue
      }
    }
    current += char
  }
  if (current.trim()) actions.push(current)
  return actions.map((action) => action.trim()).filter(Boolean)
}

export const emptyDeclaredSchema = (): DeclaredSchema => ({
  tables: new Map<string, Set<string>>(),
  indexes: new Set<string>(),
  types: new Set<string>(),
  wildcardColumns: new Set<string>(),
  wildcardDrops: new Set<string>(),
  wildcardIndexes: new Set<string>(),
  mentioned: new Set<string>(),
  wildcards: 0,
})

const addColumn = (schema: DeclaredSchema, table: string, column: string): void => {
  const columns = schema.tables.get(table) ?? new Set<string>()
  columns.add(column)
  schema.tables.set(table, columns)
}

const addTable = (schema: DeclaredSchema, table: string, columns: string[] = []): void => {
  const existing = schema.tables.get(table) ?? new Set<string>()
  for (const column of columns) existing.add(column)
  schema.tables.set(table, existing)
}

type ParseContext = { schema: DeclaredSchema; dynamics: Map<string, string[]> }

/** The literal fragments behind a synthetic name, so a wildcard can still be matched by shape. */
const fragmentsFor = (context: ParseContext, raw: string): string[] => {
  const name = normaliseIdentifier(raw)
  return context.dynamics.get(name) ?? []
}

/**
 * Read one statement into the declared schema. Returns statements to parse *instead* when this one
 * is a `DO` block whose body carries the real DDL (the guarded form `db:schema-from` writes), so a
 * nested `EXECUTE 'ALTER TABLE …'` is not missed.
 */
const readStatement = (context: ParseContext, raw: string): string[] => {
  const { schema } = context

  // Every quoted identifier the statement mentions, for the last-resort check on indexes and types.
  for (const match of raw.matchAll(/"([A-Za-z_][A-Za-z0-9_$]*)"/g)) {
    schema.mentioned.add((match[1] as string).toLowerCase())
  }

  const dollarBody = /^\s*DO\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)([\s\S]*)\1\s*$/i.exec(raw)
  if (dollarBody) {
    // A guarded snapshot wraps its DDL in PL/pgSQL: `EXECUTE 'CREATE TYPE …'` inside an
    // `IF NOT EXISTS (…) THEN … END IF`. Unwrap it in three steps — doubled quotes become real ones,
    // the string quotes go, and the block keywords become statement separators, so the DDL inside
    // `THEN` is parsed on its own instead of hiding behind `BEGIN IF NOT EXISTS …`.
    const inner = (dollarBody[2] ?? '')
      .replace(/''/g, "'")
      .replace(/""/g, '"')
      .replace(/\bEXECUTE\b/gi, ' ')
      .replace(/'/g, ' ')
      .replace(/\bEND\s+IF\b/gi, ';')
      .replace(/\b(?:BEGIN|THEN|ELSE|END|LOOP)\b/gi, ';')
    // Whatever the block decided at runtime is not knowable here, so it counts as a wildcard: a name
    // it mentions is not reported as drift.
    schema.wildcards += 1
    return splitStatements(inner)
  }

  const statement = raw.replace(/\s+/g, ' ').trim()

  const createTable = new RegExp(
    `^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})\\s*\\(([\\s\\S]*)\\)$`,
    'i',
  ).exec(statement)
  if (createTable) {
    const rawName = createTable[1] as string
    const columns = columnsOfCreateBody(createTable[2] as string)
    if (isDynamic(rawName)) {
      schema.wildcards += 1
      for (const column of columns) schema.wildcardColumns.add(column)
      return []
    }
    addTable(schema, normaliseIdentifier(rawName), columns)
    return []
  }

  // `CREATE TABLE … AS SELECT`, `PARTITION OF`: the name is declared, the columns are not.
  const createTableAs = new RegExp(
    `^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})`,
    'i',
  ).exec(statement)
  if (createTableAs) {
    const rawName = createTableAs[1] as string
    if (isDynamic(rawName)) schema.wildcards += 1
    else addTable(schema, normaliseIdentifier(rawName))
    return []
  }

  const alterTable = new RegExp(
    `^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${IDENTIFIER})\\s+([\\s\\S]+)$`,
    'i',
  ).exec(statement)
  if (alterTable) {
    const rawName = alterTable[1] as string
    const dynamic = isDynamic(rawName)
    const table = normaliseIdentifier(rawName)
    if (dynamic) schema.wildcards += 1
    // A table only exists to hold columns if something declared it; an ALTER implies the table.
    if (!dynamic && !schema.tables.has(table)) addTable(schema, table)

    for (const action of alterActions(alterTable[2] as string)) {
      const addColumnMatch = new RegExp(
        `^ADD\\s+(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})`,
        'i',
      ).exec(action)
      if (addColumnMatch) {
        const rawColumn = addColumnMatch[1] as string
        const column = normaliseIdentifier(rawColumn)
        // `ADD CONSTRAINT …` and `ADD PRIMARY KEY …` are not columns.
        if (TABLE_CONSTRAINTS.has(column) || isDynamic(rawColumn)) continue
        if (dynamic) schema.wildcardColumns.add(column)
        else addColumn(schema, table, column)
        continue
      }

      const dropColumnMatch = new RegExp(
        `^DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`,
        'i',
      ).exec(action)
      if (dropColumnMatch) {
        const rawColumn = dropColumnMatch[1] as string
        const column = normaliseIdentifier(rawColumn)
        if (TABLE_CONSTRAINTS.has(column) || isDynamic(rawColumn)) continue
        if (dynamic) schema.wildcardDrops.add(column)
        else schema.tables.get(table)?.delete(column)
        continue
      }
      // `ADD CONSTRAINT`, `ALTER COLUMN`, `SET`, `OWNER TO`, `RENAME`: nothing this guard counts.
    }
    return []
  }

  const dropTable = new RegExp(
    `^DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`,
    'i',
  ).exec(statement)
  if (dropTable) {
    schema.tables.delete(normaliseIdentifier(dropTable[1] as string))
    return []
  }

  const createIndex = new RegExp(
    `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})\\s+ON\\s+(?:TABLE\\s+)?(${IDENTIFIER})`,
    'i',
  ).exec(statement)
  if (createIndex) {
    const rawIndex = createIndex[1] as string
    const rawTable = createIndex[2] as string
    const dynamic = isDynamic(rawIndex) || isDynamic(rawTable)
    if (dynamic) {
      schema.wildcards += 1
      const fragments = [...fragmentsFor(context, rawIndex), ...fragmentsFor(context, rawTable)]
      // The index name is built at runtime, but its literal tail (`__order_idx`) still identifies it.
      schema.wildcardIndexes.add(fragments.join(' '))
      for (const fragment of fragments) schema.wildcardIndexes.add(fragment)
      return []
    }
    schema.indexes.add(normaliseIdentifier(rawIndex))
    addTable(schema, normaliseIdentifier(rawTable))
    return []
  }

  const dropIndex = new RegExp(
    `^DROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`,
    'i',
  ).exec(statement)
  if (dropIndex) {
    schema.indexes.delete(normaliseIdentifier(dropIndex[1] as string))
    return []
  }

  const createType = new RegExp(`^CREATE\\s+TYPE\\s+(${IDENTIFIER})`, 'i').exec(statement)
  if (createType) {
    const rawName = createType[1] as string
    if (isDynamic(rawName)) schema.wildcards += 1
    else schema.types.add(normaliseIdentifier(rawName))
    return []
  }

  const dropType = new RegExp(
    `^DROP\\s+TYPE\\s+(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`,
    'i',
  ).exec(statement)
  if (dropType) {
    schema.types.delete(normaliseIdentifier(dropType[1] as string))
    return []
  }

  return []
}

/**
 * Everything a list of migrations declares, in the order given (so a later `DROP` cancels an
 * earlier `CREATE`). Pass them oldest first, which is the order `src/migrations/index.ts` keeps.
 */
export const declaredSchema = (sources: MigrationSource[]): DeclaredSchema => {
  const schema = emptyDeclaredSchema()

  for (const migration of sources) {
    const { statements, dynamics } = extractSql(upSection(migration.source))
    const context: ParseContext = { schema, dynamics }
    const queue = [...statements]
    while (queue.length > 0) {
      const statement = queue.shift() as string
      queue.unshift(...readStatement(context, statement))
    }
  }

  return schema
}

export type LiveSchema = {
  tables: Map<string, Set<string>>
  indexes: Set<string>
  types: Set<string>
}

/** What the connected database has in `public`: tables, their columns, indexes, enum types. */
export const liveSchema = async (client: pg.Client): Promise<LiveSchema> => {
  const tables = new Map<string, Set<string>>()

  const tableRows = await client.query<{ name: string }>(`
    select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname`)
  for (const row of tableRows.rows) tables.set(row.name, new Set<string>())

  const columnRows = await client.query<{ table_name: string; name: string }>(`
    select c.relname as table_name, a.attname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     order by c.relname, a.attnum`)
  for (const row of columnRows.rows) {
    const columns = tables.get(row.table_name) ?? new Set<string>()
    columns.add(row.name)
    tables.set(row.table_name, columns)
  }

  const indexRows = await client.query<{ name: string }>(`
    select i.relname as name
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
     order by i.relname`)
  const indexes = new Set(indexRows.rows.map((row) => row.name))

  const typeRows = await client.query<{ name: string }>(`
    select t.typname as name
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype = 'e'
     order by t.typname`)
  const types = new Set(typeRows.rows.map((row) => row.name))

  return { tables, indexes, types }
}

/** The table an index belongs to, from the naming Postgres and Payload both use. */
const indexTableOf = (index: string, live: LiveSchema): string | null => {
  let best: string | null = null
  for (const table of live.tables.keys()) {
    if (index === table || index.startsWith(`${table}_`)) {
      if (!best || table.length > best.length) best = table
    }
  }
  return best
}

/**
 * Payload declares constraints and lets Postgres build the index: a primary key gives
 * `<table>_pkey`, a unique column gives `<table>_<column>_idx`. Those are accounted for by the
 * column being declared, so they are not drift even though no `CREATE INDEX` names them.
 */
const isConstraintIndex = (index: string, table: string | null, declared: DeclaredSchema): boolean => {
  if (!table) return false
  const columns = declared.tables.get(table)
  if (!columns) return false
  if (index === `${table}_pkey`) return true
  const suffix = index.slice(table.length + 1)
  const column = suffix.replace(/_idx$/, '')
  return columns.has(column) || columns.has(`${column}_id`) || columns.has(`_${column}`)
}

/** An index whose name was built at runtime still matches by its literal fragments. */
const matchesWildcardIndex = (index: string, declared: DeclaredSchema): boolean => {
  for (const wildcard of declared.wildcardIndexes) {
    if (wildcard.length < 4) continue
    if (index.toLowerCase().includes(wildcard)) return true
  }
  return false
}

/**
 * Compare the two sides.
 *
 * `sources` is only used to name the migration behind a `missing-*` finding; the comparison itself
 * works without it.
 */
export const findDrift = (
  live: LiveSchema,
  declared: DeclaredSchema,
  sources: MigrationSource[] = [],
): DriftReport => {
  const drift: DriftFinding[] = []
  const pending: DriftFinding[] = []

  const declaredBy = (table: string): string | undefined => {
    for (const migration of sources) {
      if (declaredSchema([migration]).tables.has(table)) return migration.name
    }
    return undefined
  }

  const liveTables = [...live.tables.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [table, columns] of liveTables) {
    const declaredColumns = declared.tables.get(table)
    if (!declaredColumns) {
      drift.push({ kind: 'undeclared-table', table })
      continue
    }
    for (const column of [...columns].sort()) {
      if (declaredColumns.has(column)) continue
      if (declared.wildcardColumns.has(column)) continue
      // Some statement built its names at runtime, so a column the migrations do mention by name
      // is given the benefit of the doubt rather than reported as drift.
      if (declared.wildcards > 0 && declared.mentioned.has(column)) continue
      drift.push({ kind: 'undeclared-column', table, object: column })
    }
  }

  for (const index of [...live.indexes].sort()) {
    if (declared.indexes.has(index)) continue
    const table = indexTableOf(index, live)
    // An index on a table nobody declared adds no information: the table finding is the actionable
    // one, and its `_pkey` would otherwise double-report the same mistake.
    if (table && !declared.tables.has(table)) continue
    if (isConstraintIndex(index, table, declared)) continue
    if (matchesWildcardIndex(index, declared)) continue
    // Last resort: some migration names it, in a shape the parser does not model.
    if (declared.mentioned.has(index)) continue
    drift.push({ kind: 'undeclared-index', table: table ?? '', object: index })
  }

  for (const type of [...live.types].sort()) {
    if (declared.types.has(type)) continue
    if (declared.mentioned.has(type)) continue
    drift.push({ kind: 'undeclared-type', table: '', object: type })
  }

  const declaredTables = [...declared.tables.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [table, columns] of declaredTables) {
    if (!live.tables.has(table)) {
      pending.push({ kind: 'missing-table', table, declaredBy: declaredBy(table) })
      continue
    }
    const liveColumns = live.tables.get(table) ?? new Set<string>()
    for (const column of [...columns].sort()) {
      if (liveColumns.has(column)) continue
      // A later migration dropped it from a runtime-named table, so its absence is the point.
      if (declared.wildcardDrops.has(column)) continue
      pending.push({
        kind: 'missing-column',
        table,
        object: column,
        declaredBy: declaredBy(table),
      })
    }
  }

  return {
    clean: drift.length === 0,
    drift,
    pending,
    counts: {
      tables: live.tables.size,
      columns: [...live.tables.values()].reduce((total, columns) => total + columns.size, 0),
      indexes: live.indexes.size,
      types: live.types.size,
      migrations: sources.length,
      wildcards: declared.wildcards,
    },
  }
}

/** One line per finding, for a CLI, a card or a log. */
export const describeFinding = (finding: DriftFinding): string => {
  switch (finding.kind) {
    case 'undeclared-table':
      return `table "${finding.table}" exists here, no migration creates it`
    case 'undeclared-column':
      return `column "${finding.table}"."${finding.object}" exists here, no migration adds it`
    case 'undeclared-index':
      return `index "${finding.object}" exists here, no migration creates it`
    case 'undeclared-type':
      return `enum type "${finding.object}" exists here, no migration creates it`
    case 'missing-table':
      return `table "${finding.table}" is declared${finding.declaredBy ? ` by ${finding.declaredBy}` : ''} but absent here`
    default:
      return `column "${finding.table}"."${finding.object}" is declared${finding.declaredBy ? ` by ${finding.declaredBy}` : ''} but absent here`
  }
}

/** What was compared, in one line. */
export const summarise = (report: DriftReport): string =>
  `${report.counts.tables} table(s), ${report.counts.columns} column(s), ${report.counts.indexes} index(es), ` +
  `${report.counts.types} enum type(s) against ${report.counts.migrations} migration(s)` +
  (report.counts.wildcards > 0
    ? `, ${report.counts.wildcards} statement(s) matched by shape (their table name is built at runtime)`
    : '')
