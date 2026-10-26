import {
  BlobAccessError,
  del as vercelBlobDel,
  get as vercelBlobGet,
  list as vercelBlobList,
  put as vercelBlobPut,
} from '@vercel/blob'

import {
  LOGICAL_BACKUP_FORMAT,
  type BackupColumnMeta,
  type BackupForeignKeyMeta,
  type BackupTableDump,
  type BackupVaultStatus,
  type CloudBackupItem,
  type LogicalBackupArchive,
} from '../shared'

import { quoteIdent, type SqlExecutor } from './connection'
import {
  computeArchiveChecksum,
  packLogicalBackup,
  resolveBackupEncryptionSecret,
} from './crypto'
import { inspectSequences } from './monitor'

export const CLOUD_BACKUP_PREFIX = 'backups/database/' as const

/** Transient tables skipped by default so backups stay lean and never re-import stale locks or running jobs. */
const DEFAULT_EXCLUDED_TABLES = new Set([
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'payload_jobs',
  'payload_jobs_stats',
])

/** Sensitive user auth columns cleared when `redactSecrets: true` is chosen for unencrypted downloads. */
const REDACTED_AUTH_COLUMNS = new Set([
  'hash',
  'salt',
  'reset_password_token',
  'reset_password_expiration',
  'api_key',
  'api_key_index',
  'sessions',
])

const AUTH_RELATED_TABLES = new Set(['users', 'users_sessions'])

function normalizeValueForJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') {
    const asNumber = Number(value)
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString()
  }
  if (Buffer.isBuffer(value)) {
    return { __byteaBase64: value.toString('base64') }
  }
  return value
}

/**
 * Pure-TypeScript logical database backup engine (works on Vercel Serverless without `pg_dump`).
 * Exports public user tables, column metadata, PK/FK constraints, sequence positions, and migrations.
 */
