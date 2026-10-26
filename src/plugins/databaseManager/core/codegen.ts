import fs from 'node:fs/promises'
import path from 'node:path'

import type { CollectionSlug, GlobalSlug, Payload } from 'payload'

import type {
  CodegenCatalog,
  GeneratedArtifactPreview,
  MigrationGenMode,
  SeedGenMode,
} from '../shared'

import type { SqlExecutor } from './connection'
import { exportLogicalBackupArchive } from './backup'
import { serializeArchiveToSql } from './formats'

const INTERNAL_COLLECTION_PREFIXES = ['payload-']
const NON_SEEDABLE_COLLECTIONS = new Set(['audit-logs', 'users-sessions'])

export function isCodegenDiskWriteAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && !env.VERCEL
}

export function sanitizeArtifactSlug(rawName: string | undefined, fallback: string): string {
  const cleaned = (rawName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return cleaned || fallback
}

function buildMigrationTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '_',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('')
}

/**
 * Escapes arbitrary SQL so it embeds safely inside a TypeScript `` sql`...` `` template literal
 * even when rows contain backslashes, markdown backticks, or `${...}` expressions.
 */
export function escapeForTemplateLiteral(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
}

async function listDirectoryFilesSafe(relDir: string): Promise<string[]> {
  try {
    const abs = path.resolve(process.cwd(), relDir)
    const entries = await fs.readdir(abs, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.sql')))
      .map((e) => e.name)
      .sort()
      .reverse()
  } catch {
    return []
  }
}

async function writeJailedArtifact(
  subDir: 'src/migrations' | 'src/seed/generated',
  filename: string,
  content: string,
): Promise<string> {
  if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes('..')) {
    throw new Error(`Unsafe artifact filename "${filename}".`)
  }
  const baseDir = path.resolve(process.cwd(), subDir)
  const targetAbs = path.resolve(baseDir, filename)
  if (!targetAbs.startsWith(baseDir + path.sep)) {
    throw new Error('Path traversal blocked while writing generated artifact.')
  }
  await fs.mkdir(baseDir, { recursive: true })
  await fs.writeFile(targetAbs, content, 'utf8')
  return `${subDir}/${filename}`
}

/**
 * Introspects live tables, Payload collections, globals, and existing migration/seed files
 * to power the `/admin/database` Selective Export & Codegen UI.
 */
