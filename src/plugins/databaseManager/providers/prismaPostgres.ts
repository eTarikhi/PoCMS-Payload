import { fetchJSON, settle } from '@/integrations/result'

import type {
  ConnectionDiagnostics,
  ProviderCapability,
  ProviderOverviewData,
  ProviderStatusDescriptor,
} from '../shared'

import type { DatabaseProviderAdapter } from './types'

const PRISMA_CAPABILITIES: readonly ProviderCapability[] = ['snapshots', 'branches']

type PrismaDatabaseResponse = {
  data?: {
    id?: string
    name?: string
    region?: string
    status?: string
    pgVersion?: string
  }
  id?: string
  name?: string
  region?: string
  pgVersion?: string
}

/**
 * Pluggable Tier-2 Provider Adapter for Prisma Postgres (`PRISMA_SERVICE_TOKEN` + `PRISMA_DATABASE_ID`).
 */
export const prismaPostgresProviderAdapter: DatabaseProviderAdapter = {
  slug: 'prisma-postgres',
  name: 'Prisma Postgres',
  requiredEnv: ['PRISMA_SERVICE_TOKEN', 'PRISMA_DATABASE_ID'],
  optionalEnv: [],
  docsUrl: 'https://www.prisma.io/docs/postgres/introduction/management-api',
  capabilities: PRISMA_CAPABILITIES,

  matchesConnection(connection: ConnectionDiagnostics): boolean {
    return connection.hostKind === 'prisma-postgres'
  },

  async getStatus(
    connection: ConnectionDiagnostics,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<ProviderStatusDescriptor> {
    const detectedFromHost = this.matchesConnection(connection)
    const token = env.PRISMA_SERVICE_TOKEN?.trim()
    const databaseId = env.PRISMA_DATABASE_ID?.trim()

    const missing: string[] = []
    if (!token) missing.push('PRISMA_SERVICE_TOKEN')
    if (!databaseId) missing.push('PRISMA_DATABASE_ID')

    if (missing.length > 0) {
      return {
        slug: this.slug,
        name: this.name,
        detectedFromHost,
        requiredEnv: [...this.requiredEnv],
        optionalEnv: [...this.optionalEnv],
        docsUrl: this.docsUrl,
        capabilities: [...this.capabilities],
        result: { status: 'not-configured', missing },
      }
    }

    const result = await settle<ProviderOverviewData>(async () => {
      const raw = await fetchJSON<PrismaDatabaseResponse>(
        `https://api.prisma.io/v1/databases/${encodeURIComponent(databaseId!)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          revalidate: 0,
        },
      )
      const db = raw.data ?? raw

      return {
        provider: 'prisma-postgres',
        providerName: this.name,
        projectId: db.id ?? databaseId!,
        projectName: db.name ?? databaseId!,
        regionId: db.region ?? 'global',
        pgVersion: db.pgVersion ?? '16',
        activeBranchId: 'main',
        activeEndpointId: null,
        autoDetectedProject: false,
        capabilities: [...PRISMA_CAPABILITIES],
        snapshots: [],
        branches: [],
        endpoints: [],
        notes: ['Connected to Prisma Postgres Management API.'],
      }
    })

    return {
      slug: this.slug,
      name: this.name,
      detectedFromHost,
      requiredEnv: [...this.requiredEnv],
      optionalEnv: [...this.optionalEnv],
      docsUrl: this.docsUrl,
      capabilities: [...this.capabilities],
      result,
    }
  },
}