export async function exportLogicalBackupArchive(
  executor: SqlExecutor,
  options: {
    redactSecrets?: boolean
    includeTransientTables?: boolean
    appVersion?: string
    payloadVersion?: string
    databaseName?: string | null
  } = {},
): Promise<LogicalBackupArchive> {
  const {
    redactSecrets = false,
    includeTransientTables = false,
    appVersion = '1.0.0',
    payloadVersion = '3.90.2',
    databaseName = null,
  } = options

  const [versionRes, tablesRes, columnsRes, pkRes, fkRes] = await Promise.all([
    executor
      .query<{ version: string }>(`SELECT version() AS version`)
      .catch(() => ({ rows: [] as Array<{ version: string }> })),
    executor.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `),
    executor.query<{
      table_name: string
      column_name: string
      data_type: string
      udt_name: string
      is_nullable: string
    }>(`
      SELECT
        table_name,
        column_name,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name ASC, ordinal_position ASC
    `),
    executor.query<{ table_name: string; column_name: string }>(`
      SELECT
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name ASC, kcu.ordinal_position ASC
    `),
    executor.query<{
      table_name: string
      column_name: string
      ref_table: string
      ref_column: string
    }>(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS ref_table,
        ccu.column_name AS ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name ASC, kcu.ordinal_position ASC
    `),
  ])

  const columnsByTable = new Map<string, BackupColumnMeta[]>()
  for (const col of columnsRes.rows) {
    const arr = columnsByTable.get(col.table_name) ?? []
    arr.push({
      name: col.column_name,
      dataType: col.data_type,
      udtName: col.udt_name,
      isNullable: col.is_nullable === 'YES',
    })
    columnsByTable.set(col.table_name, arr)
  }

  const pkByTable = new Map<string, string[]>()
  for (const pk of pkRes.rows) {
    const arr = pkByTable.get(pk.table_name) ?? []
    if (!arr.includes(pk.column_name)) arr.push(pk.column_name)
    pkByTable.set(pk.table_name, arr)
  }

  const fkByTable = new Map<string, BackupForeignKeyMeta[]>()
  for (const fk of fkRes.rows) {
    const arr = fkByTable.get(fk.table_name) ?? []
    if (
      !arr.some(
        (existing) =>
          existing.column === fk.column_name &&
          existing.refTable === fk.ref_table &&
          existing.refColumn === fk.ref_column,
      )
    ) {
      arr.push({
        column: fk.column_name,
        refTable: fk.ref_table,
        refColumn: fk.ref_column,
      })
    }
    fkByTable.set(fk.table_name, arr)
  }

  const targetTableNames = tablesRes.rows
    .map((r) => r.table_name)
    .filter((name) => includeTransientTables || !DEFAULT_EXCLUDED_TABLES.has(name))

  const tables: BackupTableDump[] = []
  for (const tableName of targetTableNames) {
    if (redactSecrets && tableName === 'users_sessions') {
      tables.push({
        name: tableName,
        columns: columnsByTable.get(tableName) ?? [],
        primaryKey: pkByTable.get(tableName) ?? [],
        foreignKeys: fkByTable.get(tableName) ?? [],
        rowCount: 0,
        rows: [],
      })
      continue
    }

    const pks = pkByTable.get(tableName) ?? []
    const orderByClause =
      pks.length > 0
        ? ` ORDER BY ${pks.map((col) => `${quoteIdent(col)} ASC`).join(', ')}`
        : ''
    const rowsRes = await executor.query<Record<string, unknown>>(
      `SELECT * FROM public.${quoteIdent(tableName)}${orderByClause}`,
    )

    const shouldRedactTable = redactSecrets && AUTH_RELATED_TABLES.has(tableName)
    const normalizedRows = rowsRes.rows.map((rawRow) => {
      const clean: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(rawRow)) {
        if (shouldRedactTable && REDACTED_AUTH_COLUMNS.has(key)) {
          clean[key] = null
        } else {
          clean[key] = normalizeValueForJson(val)
        }
      }
      return clean
    })

    tables.push({
      name: tableName,
      columns: columnsByTable.get(tableName) ?? [],
      primaryKey: pks,
      foreignKeys: fkByTable.get(tableName) ?? [],
      rowCount: normalizedRows.length,
      rows: normalizedRows,
    })
  }

  const seqHealth = await inspectSequences(executor).catch(() => [])
  const sequences: LogicalBackupArchive['sequences'] = seqHealth
    .filter((s) => includeTransientTables || !DEFAULT_EXCLUDED_TABLES.has(s.tableName))
    .map((s) => ({
      tableName: s.tableName,
      columnName: s.columnName,
      sequenceName: s.sequenceName,
      maxId: s.maxId,
    }))

  let migrations: LogicalBackupArchive['migrations'] = []
  const migDump = tables.find((t) => t.name === 'payload_migrations')
  if (migDump) {
    migrations = migDump.rows
      .map((r) => ({
        name: typeof r.name === 'string' ? r.name : String(r.name ?? ''),
        batch: typeof r.batch === 'number' ? r.batch : null,
      }))
      .filter((m) => m.name.length > 0)
  }

  const rawVersion = versionRes.rows[0]?.version ?? null
  const serverVersion = rawVersion ? rawVersion.split(',')[0]?.trim() ?? rawVersion : null
  const checksumSha256 = computeArchiveChecksum({ tables, sequences, migrations })

  return {
    format: LOGICAL_BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    appVersion,
    payloadVersion,
    serverVersion,
    databaseName,
    redactedSecrets: redactSecrets,
    migrations,
    tables,
    sequences,
    checksumSha256,
  }
}

/* -------------------------------------------------------------------------- */
/* Vercel Blob Cloud Vault                                                    */
/* -------------------------------------------------------------------------- */

export interface BlobVaultDriver {
  list(options: { prefix: string; limit?: number; token: string }): Promise<{
    blobs: Array<{
      url: string
      downloadUrl: string
      pathname: string
      size: number
      uploadedAt: Date | string
    }>
  }>
  put(
    pathname: string,
    body: Buffer,
    options: {
      access: 'public' | 'private'
      addRandomSuffix?: boolean
      contentType?: string
      token: string
    },
  ): Promise<{
    url: string
    downloadUrl: string
    pathname: string
  }>
  del(urlOrPathname: string | string[], options: { token: string }): Promise<void>
  readBytes(pathname: string, blobUrl: string, token: string): Promise<Buffer>
}

