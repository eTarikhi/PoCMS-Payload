import type {
  ConnectionDiagnostics,
  ProviderSlug,
  ProviderStatusDescriptor,
} from '../shared'

import { neonProviderAdapter } from './neon'
import { prismaPostgresProviderAdapter } from './prismaPostgres'
import { supabaseProviderAdapter } from './supabase'
import type { DatabaseProviderAdapter } from './types'

export const DEFAULT_PROVIDER_ADAPTERS: readonly DatabaseProviderAdapter[] = [
  neonProviderAdapter,
  supabaseProviderAdapter,
  prismaPostgresProviderAdapter,
]

export async function collectProviderStatuses(
  connection: ConnectionDiagnostics,
  options: {
    adapters?: readonly DatabaseProviderAdapter[]
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<{
  activeProvider: ProviderSlug | null
  providers: ProviderStatusDescriptor[]
}> {
  const adapters = options.adapters ?? DEFAULT_PROVIDER_ADAPTERS
  const env = options.env ?? process.env

  const providers = await Promise.all(
    adapters.map((adapter) => adapter.getStatus(connection, env)),
  )

  const hostMatched = providers.find((p) => p.detectedFromHost)
  const configuredMatched = providers.find((p) => p.result.status === 'ok')
  const activeProvider = hostMatched?.slug ?? configuredMatched?.slug ?? null

  return {
    activeProvider,
    providers,
  }
}

export function getProviderAdapterBySlug(
  slug: ProviderSlug,
  adapters: readonly DatabaseProviderAdapter[] = DEFAULT_PROVIDER_ADAPTERS,
): DatabaseProviderAdapter | undefined {
  return adapters.find((a) => a.slug === slug)
}
