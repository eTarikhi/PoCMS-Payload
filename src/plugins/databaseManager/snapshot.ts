import type { Payload } from 'payload'

import {
  listCloudBackups,
  type BlobVaultDriver,
} from './core/backup'
import type { SqlExecutor } from './core/connection'
import { collectCorePostgresHealth } from './core/monitor'
import {
  collectProviderStatuses,
  DEFAULT_PROVIDER_ADAPTERS,
} from './providers/registry'
import type { DatabaseProviderAdapter } from './providers/types'
import type { DatabaseManagementSnapshot } from './shared'

/**
 * Orchestrates Tier-1 Core PostgreSQL telemetry, Vercel Blob Backup Vault listing,
 * and Tier-2 Pluggable Serverless Provider status in parallel.
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

  const corePromise = collectCorePostgresHealth(payload, {
    executor: options.executor,
    env,
  })
  const vaultPromise = listCloudBackups({
    env,
    driver: options.blobDriver,
  })

  const [core, vault] = await Promise.all([corePromise, vaultPromise])
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
    vault,
    activeProvider: providerData.activeProvider,
    providers: providerData.providers,
  }
}
