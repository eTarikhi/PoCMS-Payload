import type { Plugin, TaskConfig } from 'payload'

import { saveEncryptedBackupToVault } from './core/backup'
import { createPayloadSqlExecutor, resolvePostgresUrls } from './core/connection'
import { createDatabaseManagementEndpoints } from './endpoints'
import { DEFAULT_PROVIDER_ADAPTERS } from './providers/registry'
import type { DatabaseProviderAdapter } from './providers/types'

export type DatabaseManagerPluginOptions = {
  enabled?: boolean
  adapters?: readonly DatabaseProviderAdapter[]
  defaultRetentionCount?: number
}

export function createDatabaseBackupJobTask(
  defaultRetentionCount = 10,
): TaskConfig<'createDatabaseBackup'> {
  return {
    slug: 'createDatabaseBackup',
    label: 'Encrypted cloud database backup',
    retries: 1,
    inputSchema: [
      { name: 'retentionCount', type: 'number', defaultValue: defaultRetentionCount },
      { name: 'label', type: 'text', defaultValue: 'scheduled' },
    ],
    outputSchema: [
      { name: 'pathname', type: 'text' },
      { name: 'sizeBytes', type: 'number' },
      { name: 'tables', type: 'number' },
      { name: 'rows', type: 'number' },
      { name: 'prunedCount', type: 'number' },
      { name: 'uploadedAt', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const executor = createPayloadSqlExecutor(req.payload)
      if (!executor) {
        throw new Error('POSTGRES_URL is not configured for scheduled backup.')
      }
      const { diagnostics } = resolvePostgresUrls()
      const retentionCount =
        typeof input?.retentionCount === 'number' && input.retentionCount > 0
          ? input.retentionCount
          : defaultRetentionCount
      const label =
        typeof input?.label === 'string' && input.label.trim().length > 0
          ? input.label.trim()
          : 'scheduled'

      const saved = await saveEncryptedBackupToVault(executor, {
        retentionCount,
        label,
        databaseName: diagnostics.database,
      })

      return {
        output: {
          pathname: saved.item.pathname,
          sizeBytes: saved.item.sizeBytes,
          tables: saved.tableCount,
          rows: saved.rowCount,
          prunedCount: saved.prunedCount,
          uploadedAt: saved.item.uploadedAt,
        },
      }
    },
  }
}

/**
 * Two-Tier Database Management Plugin for Payload CMS 3:
 *   1. Pilot Tier (Core PostgreSQL): Monitoring, pure-TS logical backup (browser + encrypted Vercel Blob),
 *      dry-run & transactional FK-ordered restore, and sequence / bloat / Payload hygiene repair.
 *   2. Advanced Tier (Serverless Provider Adapters): Neon `@neon/sdk` (snapshots, branches/PITR, compute
 *      controls, auto pre-restore safety snapshots), Supabase Management API, and Prisma Postgres API.
 */
export const databaseManagerPlugin =
  (options: DatabaseManagerPluginOptions = {}): Plugin =>
  (config) => {
    if (options.enabled === false) return config

    const adapters = options.adapters ?? DEFAULT_PROVIDER_ADAPTERS
    const endpoints = createDatabaseManagementEndpoints({ adapters })
    const backupTask = createDatabaseBackupJobTask(options.defaultRetentionCount ?? 10)

    const existingViews = config.admin?.components?.views ?? {}
    const existingWidgets = config.admin?.dashboard?.widgets ?? []
    const hasDatabaseWidget = existingWidgets.some((w) => w.slug === 'database-health')

    return {
      ...config,
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          views: {
            ...existingViews,
            database: {
              Component: '/components/admin/views/Database#DatabaseView',
              path: '/database',
              meta: { title: 'Database manager' },
            },
          },
        },
        dashboard: config.admin?.dashboard
          ? {
              ...config.admin.dashboard,
              widgets: hasDatabaseWidget
                ? existingWidgets
                : [
                    ...existingWidgets,
                    {
                      slug: 'database-health',
                      label: 'Database health',
                      Component: '/components/admin/widgets/DatabaseHealth#DatabaseHealthWidget',
                      minWidth: 'small',
                    },
                  ],
            }
          : undefined,
      },
      endpoints: [...(config.endpoints ?? []), ...endpoints],
      jobs: config.jobs
        ? {
            ...config.jobs,
            tasks: [...(config.jobs.tasks ?? []), backupTask as never],
          }
        : config.jobs,
    }
  }