const defaultBlobDriver: BlobVaultDriver = {
  list: ({ prefix, limit = 100, token }) => vercelBlobList({ prefix, limit, token }),
  put: (pathname, body, options) => vercelBlobPut(pathname, body, options),
  del: (urlOrPathname, options) => vercelBlobDel(urlOrPathname, options),
  async readBytes(pathname, blobUrl, token) {
    // Try private store access first, then public fetch fallback so both private and public Blob stores work.
    try {
      const priv = await vercelBlobGet(pathname, { access: 'private', token, useCache: false })
      if (priv && priv.statusCode === 200 && priv.stream) {
        const arrayBuf = await new Response(priv.stream).arrayBuffer()
        return Buffer.from(arrayBuf)
      }
    } catch {
      // Public Vercel Blob store: read directly via URL.
    }
    const res = await fetch(blobUrl, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Vercel Blob download failed with HTTP ${res.status}`)
    }
    return Buffer.from(await res.arrayBuffer())
  },
}

export function resolveBlobToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const dedicated = env.DATABASE_BLOB_READ_WRITE_TOKEN?.trim()
  if (dedicated) return dedicated
  const shared = env.BLOB_READ_WRITE_TOKEN?.trim()
  if (shared) return shared
  return null
}

export function assertSafeBackupPathname(pathname: string): string {
  const clean = pathname.trim().replace(/^\/+/, '')
  if (!clean.startsWith(CLOUD_BACKUP_PREFIX) || clean.includes('..')) {
    throw new Error(`Invalid backup vault path: must start with "${CLOUD_BACKUP_PREFIX}".`)
  }
  return clean
}

export async function listCloudBackups(options: {
  env?: NodeJS.ProcessEnv
  driver?: BlobVaultDriver
} = {}): Promise<BackupVaultStatus> {
  const env = options.env ?? process.env
  const driver = options.driver ?? defaultBlobDriver
  const token = resolveBlobToken(env)
  const encryptionConfigured = Boolean(resolveBackupEncryptionSecret(env))

  if (!token) {
    return {
      configured: false,
      encryptionConfigured,
      prefix: CLOUD_BACKUP_PREFIX,
      items: [],
      errorMessage: null,
    }
  }

  try {
    const res = await driver.list({
      prefix: CLOUD_BACKUP_PREFIX,
      limit: 50,
      token,
    })

    const items: CloudBackupItem[] = res.blobs
      .map((blob) => {
        const uploadedAt =
          blob.uploadedAt instanceof Date
            ? blob.uploadedAt.toISOString()
            : new Date(blob.uploadedAt).toISOString()
        const filename = blob.pathname.slice(CLOUD_BACKUP_PREFIX.length) || blob.pathname
        return {
          pathname: blob.pathname,
          filename,
          sizeBytes: blob.size,
          uploadedAt,
          encrypted: blob.pathname.includes('.enc.'),
        }
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))

    return {
      configured: true,
      encryptionConfigured,
      prefix: CLOUD_BACKUP_PREFIX,
      items,
      errorMessage: null,
    }
  } catch (error) {
    return {
      configured: true,
      encryptionConfigured,
      prefix: CLOUD_BACKUP_PREFIX,
      items: [],
      errorMessage: error instanceof Error ? error.message : 'Failed to list Vercel Blob vault',
    }
  }
}

/**
 * Exports a full logical PostgreSQL backup, encrypts it with AES-256-GCM, stores it in Vercel Blob,
 * and prunes older archives beyond `retentionCount`.
 */
export async function saveEncryptedBackupToVault(
  executor: SqlExecutor,
  options: {
    env?: NodeJS.ProcessEnv
    driver?: BlobVaultDriver
    retentionCount?: number
    label?: string
    databaseName?: string | null
  } = {},
): Promise<{
  item: CloudBackupItem
  prunedCount: number
  tableCount: number
  rowCount: number
}> {
  const env = options.env ?? process.env
  const driver = options.driver ?? defaultBlobDriver
  const retentionCount = Math.max(1, options.retentionCount ?? 10)

  const token = resolveBlobToken(env)
  if (!token) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN (or DATABASE_BLOB_READ_WRITE_TOKEN) is required to store backups in Vercel Blob.',
    )
  }

  const secret = resolveBackupEncryptionSecret(env)
  if (!secret) {
    throw new Error(
      'Refusing to upload unencrypted database backup to cloud storage: set DATABASE_BACKUP_SECRET or PAYLOAD_SECRET.',
    )
  }

  const archive = await exportLogicalBackupArchive(executor, {
    redactSecrets: false,
    databaseName: options.databaseName ?? null,
  })
  const packed = packLogicalBackup(archive, {
    compress: true,
    encryptionSecret: secret,
  })

  const safeSlug = (options.label ?? 'backup')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'backup'
  const stamp = archive.createdAt.replace(/[:.]/g, '-')
  const targetPathname = `${CLOUD_BACKUP_PREFIX}pocms-${safeSlug}-${stamp}${packed.extension}`

  const preferredAccess: 'private' | 'public' =
    env.DATABASE_BLOB_ACCESS === 'private' || Boolean(env.DATABASE_BLOB_READ_WRITE_TOKEN)
      ? 'private'
      : 'public'

  let uploaded: { pathname: string; url: string; downloadUrl: string }
  try {
    uploaded = await driver.put(targetPathname, packed.bytes, {
      access: preferredAccess,
      addRandomSuffix: true,
      contentType: packed.contentType,
      token,
    })
  } catch (error) {
    if (preferredAccess === 'private' && error instanceof BlobAccessError) {
      // Store is configured as public; ciphertext is AES-256-GCM encrypted with random suffix.
      uploaded = await driver.put(targetPathname, packed.bytes, {
        access: 'public',
        addRandomSuffix: true,
        contentType: packed.contentType,
        token,
      })
    } else {
      throw error
    }
  }

  // Retention pruning
  let prunedCount = 0
  try {
    const listed = await driver.list({
      prefix: CLOUD_BACKUP_PREFIX,
      limit: 100,
      token,
    })
    const sorted = [...listed.blobs].sort((a, b) => {
      const ta = new Date(a.uploadedAt).getTime()
      const tb = new Date(b.uploadedAt).getTime()
      return tb - ta
    })
    const stale = sorted.slice(retentionCount)
    if (stale.length > 0) {
      await driver.del(
        stale.map((b) => b.url),
        { token },
      )
      prunedCount = stale.length
    }
  } catch {
    // Non-fatal if list/del fails after upload succeeded.
  }

  const totalRows = archive.tables.reduce((sum, t) => sum + t.rowCount, 0)
  return {
    item: {
      pathname: uploaded.pathname,
      filename: uploaded.pathname.slice(CLOUD_BACKUP_PREFIX.length),
      sizeBytes: packed.bytes.length,
      uploadedAt: archive.createdAt,
      encrypted: true,
    },
    prunedCount,
    tableCount: archive.tables.length,
    rowCount: totalRows,
  }
}

export async function downloadCloudBackupBytes(
  pathname: string,
  options: {
    env?: NodeJS.ProcessEnv
    driver?: BlobVaultDriver
  } = {},
): Promise<Buffer> {
  const env = options.env ?? process.env
  const driver = options.driver ?? defaultBlobDriver
  const token = resolveBlobToken(env)
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured.')
  }

  const safePath = assertSafeBackupPathname(pathname)
  const listed = await driver.list({ prefix: safePath, limit: 5, token })
  const match = listed.blobs.find((b) => b.pathname === safePath)
  if (!match) {
    throw new Error(`Cloud backup "${safePath}" was not found in Vercel Blob.`)
  }
  return driver.readBytes(safePath, match.downloadUrl || match.url, token)
}

export async function deleteCloudBackup(
  pathname: string,
  options: {
    env?: NodeJS.ProcessEnv
    driver?: BlobVaultDriver
  } = {},
): Promise<void> {
  const env = options.env ?? process.env
  const driver = options.driver ?? defaultBlobDriver
  const token = resolveBlobToken(env)
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured.')
  }

  const safePath = assertSafeBackupPathname(pathname)
  const listed = await driver.list({ prefix: safePath, limit: 5, token })
  const match = listed.blobs.find((b) => b.pathname === safePath)
  if (!match) {
    throw new Error(`Cloud backup "${safePath}" was not found in Vercel Blob.`)
  }
  await driver.del(match.url, { token })
}
