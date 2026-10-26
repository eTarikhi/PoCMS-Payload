import type { Payload } from 'payload'

import { collectDatabaseAdvisorReport } from './core/advisor'
import {
  listCloudBackups,
  type BlobVaultDriver,
} from './core/backup'
import { inspectCodegenCatalog, isCodegenDiskWriteAllowed } from './core/codegen'
import { createPayloadSqlExecutor, type SqlExecutor } from './core/connection'
import { collectCorePostgresHealth } from './core/monitor'
import {
  collectProviderStatuses,
  DEFAULT_PROVIDER_ADAPTERS,
} from './providers/registry'
import type { DatabaseProviderAdapter } from './providers/types'
import type {
  CodegenCatalog,
  DatabaseAdvisorReport,
  DatabaseManagementSnapshot,
} from './shared'

const EMPTY_ADVISOR_REPORT: DatabaseAdvisorReport = {
  missingFkIndexes: [],
  unusedIndexes: [],
  pgStatStatementsAvailable: false,
  slowQueries: [],
  orphanedMediaCount: null,
  recommendations: [],
}

/**
 * Orchestrates Tier-1 Core PostgreSQL telemetry, Advisor diagnostics, Codegen catalog,
 * Vercel Blob Backup Vault listing, and Tier-2 Pluggable Serverless Provider status in parallel.
 */
export async function collectDatabaseManagementSnapshot(
  payload: Payload,
  options: {
    executor?: SqlExecutor | null
    blobDriver?: BlobVaultDriver
    adapters?: readonly DatabaseProviderAdapter[]
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<DatabaseManagementSnapshot> {
  const env = options.env ?? process.env
  const adapters = options.adapters ?? DEFAULT_PROVIDER_ADAPTERS
  const executor =
    options.executor !== undefined ? options.executor : createPayloadSqlExecutor(payload, env)

  const emptyCodegen: CodegenCatalog = {
    canWriteToDisk: isCodegenDiskWriteAllowed(env),
    migrationsDir: 'src/migrations',
    seedsDir: 'src/seed/generated',
    tables: [],
    collections: [],
    globals: [],
    existingMigrations: [],
    existingGeneratedSeeds: [],
  }

  const [core, vault, advisor, codegen] = await Promise.all([
    collectCorePostgresHealth(payload, { executor, env }),
    listCloudBackups({ env, driver: options.blobDriver }),
    executor
      ? collectDatabaseAdvisorReport(executor).catch(() => EMPTY_ADVISOR_REPORT)
      : Promise.resolve(EMPTY_ADVISOR_REPORT),
    executor
      ? inspectCodegenCatalog(payload, executor, env).catch(() => emptyCodegen)
      : Promise.resolve(emptyCodegen),
  ])

  const providerData = await collectProviderStatuses(core.connection, {
    adapters,
    env,
  })

  return {
    generatedAt: new Date().toISOString(),
    connection: core.connection,
    vitals: core.vitals,
    tables: core.tables,
    sequences: core.sequences,
    hygiene: core.hygiene,
    advisor,
    codegen,
    vault,
    activeProvider: providerData.activeProvider,
    providers: providerData.providers,
  }
}
