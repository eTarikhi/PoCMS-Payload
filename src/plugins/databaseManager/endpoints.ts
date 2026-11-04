import type { Endpoint, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import { recordDatabaseAuditLog } from '@/plugins/auditLog'

import {
  deleteCloudBackup,
  downloadCloudBackupBytes,
  exportFormattedDatabaseBackup,
  saveEncryptedBackupToVault,
  type BlobVaultDriver,
} from './core/backup'
import {
  generateMigrationFromDatabase,
  generateSeedFromDatabase,
} from './core/codegen'
import {
  createPayloadSqlExecutor,
  resolvePostgresUrls,
  type DirectClientRunner,
  type SqlExecutor,
} from './core/connection'
import { resolveBackupEncryptionSecret } from './core/crypto'
import { executeReadOnlyDiagnosticQuery } from './core/queryRunner'
import { runDatabaseRepairAction } from './core/repair'
import { dryRunLogicalRestore, executeLogicalRestore } from './core/restore'
import { DEFAULT_PROVIDER_ADAPTERS, getProviderAdapterBySlug } from './providers/registry'
import type { DatabaseProviderAdapter } from './providers/types'
import {
  REPAIR_ACTION_META,
  type BackupContentMode,
  type BackupExportFormat,
  type CsvRestoreStrategy,
  type MigrationGenMode,
  type ProviderSlug,
  type RepairActionKind,
  type SeedGenMode,
} from './shared'
import { collectDatabaseManagementSnapshot } from './snapshot'

const VALID_REPAIR_ACTIONS = new Set<string>(REPAIR_ACTION_META.map((m) => m.action))
const VALID_BACKUP_FORMATS = new Set<BackupExportFormat>(['sql', 'json', 'ndjson', 'csv'])
const VALID_CONTENT_MODES = new Set<BackupContentMode>([
  'schema-and-data',
  'data-only',
  'schema-only',
])

export type DatabaseEndpointsDeps = {
  executor?: SqlExecutor | null
  directRunner?: DirectClientRunner
  blobDriver?: BlobVaultDriver
  adapters?: readonly DatabaseProviderAdapter[]
  env?: NodeJS.ProcessEnv
}

function forbiddenResponse() {
  return Response.json(
    { error: 'Needs the Database management permission.' },
    { status: 403 },
  )
}

function parseFormatParam(raw: string | null | undefined): BackupExportFormat {
  if (raw && VALID_BACKUP_FORMATS.has(raw as BackupExportFormat)) {
    return raw as BackupExportFormat
  }
  return 'json'
}

function parseContentModeParam(raw: string | null | undefined): BackupContentMode {
  if (raw && VALID_CONTENT_MODES.has(raw as BackupContentMode)) {
    return raw as BackupContentMode
  }
  return 'schema-and-data'
}

async function parseBackupBytesFromRestoreRequest(
  req: PayloadRequest,
  deps: DatabaseEndpointsDeps,
): Promise<{
  bytes: Buffer
  mode: 'dry-run' | 'execute'
  confirm: string
  createSafetySnapshot: boolean
  allowRedactedRestore: boolean
  sourceLabel: string
  formatHint: BackupExportFormat | null
  csvTable: string | null
  csvStrategy: CsvRestoreStrategy
}> {
  const env = deps.env ?? process.env
  const contentType = req.headers?.get?.('content-type')?.toLowerCase() ?? ''

  if (contentType.includes('multipart/form-data') && typeof req.formData === 'function') {
    const form = await req.formData()
    const fileEntry = form.get('file')
    const modeRaw = String(form.get('mode') ?? 'dry-run')
    const mode: 'dry-run' | 'execute' = modeRaw === 'execute' ? 'execute' : 'dry-run'
    const confirm = String(form.get('confirm') ?? '')
    const createSafetySnapshot = String(form.get('createSafetySnapshot') ?? 'true') !== 'false'
    const allowRedactedRestore = String(form.get('allowRedactedRestore') ?? 'false') === 'true'
    const rawFormat = String(form.get('format') ?? '').trim()
    const formatHint = VALID_BACKUP_FORMATS.has(rawFormat as BackupExportFormat)
      ? (rawFormat as BackupExportFormat)
      : null
    const csvTable = String(form.get('csvTable') ?? '').trim() || null
    const csvStrategy: CsvRestoreStrategy =
      String(form.get('csvStrategy') ?? 'upsert') === 'replace' ? 'replace' : 'upsert'

    if (!fileEntry || typeof (fileEntry as Blob).arrayBuffer !== 'function') {
      throw new Error('Missing uploaded backup file.')
    }
    const buf = Buffer.from(await (fileEntry as Blob).arrayBuffer())
    const name =
      typeof (fileEntry as File).name === 'string' && (fileEntry as File).name
        ? (fileEntry as File).name
        : 'uploaded-backup'

    return {
      bytes: buf,
      mode,
      confirm,
      createSafetySnapshot,
      allowRedactedRestore,
      sourceLabel: name,
      formatHint,
      csvTable,
      csvStrategy,
    }
  }

  const body = (await req.json?.().catch(() => ({}))) as {
    source?: 'vault' | 'inline'
    pathname?: string
    base64?: string
    text?: string
    filename?: string
    format?: string
    csvTable?: string
    csvStrategy?: CsvRestoreStrategy
    mode?: 'dry-run' | 'execute'
    confirm?: string
    createSafetySnapshot?: boolean
    allowRedactedRestore?: boolean
  }

  const mode: 'dry-run' | 'execute' = body.mode === 'execute' ? 'execute' : 'dry-run'
  const confirm = body.confirm ?? ''
  const createSafetySnapshot = body.createSafetySnapshot !== false
  const allowRedactedRestore = Boolean(body.allowRedactedRestore)
  const formatHint =
    body.format && VALID_BACKUP_FORMATS.has(body.format as BackupExportFormat)
      ? (body.format as BackupExportFormat)
      : null
  const csvTable = body.csvTable?.trim() || null
  const csvStrategy: CsvRestoreStrategy = body.csvStrategy === 'replace' ? 'replace' : 'upsert'

  if (body.source === 'vault' || body.pathname) {
    if (!body.pathname?.trim()) {
      throw new Error('Missing cloud vault backup pathname.')
    }
    const bytes = await downloadCloudBackupBytes(body.pathname, {
      env,
      driver: deps.blobDriver,
    })
    return {
      bytes,
      mode,
      confirm,
      createSafetySnapshot,
      allowRedactedRestore,
      sourceLabel: body.pathname.trim(),
      formatHint,
      csvTable,
      csvStrategy,
    }
  }

  if (typeof body.base64 === 'string' && body.base64.length > 0) {
    return {
      bytes: Buffer.from(body.base64, 'base64'),
      mode,
      confirm,
      createSafetySnapshot,
      allowRedactedRestore,
      sourceLabel: body.filename?.trim() || 'inline-archive',
      formatHint,
      csvTable,
      csvStrategy,
    }
  }

  if (typeof body.text === 'string' && body.text.length > 0) {
    return {
      bytes: Buffer.from(body.text, 'utf8'),
      mode,
      confirm,
      createSafetySnapshot,
      allowRedactedRestore,
      sourceLabel: body.filename?.trim() || 'inline-script',
      formatHint,
      csvTable,
      csvStrategy,
    }
  }

  throw new Error('Provide either an uploaded backup file or a cloud vault pathname.')
}

/**
 * Builds the REST endpoints powering `/admin/database` (`manageDatabase` RBAC capability).
 */
export function createDatabaseManagementEndpoints(
  deps: DatabaseEndpointsDeps = {},
): Endpoint[] {
  const getEnv = () => deps.env ?? process.env
  const getAdapters = () => deps.adapters ?? DEFAULT_PROVIDER_ADAPTERS

  return [
    {
      path: '/admin-database',
      method: 'get',
      handler: async (req) => {
        if (!hasCapability(req.user, 'manageDatabase')) return forbiddenResponse()
        const snapshot = await collectDatabaseManagementSnapshot(req.payload, {
          executor: deps.executor,
          blobDriver: deps.blobDriver,
          adapters: getAdapters(),
          env: getEnv(),
        })
        return Response.json(snapshot)
      },
    },
    {
      path: '/admin-database/export',
      method: 'get',
      handler: async (req) => {
        if (!hasCapability(req.user, 'manageDatabase')) return forbiddenResponse()
        const env = getEnv()

        try {
          const url = req.url ? new URL(req.url, 'http://localhost') : null
          const getParam = (key: string) =>
            url?.searchParams.get(key) ?? req.searchParams?.get(key) ?? null

          const source = getParam('source') ?? 'live'

          if (source === 'vault') {
            const pathname = getParam('pathname') ?? ''
            if (!pathname) {
              return Response.json({ error: 'Missing vault pathname.' }, { status: 400 })
            }
            const bytes = await downloadCloudBackupBytes(pathname, {
              env,
              driver: deps.blobDriver,
            })
            const filename = pathname.split('/').pop() || 'pocms-cloud-backup.enc.json.gz'
            return new Response(new Uint8Array(bytes), {
              status: 200,
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
                'Cache-Control': 'no-store',
              },
            })
          }

          const format = parseFormatParam(getParam('format'))
          const contentMode = parseContentModeParam(getParam('contentMode'))
          const redactSecrets = getParam('redact') === 'true'
          const anonymizePii = getParam('anonymize') === 'true'
          const encrypt = getParam('encrypt') === 'true'
          const upsertSql = getParam('upsert') === 'true'
          const rawCompress = getParam('compress')
          const compress =
            rawCompress === 'true'
              ? true
              : rawCompress === 'false'
                ? false
                : format === 'json' || format === 'ndjson'
          const csvTable = getParam('csvTable') ?? undefined
          const rawTables = getParam('tables')
          const tables = rawTables
            ? rawTables
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined

          const executor =
            deps.executor !== undefined
              ? deps.executor
              : createPayloadSqlExecutor(req.payload, env)
          if (!executor) {
            return Response.json({ error: 'POSTGRES_URL is not configured.' }, { status: 400 })
          }

          const encryptionSecret = encrypt ? resolveBackupEncryptionSecret(env) : null
          if (encrypt && !encryptionSecret) {
            return Response.json(
              {
                error:
                  'Set DATABASE_BACKUP_SECRET or PAYLOAD_SECRET to download encrypted backups.',
              },
              { status: 400 },
            )
          }

          const { diagnostics } = resolvePostgresUrls(env)
          const exported = await exportFormattedDatabaseBackup(executor, {
            format,
            contentMode,
            tables,
            csvTable,
            redactSecrets,
            anonymizePii,
            compress,
            encryptionSecret,
            upsertSql,
            databaseName: diagnostics.database,
          })

          await recordDatabaseAuditLog(req, {
            action: 'backup',
            entityType: `postgresql-backup-${format}`,
            documentTitle: exported.filename,
            meta: {
              delivery: 'browser-download',
              format,
              contentMode,
              encrypted: exported.encrypted,
              compressed: exported.compressed,
              redactedSecrets: redactSecrets,
              anonymizePii,
              tables: exported.tableCount,
              rows: exported.rowCount,
              sizeBytes: exported.bytes.length,
            },
          })

          return new Response(new Uint8Array(exported.bytes), {
            status: 200,
            headers: {
              'Content-Type': exported.contentType,
              'Content-Disposition': `attachment; filename="${exported.filename}"`,
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Database export failed.' },
            { status: 500 },
          )
        }
      },
    },
    {
      path: '/admin-database/restore',
      method: 'post',
      handler: async (req) => {
        if (!hasCapability(req.user, 'manageDatabase')) return forbiddenResponse()
        const env = getEnv()
        const adapters = getAdapters()

        try {
          const parsed = await parseBackupBytesFromRestoreRequest(req, deps)
          const executor =
            deps.executor !== undefined
              ? deps.executor
              : createPayloadSqlExecutor(req.payload, env)
          if (!executor) {
            return Response.json({ error: 'POSTGRES_URL is not configured.' }, { status: 400 })
          }

          if (parsed.mode === 'dry-run') {
            const report = await dryRunLogicalRestore(executor, parsed.bytes, {
              env,
              filename: parsed.sourceLabel,
              formatHint: parsed.formatHint,
              csvTable: parsed.csvTable,
              csvStrategy: parsed.csvStrategy,
            })
            return Response.json({ ok: true, mode: 'dry-run', report })
          }

          if (parsed.confirm !== 'RESTORE') {
            return Response.json(
              {
                error:
                  'Restore execution requires explicit confirmation (confirm: "RESTORE").',
              },
              { status: 400 },
            )
          }

          const { diagnostics } = resolvePostgresUrls(env)
          const activeAdapter = adapters.find(
            (a) =>
              a.matchesConnection(diagnostics) &&
              a.capabilities.includes('auto-safety-snapshot') &&
              typeof a.createSnapshot === 'function',
          )

          const result = await executeLogicalRestore(req.payload, parsed.bytes, {
            env,
            directRunner: deps.directRunner,
            filename: parsed.sourceLabel,
            formatHint: parsed.formatHint,
            csvTable: parsed.csvTable,
            csvStrategy: parsed.csvStrategy,
            allowRedactedRestore: parsed.allowRedactedRestore,
            onBeforeRestoreSafetySnapshot:
              parsed.createSafetySnapshot && activeAdapter?.createSnapshot
                ? async () => {
                    const status = await activeAdapter.getStatus(diagnostics, env)
                    if (status.result.status !== 'ok') return null
                    const snap = await activeAdapter.createSnapshot!(
                      {
                        name: `pre-restore-safety-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
                        expiresInDays: 7,
                      },
                      diagnostics,
                      env,
                    )
                    return { id: snap.id, name: snap.name }
                  }
                : undefined,
          })

          await recordDatabaseAuditLog(req, {
            action: 'restore',
            entityType: `postgresql-restore-${result.detectedFormat ?? 'json'}`,
            documentTitle: parsed.sourceLabel,
            meta: {
              detectedFormat: result.detectedFormat,
              restoredTables: result.restoredTables,
              restoredRows: result.restoredRows,
              syncedSequences: result.syncedSequences,
              usedUnpooledConnection: result.usedUnpooledConnection,
              safetySnapshotId: result.safetySnapshotId,
              durationMs: result.durationMs,
            },
          })

          const snapshot = await collectDatabaseManagementSnapshot(req.payload, {
            executor: deps.executor,
            blobDriver: deps.blobDriver,
            adapters,
            env,
          })

          return Response.json({
            ok: true,
            mode: 'execute',
            result,
            snapshot,
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Database restore failed.' },
            { status: 500 },
          )
        }
      },
    },
    {
      path: '/admin-database',
      method: 'post',
      handler: async (req) => {
        if (!hasCapability(req.user, 'manageDatabase')) return forbiddenResponse()
        const env = getEnv()
        const adapters = getAdapters()

        const body = (await req.json?.().catch(() => ({}))) as {
          action?: string
          label?: string
          format?: string
          contentMode?: string
          tables?: string[]
          collections?: string[]
          globals?: string[]
          retentionCount?: number
          pathname?: string
          waitUntil?: string
          repairAction?: string
          tableName?: string
          forceAllLocks?: boolean
          migrationMode?: MigrationGenMode
          seedMode?: SeedGenMode
          anonymizePii?: boolean
          includeDrafts?: boolean
          writeToDisk?: boolean
          sql?: string
          explain?: boolean
          maxRows?: number
          provider?: ProviderSlug
          name?: string
          expiresInDays?: number
          expiresInHours?: number
          snapshotId?: string
          newBranchName?: string
          targetBranchId?: string
          finalize?: boolean
          parentBranchId?: string
          parentTimestamp?: string
          noCompute?: boolean
          branchId?: string
          endpointId?: string
          operation?: 'start' | 'suspend' | 'restart'
        }

        const action = body?.action?.trim()
        if (!action) {
          return Response.json({ error: 'Missing database action.' }, { status: 400 })
        }

        const refreshSnapshot = () =>
          collectDatabaseManagementSnapshot(req.payload, {
            executor: deps.executor,
            blobDriver: deps.blobDriver,
            adapters,
            env,
          })

        const getExecutor = () =>
          deps.executor !== undefined
            ? deps.executor
            : createPayloadSqlExecutor(req.payload, env)

        try {
          const { diagnostics } = resolvePostgresUrls(env)

          if (action === 'vault-save') {
            const executor = getExecutor()
            if (!executor) {
              return Response.json({ error: 'POSTGRES_URL is not configured.' }, { status: 400 })
            }
            const vaultFormat =
              body.format === 'sql' || body.format === 'ndjson' ? body.format : 'json'
            const contentMode = parseContentModeParam(body.contentMode)

            const saved = await saveEncryptedBackupToVault(executor, {
              env,
              driver: deps.blobDriver,
              label: body.label,
              format: vaultFormat,
              contentMode,
              tables: Array.isArray(body.tables) && body.tables.length > 0 ? body.tables : undefined,
              retentionCount: body.retentionCount,
              databaseName: diagnostics.database,
            })

            await recordDatabaseAuditLog(req, {
              action: 'backup',
              entityType: 'vercel-blob-vault',
              documentId: saved.item.pathname,
              documentTitle: saved.item.filename,
              meta: {
                encrypted: true,
                format: vaultFormat,
                contentMode,
                sizeBytes: saved.item.sizeBytes,
                tables: saved.tableCount,
                rows: saved.rowCount,
                prunedCount: saved.prunedCount,
              },
            })

            return Response.json({
              ok: true,
              backup: saved,
              snapshot: await refreshSnapshot(),
            })
          }

          if (action === 'vault-delete') {
            if (!body.pathname?.trim()) {
              return Response.json({ error: 'Missing vault pathname.' }, { status: 400 })
            }
            await deleteCloudBackup(body.pathname, {
              env,
              driver: deps.blobDriver,
            })

            await recordDatabaseAuditLog(req, {
              action: 'delete',
              entityType: 'vercel-blob-vault',
              documentId: body.pathname,
              documentTitle: body.pathname.split('/').pop() ?? body.pathname,
            })

            return Response.json({
              ok: true,
              snapshot: await refreshSnapshot(),
            })
          }

          if (action === 'schedule-backup') {
            let waitUntilDate: Date | undefined
            if (body.waitUntil) {
              const parsed = new Date(body.waitUntil)
              if (Number.isNaN(parsed.getTime())) {
                return Response.json({ error: 'Invalid waitUntil timestamp.' }, { status: 400 })
              }
              waitUntilDate = parsed
            }

            const scheduledFormat =
              body.format === 'sql' || body.format === 'ndjson' ? body.format : 'json'

            const queued = await req.payload.jobs.queue({
              task: 'createDatabaseBackup',
              input: {
                retentionCount:
                  typeof body.retentionCount === 'number' && body.retentionCount > 0
                    ? body.retentionCount
                    : 10,
                label: body.label?.trim() || 'scheduled',
                format: scheduledFormat,
              },
              queue: 'default',
              ...(waitUntilDate ? { waitUntil: waitUntilDate } : {}),
              req,
            })

            await recordDatabaseAuditLog(req, {
              action: 'backup',
              entityType: 'scheduled-database-backup',
              documentId: String(queued.id),
              documentTitle: body.label?.trim() || 'scheduled',
              meta: {
                format: scheduledFormat,
                waitUntil: waitUntilDate ? waitUntilDate.toISOString() : null,
                retentionCount: body.retentionCount ?? 10,
              },
            })

            return Response.json({
              ok: true,
              jobId: queued.id,
              snapshot: await refreshSnapshot(),
            })
          }

          if (action === 'generate-migration') {
            const executor = getExecutor()
            if (!executor) {
              return Response.json({ error: 'POSTGRES_URL is not configured.' }, { status: 400 })
            }

            const artifact = await generateMigrationFromDatabase(executor, {
              name: body.name,
              mode: body.migrationMode ?? 'schema-baseline',
              tables: Array.isArray(body.tables) && body.tables.length > 0 ? body.tables : undefined,
              anonymizePii: Boolean(body.anonymizePii),
              redactSecrets: true,
              writeToDisk: Boolean(body.writeToDisk),
              env,
            })

            await recordDatabaseAuditLog(req, {
              action: 'backup',
              entityType: 'postgresql-migration-codegen',
              documentId: artifact.relativePath,
              documentTitle: artifact.filename,
              meta: {
                mode: artifact.mode,
                language: artifact.language,
                tables: artifact.tableCount,
                rows: artifact.rowCount,
                writtenToDisk: artifact.writtenToDisk,
                sizeBytes: artifact.sizeBytes,
              },
            })

            return Response.json({
              ok: true,
              artifact,
              ...(artifact.writtenToDisk ? { snapshot: await refreshSnapshot() } : {}),
            })
          }

          if (action === 'generate-seed') {
            const executor = getExecutor()
            if (!executor) {
              return Response.json({ error: 'POSTGRES_URL is not configured.' }, { status: 400 })
            }

            const artifact = await generateSeedFromDatabase(req.payload, executor, {
              name: body.name,
              mode: body.seedMode ?? 'payload-local-api',
              collections:
                Array.isArray(body.collections) && body.collections.length > 0
                  ? body.collections
                  : undefined,
              globals:
                Array.isArray(body.globals) && body.globals.length > 0
                  ? body.globals
                  : undefined,
              tables:
                Array.isArray(body.tables) && body.tables.length > 0 ? body.tables : undefined,
              anonymizePii: body.anonymizePii !== false,
              includeDrafts: body.includeDrafts !== false,
              writeToDisk: Boolean(body.writeToDisk),
              env,
            })

            await recordDatabaseAuditLog(req, {
              action: 'backup',
              entityType: 'postgresql-seed-codegen',
              documentId: artifact.relativePath,
              documentTitle: artifact.filename,
              meta: {
                mode: artifact.mode,
                language: artifact.language,
                entities: artifact.tableCount,
                records: artifact.rowCount,
                writtenToDisk: artifact.writtenToDisk,
                sizeBytes: artifact.sizeBytes,
              },
            })

            return Response.json({
              ok: true,
              artifact,
              ...(artifact.writtenToDisk ? { snapshot: await refreshSnapshot() } : {}),
            })
          }

          if (action === 'sql-query') {
            const queryResult = await executeReadOnlyDiagnosticQuery(body.sql ?? '', {
              explain: Boolean(body.explain),
              maxRows: body.maxRows,
              env,
              executor: deps.executor,
              directRunner: deps.directRunner,
            })
            return Response.json({
              ok: true,
              queryResult,
            })
          }

          if (action === 'repair') {
            const repairAction = body.repairAction?.trim() ?? ''
            if (!VALID_REPAIR_ACTIONS.has(repairAction)) {
              return Response.json(
                { error: `Unknown repair action "${repairAction}".` },
                { status: 400 },
              )
            }

            const result = await runDatabaseRepairAction(
              req.payload,
              repairAction as RepairActionKind,
              {
                env,
                executor: deps.executor,
                directRunner: deps.directRunner,
                tableName: body.tableName?.trim() || undefined,
                forceAllLocks: Boolean(body.forceAllLocks),
              },
            )

            await recordDatabaseAuditLog(req, {
              action: 'maintenance',
              entityType: `postgresql-${repairAction}`,
              documentTitle: body.tableName?.trim() || 'public schema',
              summary: result.summary,
              meta: {
                repairAction,
                usedUnpooledConnection: result.usedUnpooledConnection,
                durationMs: result.durationMs,
                ...result.details,
              },
            })

            return Response.json({
              ok: true,
              result,
              snapshot: await refreshSnapshot(),
            })
          }

          // Tier 2: Serverless Provider Adapter Actions
          if (action.startsWith('provider-')) {
            const slug: ProviderSlug =
              body.provider ??
              adapters.find((a) => a.matchesConnection(diagnostics))?.slug ??
              'neon'
            const adapter = getProviderAdapterBySlug(slug, adapters)
            if (!adapter) {
              return Response.json(
                { error: `Unknown database provider "${slug}".` },
                { status: 400 },
              )
            }

            if (action === 'provider-snapshot-create') {
              if (!adapter.createSnapshot) {
                return Response.json(
                  { error: `${adapter.name} does not support snapshot creation.` },
                  { status: 400 },
                )
              }
              const snapshotItem = await adapter.createSnapshot(
                { name: body.name, expiresInDays: body.expiresInDays },
                diagnostics,
                env,
              )

              await recordDatabaseAuditLog(req, {
                action: 'backup',
                entityType: `${adapter.slug}-snapshot`,
                documentId: snapshotItem.id,
                documentTitle: snapshotItem.name,
                meta: {
                  provider: adapter.slug,
                  sourceBranchId: snapshotItem.sourceBranchId,
                  expiresAt: snapshotItem.expiresAt,
                },
              })

              return Response.json({
                ok: true,
                snapshotItem,
                snapshot: await refreshSnapshot(),
              })
            }

            if (action === 'provider-snapshot-delete') {
              if (!adapter.deleteSnapshot || !body.snapshotId?.trim()) {
                return Response.json(
                  { error: 'Missing snapshotId or unsupported operation.' },
                  { status: 400 },
                )
              }
              await adapter.deleteSnapshot(body.snapshotId, diagnostics, env)

              await recordDatabaseAuditLog(req, {
                action: 'delete',
                entityType: `${adapter.slug}-snapshot`,
                documentId: body.snapshotId,
                documentTitle: body.snapshotId,
              })

              return Response.json({
                ok: true,
                snapshot: await refreshSnapshot(),
              })
            }

            if (action === 'provider-snapshot-restore') {
              if (!adapter.restoreSnapshot || !body.snapshotId?.trim()) {
                return Response.json(
                  { error: 'Missing snapshotId or unsupported operation.' },
                  { status: 400 },
                )
              }
              const branch = await adapter.restoreSnapshot(
                {
                  snapshotId: body.snapshotId,
                  newBranchName: body.newBranchName,
                  targetBranchId: body.targetBranchId,
                  finalize: body.finalize,
                },
                diagnostics,
                env,
              )

              await recordDatabaseAuditLog(req, {
                action: 'restore',
                entityType: `${adapter.slug}-snapshot-restore`,
                documentId: branch.id,
                documentTitle: branch.name,
                meta: {
                  snapshotId: body.snapshotId,
                  targetBranchId: body.targetBranchId ?? null,
                  restoredBranchId: branch.id,
                },
              })

              return Response.json({
                ok: true,
                branch,
                snapshot: await refreshSnapshot(),
              })
            }

            if (action === 'provider-branch-create') {
              if (!adapter.createBranch || !body.name?.trim()) {
                return Response.json(
                  { error: 'Missing branch name or unsupported operation.' },
                  { status: 400 },
                )
              }
              const branch = await adapter.createBranch(
                {
                  name: body.name,
                  parentBranchId: body.parentBranchId,
                  parentTimestamp: body.parentTimestamp,
                  expiresInHours: body.expiresInHours,
                  noCompute: body.noCompute,
                },
                diagnostics,
                env,
              )

              await recordDatabaseAuditLog(req, {
                action: 'create',
                entityType: `${adapter.slug}-branch`,
                documentId: branch.id,
                documentTitle: branch.name,
                meta: {
                  parentId: branch.parentId,
                  parentTimestamp: body.parentTimestamp ?? null,
                  expiresAt: branch.expiresAt,
                  noCompute: Boolean(body.noCompute),
                },
              })

              return Response.json({
                ok: true,
                branch,
                snapshot: await refreshSnapshot(),
              })
            }

            if (action === 'provider-branch-delete') {
              if (!adapter.deleteBranch || !body.branchId?.trim()) {
                return Response.json(
                  { error: 'Missing branchId or unsupported operation.' },
                  { status: 400 },
                )
              }
              await adapter.deleteBranch(body.branchId, diagnostics, env)

              await recordDatabaseAuditLog(req, {
                action: 'delete',
                entityType: `${adapter.slug}-branch`,
                documentId: body.branchId,
                documentTitle: body.branchId,
              })

              return Response.json({
                ok: true,
                snapshot: await refreshSnapshot(),
              })
            }

            if (action === 'provider-compute') {
              if (
                !adapter.controlCompute ||
                !body.endpointId?.trim()) {
                return Response.json(
                  { error: 'Invalid compute endpoint control parameters.' },
                  { status: 400 },
                )
              }
              if (!body.operation || !['start', 'suspend', 'restart'].includes(body.operation)) {
                return Response.json(
                  { error: 'Invalid compute endpoint control parameters.' },
                  { status: 400 },
                )
              }
              const endpoint = await adapter.controlCompute(
                { endpointId: body.endpointId, operation: body.operation },
                diagnostics,
                env,
              )

              await recordDatabaseAuditLog(req, {
                action: 'maintenance',
                entityType: `${adapter.slug}-compute-${body.operation}`,
                documentId: endpoint.id,
                documentTitle: endpoint.host,
                meta: {
                  operation: body.operation,
                  currentState: endpoint.currentState,
                },
              })

              return Response.json({
                ok: true,
                endpoint,
                snapshot: await refreshSnapshot(),
              })
            }
          }

          return Response.json(
            { error: `Unsupported database action "${action}".` },
            { status: 400 },
          )
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Database action failed.' },
            { status: 500 },
          )
        }
      },
    },
  ]
}

export const adminDatabaseEndpoints = createDatabaseManagementEndpoints()