export async function inspectCodegenCatalog(
  payload: Payload,
  executor: SqlExecutor,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodegenCatalog> {
  const tableRowsRes = await executor
    .query<{ name: string; row_count: string | number }>(`
      SELECT
        relname AS name,
        GREATEST(n_live_tup, 0)::bigint AS row_count
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname ASC
    `)
    .catch(() => ({ rows: [] as Array<{ name: string; row_count: string | number }> }))

  const tables = tableRowsRes.rows.map((r) => ({
    name: r.name,
    rowCount: Number(r.row_count ?? 0),
  }))

  const collections: CodegenCatalog['collections'] = []
  for (const col of payload.config.collections ?? []) {
    if (INTERNAL_COLLECTION_PREFIXES.some((p) => col.slug.startsWith(p))) continue
    if (NON_SEEDABLE_COLLECTIONS.has(col.slug)) continue

    let count = 0
    try {
      const counted = await payload.count({
        collection: col.slug as CollectionSlug,
        overrideAccess: true,
      })
      count = counted.totalDocs
    } catch {
      count = 0
    }

    const label =
      typeof col.labels?.plural === 'string'
        ? col.labels.plural
        : typeof col.slug === 'string'
          ? col.slug
          : String(col.slug)

    collections.push({
      slug: col.slug,
      label,
      rowCount: count,
    })
  }

  const globals: CodegenCatalog['globals'] = (payload.config.globals ?? []).map((g) => ({
    slug: g.slug,
    label: typeof g.label === 'string' ? g.label : g.slug,
  }))

  const [existingMigrations, existingGeneratedSeeds] = await Promise.all([
    listDirectoryFilesSafe('src/migrations'),
    listDirectoryFilesSafe('src/seed/generated'),
  ])

  return {
    canWriteToDisk: isCodegenDiskWriteAllowed(env),
    migrationsDir: 'src/migrations',
    seedsDir: 'src/seed/generated',
    tables,
    collections,
    globals,
    existingMigrations,
    existingGeneratedSeeds,
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Direct Database -> Migration File Generator                             */
/* -------------------------------------------------------------------------- */

export async function generateMigrationFromDatabase(
  executor: SqlExecutor,
  options: {
    name?: string
    mode?: MigrationGenMode
    tables?: readonly string[]
    anonymizePii?: boolean
    redactSecrets?: boolean
    writeToDisk?: boolean
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<GeneratedArtifactPreview> {
  const mode: MigrationGenMode = options.mode ?? 'schema-baseline'
  const slug = sanitizeArtifactSlug(
    options.name,
    mode === 'data-upsert' ? 'data_snapshot' : 'schema_baseline',
  )
  const stamp = buildMigrationTimestamp()
  const env = options.env ?? process.env
  const warnings: string[] = []

  const contentMode =
    mode === 'schema-baseline'
      ? 'schema-only'
      : mode === 'data-upsert'
        ? 'data-only'
        : 'schema-and-data'

  const archive = await exportLogicalBackupArchive(executor, {
    contentMode,
    tables: options.tables,
    redactSecrets: options.redactSecrets ?? true,
    anonymizePii: options.anonymizePii ?? false,
  })

  const upSql = serializeArchiveToSql(archive, {
    contentMode,
    includeTransaction: mode === 'raw-sql',
    includeTruncate: false,
    upsertOnConflict: mode !== 'schema-baseline',
  })

  const totalRows = archive.tables.reduce((s, t) => s + t.rowCount, 0)

  if (mode === 'raw-sql') {
    const filename = `${stamp}_${slug}.sql`
    let writtenToDisk = false
    let relativePath = `src/migrations/${filename}`

    if (options.writeToDisk) {
      if (!isCodegenDiskWriteAllowed(env)) {
        warnings.push(
          'Disk write skipped because runtime is production/serverless; download the generated file instead.',
        )
      } else {
        relativePath = await writeJailedArtifact('src/migrations', filename, upSql)
        writtenToDisk = true
      }
    }

    return {
      kind: 'migration',
      mode,
      filename,
      relativePath,
      language: 'sql',
      content: upSql,
      sizeBytes: Buffer.byteLength(upSql, 'utf8'),
      tableCount: archive.tables.length,
      rowCount: totalRows,
      writtenToDisk,
      warnings,
    }
  }

  // Build reversible `down` SQL for schema baselines (reverse topological order)
  const downLines: string[] = []
  if (mode === 'schema-baseline') {
    const reversedTables = [...archive.tables].reverse()
    for (const tbl of reversedTables) {
      downLines.push(`DROP TABLE IF EXISTS public."${tbl.name.replace(/"/g, '""')}" CASCADE;`)
    }
    for (const seq of [...archive.sequences].reverse()) {
      downLines.push(
        `DROP SEQUENCE IF EXISTS public."${seq.sequenceName.replace(/"/g, '""')}" CASCADE;`,
      )
    }
    for (const en of [...(archive.enums ?? [])].reverse()) {
      downLines.push(`DROP TYPE IF EXISTS public."${en.name.replace(/"/g, '""')}" CASCADE;`)
    }
  } else {
    downLines.push('-- Data upsert migration: down() is intentionally a safe no-op to prevent accidental data loss.')
    downLines.push('SELECT 1;')
  }

  const escapedUp = escapeForTemplateLiteral(upSql.trim())
  const escapedDown = escapeForTemplateLiteral(downLines.join('\n'))

  const tsContent = `import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-vercel-postgres'

/**
 * Auto-generated Payload v3 PostgreSQL Migration (${mode})
 * Generated at : ${archive.createdAt}
 * Tables       : ${archive.tables.length} (${totalRows} row(s))
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`
${escapedUp}
  \`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql\`
${escapedDown}
  \`)
}
`

  const filename = `${stamp}_${slug}.ts`
  let writtenToDisk = false
  let relativePath = `src/migrations/${filename}`

  if (options.writeToDisk) {
    if (!isCodegenDiskWriteAllowed(env)) {
      warnings.push(
        'Disk write skipped because runtime is production/serverless; download the .ts migration file instead.',
      )
    } else {
      relativePath = await writeJailedArtifact('src/migrations', filename, tsContent)
      writtenToDisk = true
    }
  }

  return {
    kind: 'migration',
    mode,
    filename,
    relativePath,
    language: 'typescript',
    content: tsContent,
    sizeBytes: Buffer.byteLength(tsContent, 'utf8'),
    tableCount: archive.tables.length,
    rowCount: totalRows,
    writtenToDisk,
    warnings,
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Direct Database -> Seed File Generator                                  */
/* -------------------------------------------------------------------------- */

const STRIPPED_DOC_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'password',
  'hash',
  'salt',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'loginAttempts',
  'lockUntil',
  'sessions',
])

const MEDIA_UPLOAD_FIELD_NAMES = new Set([
  'featuredImage',
  'avatar',
  'ogImage',
  'image',
  'logo',
  'icon',
  'media',
  'thumbnail',
])

function cleanSeedDocument(
  raw: Record<string, unknown>,
  options: {
    mediaFilenameById: Map<string | number, string>
    anonymizePii: boolean
    collectionSlug?: string
    index: number
  },
): {
  cleaned: Record<string, unknown>
  mediaRefs: Record<string, string>
} {
  const cleaned: Record<string, unknown> = {}
  const mediaRefs: Record<string, string> = {}

  for (const [key, val] of Object.entries(raw)) {
    if (STRIPPED_DOC_KEYS.has(key)) continue
    if (val === undefined) continue

    // Resolve direct media foreign keys to portable filenames
    if (
      MEDIA_UPLOAD_FIELD_NAMES.has(key) &&
      (typeof val === 'number' || typeof val === 'string') &&
      options.mediaFilenameById.has(val)
    ) {
      mediaRefs[key] = options.mediaFilenameById.get(val)!
      continue
    }

    if (Array.isArray(val)) {
      cleaned[key] = val.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const copy = { ...(item as Record<string, unknown>) }
          delete copy.id
          return copy
        }
        return item
      })
      continue
    }

    cleaned[key] = val
  }

  if (options.anonymizePii && options.collectionSlug === 'users') {
    if (typeof cleaned.email === 'string') {
      cleaned.email = `seed-user-${options.index + 1}@example.local`
    }
    if (typeof cleaned.name === 'string') {
      cleaned.name = `Seed User ${options.index + 1}`
    }
  }

  return { cleaned, mediaRefs }
}

const DEFAULT_SEED_COLLECTION_ORDER = [
  'roles',
  'skills',
  'education',
  'experience',
  'certifications',
  'articles',
  'projects',
  'redirects',
]

export async function generateSeedFromDatabase(
  payload: Payload,
  executor: SqlExecutor,
  options: {
    name?: string
    mode?: SeedGenMode
    collections?: readonly string[]
    globals?: readonly string[]
    tables?: readonly string[]
    anonymizePii?: boolean
    includeDrafts?: boolean
    writeToDisk?: boolean
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<GeneratedArtifactPreview> {
  const mode: SeedGenMode = options.mode ?? 'payload-local-api'
  const slug = sanitizeArtifactSlug(options.name, 'live_seed')
  const stamp = buildMigrationTimestamp()
  const env = options.env ?? process.env
  const anonymizePii = options.anonymizePii ?? true
  const warnings: string[] = []

  // Mode B: Raw Idempotent SQL Seed (`ON CONFLICT DO UPDATE`)
  if (mode === 'raw-sql-seed') {
    const archive = await exportLogicalBackupArchive(executor, {
      contentMode: 'data-only',
      tables: options.tables,
      redactSecrets: true,
      anonymizePii,
    })
    const sqlSeed = serializeArchiveToSql(archive, {
      contentMode: 'data-only',
      includeTransaction: true,
      includeTruncate: false,
      upsertOnConflict: true,
    })
    const filename = `${stamp}_${slug}.seed.sql`
    const totalRows = archive.tables.reduce((s, t) => s + t.rowCount, 0)
    let writtenToDisk = false
    let relativePath = `src/seed/generated/${filename}`

    if (options.writeToDisk) {
      if (!isCodegenDiskWriteAllowed(env)) {
        warnings.push(
          'Disk write skipped because runtime is production/serverless; download the .seed.sql file instead.',
        )
      } else {
        relativePath = await writeJailedArtifact('src/seed/generated', filename, sqlSeed)
        writtenToDisk = true
      }
    }

    return {
      kind: 'seed',
      mode,
      filename,
      relativePath,
      language: 'sql',
      content: sqlSeed,
      sizeBytes: Buffer.byteLength(sqlSeed, 'utf8'),
      tableCount: archive.tables.length,
      rowCount: totalRows,
      writtenToDisk,
      warnings,
    }
  }

  // Mode A: Portable Payload Local API TypeScript Seed (`src/seed/generated/*.ts`)
  const configuredCollections = new Set<string>(
    (payload.config.collections ?? [])
      .map((c) => String(c.slug))
      .filter(
        (s) =>
          !INTERNAL_COLLECTION_PREFIXES.some((p) => s.startsWith(p)) &&
          !NON_SEEDABLE_COLLECTIONS.has(s) &&
          s !== 'media',
      ),
  )

  const selectedCollections: string[] =
    options.collections && options.collections.length > 0
      ? options.collections.filter((s) => configuredCollections.has(s))
      : DEFAULT_SEED_COLLECTION_ORDER.filter((s) => configuredCollections.has(s))

  const configuredGlobals = new Set<string>(
    (payload.config.globals ?? []).map((g) => String(g.slug)),
  )
  const selectedGlobals: string[] =
    options.globals && options.globals.length > 0
      ? options.globals.filter((s) => configuredGlobals.has(s))
      : [...configuredGlobals]

  // Build Media ID -> Filename lookup so media upload references remain portable across DB instances
  const mediaFilenameById = new Map<string | number, string>()
  try {
    const mediaDocs = await payload.find({
      collection: 'media' as CollectionSlug,
      depth: 0,
      limit: 500,
      overrideAccess: true,
    })
    for (const m of mediaDocs.docs) {
      const rec = m as unknown as Record<string, unknown>
      if ((typeof rec.id === 'number' || typeof rec.id === 'string') && typeof rec.filename === 'string') {
        mediaFilenameById.set(rec.id, rec.filename)
      }
    }
  } catch {
    // Media collection optional in unit mocks
  }

  const collectionPayloads: Array<{
    slug: string
    upsertKey: 'slug' | 'email' | 'title' | 'name' | null
    items: Array<{
      data: Record<string, unknown>
      mediaRefs: Record<string, string>
    }>
  }> = []

  let totalDocs = 0

  for (const colSlug of selectedCollections) {
    const found = await payload.find({
      collection: colSlug as CollectionSlug,
      depth: 0,
      limit: 500,
      draft: options.includeDrafts ?? true,
      overrideAccess: true,
    })

    const docs = found.docs as unknown as Array<Record<string, unknown>>
    if (docs.length === 0) continue

    const sample = docs[0] ?? {}
    const upsertKey: 'slug' | 'email' | 'title' | 'name' | null =
      typeof sample.slug === 'string'
        ? 'slug'
        : typeof sample.email === 'string'
          ? 'email'
          : typeof sample.name === 'string' && colSlug === 'roles'
            ? 'name'
            : typeof sample.title === 'string'
              ? 'title'
              : null

    const items = docs.map((doc, idx) => {
      const { cleaned, mediaRefs } = cleanSeedDocument(doc, {
        mediaFilenameById,
        anonymizePii,
        collectionSlug: colSlug,
        index: idx,
      })
      return { data: cleaned, mediaRefs }
    })

    totalDocs += items.length
    collectionPayloads.push({ slug: colSlug, upsertKey, items })
  }

  const globalPayloads: Array<{
    slug: string
    data: Record<string, unknown>
    mediaRefs: Record<string, string>
  }> = []

  for (const globalSlug of selectedGlobals) {
    try {
      const rawGlobal = (await payload.findGlobal({
        slug: globalSlug as GlobalSlug,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>

      const { cleaned, mediaRefs } = cleanSeedDocument(rawGlobal, {
        mediaFilenameById,
        anonymizePii,
        index: 0,
      })
      delete cleaned.globalType
      globalPayloads.push({ slug: globalSlug, data: cleaned, mediaRefs })
      totalDocs += 1
    } catch {
      // Skip unreadable global
    }
  }

  const generatedIso = new Date().toISOString()
  const seedDataJson = JSON.stringify(
    {
      collections: collectionPayloads,
      globals: globalPayloads,
    },
    null,
    2,
  )

  const tsContent = `import type { CollectionSlug, GlobalSlug, Payload } from 'payload'

/**
 * Auto-generated Payload v3 Local API Seed Snapshot
 * Generated at   : ${generatedIso}
 * Anonymized PII : ${String(anonymizePii)}
 * Total Records  : ${totalDocs}
 *
 * Usage:
 *   import { seedDatabaseSnapshot } from '@/seed/generated/${stamp}_${slug}'
 *   await seedDatabaseSnapshot(payload)
 */

type SeedSnapshotBundle = {
  collections: Array<{
    slug: string
    upsertKey: 'slug' | 'email' | 'title' | 'name' | null
    items: Array<{
      data: Record<string, unknown>
      mediaRefs: Record<string, string>
    }>
  }>
  globals: Array<{
    slug: string
    data: Record<string, unknown>
    mediaRefs: Record<string, string>
  }>
}

const SNAPSHOT_DATA: SeedSnapshotBundle = ${seedDataJson}

const SEED_CONTEXT = {
  skipRevalidate: true,
  skipAuditLog: true,
} as const

async function buildMediaIdLookup(payload: Payload): Promise<Map<string, number | string>> {
  const map = new Map<string, number | string>()
  try {
    const res = await payload.find({
      collection: 'media' as CollectionSlug,
      depth: 0,
      limit: 500,
      overrideAccess: true,
    })
    for (const doc of res.docs) {
      const record = doc as unknown as { id: number | string; filename?: string | null }
      if (record.filename) {
        map.set(record.filename, record.id)
      }
    }
  } catch {
    // Media collection empty or unavailable
  }
  return map
}

export async function seedDatabaseSnapshot(payload: Payload): Promise<{
  seededCollections: number
  seededDocuments: number
  seededGlobals: number
}> {
  const mediaByFilename = await buildMediaIdLookup(payload)
  let seededDocuments = 0

  for (const group of SNAPSHOT_DATA.collections) {
    for (const entry of group.items) {
      const data: Record<string, unknown> = { ...entry.data }
      for (const [field, filename] of Object.entries(entry.mediaRefs)) {
        const resolvedId = mediaByFilename.get(filename)
        if (resolvedId !== undefined) {
          data[field] = resolvedId
        }
      }

      const keyField = group.upsertKey
      const keyVal = keyField ? data[keyField] : undefined

      if (keyField && typeof keyVal === 'string' && keyVal.length > 0) {
        const existing = await payload.find({
          collection: group.slug as CollectionSlug,
          where: { [keyField]: { equals: keyVal } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (existing.docs[0]) {
          await payload.update({
            collection: group.slug as CollectionSlug,
            id: existing.docs[0].id,
            data: data as never,
            depth: 0,
            overrideAccess: true,
            context: SEED_CONTEXT,
          })
          seededDocuments += 1
          continue
        }
      }

      await payload.create({
        collection: group.slug as CollectionSlug,
        data: data as never,
        depth: 0,
        overrideAccess: true,
        context: SEED_CONTEXT,
      })
      seededDocuments += 1
    }
  }

  let seededGlobals = 0
  for (const globalEntry of SNAPSHOT_DATA.globals) {
    const data: Record<string, unknown> = { ...globalEntry.data }
    for (const [field, filename] of Object.entries(globalEntry.mediaRefs)) {
      const resolvedId = mediaByFilename.get(filename)
      if (resolvedId !== undefined) {
        data[field] = resolvedId
      }
    }
    await payload.updateGlobal({
      slug: globalEntry.slug as GlobalSlug,
      data: data as never,
      depth: 0,
      overrideAccess: true,
      context: SEED_CONTEXT,
    })
    seededGlobals += 1
  }

  return {
    seededCollections: SNAPSHOT_DATA.collections.length,
    seededDocuments,
    seededGlobals,
  }
}
`

  const filename = `${stamp}_${slug}.ts`
  let writtenToDisk = false
  let relativePath = `src/seed/generated/${filename}`

  if (options.writeToDisk) {
    if (!isCodegenDiskWriteAllowed(env)) {
      warnings.push(
        'Disk write skipped because runtime is production/serverless; download the .ts seed file instead.',
      )
    } else {
      relativePath = await writeJailedArtifact('src/seed/generated', filename, tsContent)
      writtenToDisk = true
    }
  }

  return {
    kind: 'seed',
    mode,
    filename,
    relativePath,
    language: 'typescript',
    content: tsContent,
    sizeBytes: Buffer.byteLength(tsContent, 'utf8'),
    tableCount: collectionPayloads.length + globalPayloads.length,
    rowCount: totalDocs,
    writtenToDisk,
    warnings,
  }
}
