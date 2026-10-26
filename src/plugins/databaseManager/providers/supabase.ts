import { fetchJSON, settle } from '@/integrations/result'

import type {
  ConnectionDiagnostics,
  ProviderCapability,
  ProviderOverviewData,
  ProviderSnapshotItem,
  ProviderStatusDescriptor,
} from '../shared'

import type { DatabaseProviderAdapter } from './types'

const SUPABASE_CAPABILITIES: readonly ProviderCapability[] = ['snapshots', 'branches', 'pitr']

type SupabaseProjectResponse = {
  id: string
  name: string
  region: string
  status?: string
  database?: { version?: string }
}

type SupabaseBackupsResponse = {
  region?: string
  pitr_enabled?: boolean
  backups?: Array<{
    id?: string | number
    inserted_at?: string
    status?: string
    is_physical_backup?: boolean
  }>
}

/**
 * Pluggable Tier-2 Provider Adapter for Supabase PostgreSQL (`SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`).
 * Automatically extracts `SUPABASE_PROJECT_REF` from `POSTGRES_URL` when connected to `db.<ref>.supabase.co` or Supavisor.
 */
export const supabaseProviderAdapter: DatabaseProviderAdapter = {
  slug: 'supabase',
  name: 'Supabase PostgreSQL',
  requiredEnv: ['SUPABASE_ACCESS_TOKEN'],
  optionalEnv: ['SUPABASE_PROJECT_REF'],
  docsUrl: 'https://supabase.com/docs/reference/api/introduction',
  capabilities: SUPABASE_CAPABILITIES,

  matchesConnection(connection: ConnectionDiagnostics): boolean {
    return connection.hostKind === 'supabase'
  },

  async getStatus(
    connection: ConnectionDiagnostics,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<ProviderStatusDescriptor> {
    const detectedFromHost = this.matchesConnection(connection)
    const token = env.SUPABASE_ACCESS_TOKEN?.trim()
    const projectRef = env.SUPABASE_PROJECT_REF?.trim() || connection.supabaseProjectRef

    const missing: string[] = []
    if (!token) missing.push('SUPABASE_ACCESS_TOKEN')
    if (!projectRef) missing.push('SUPABASE_PROJECT_REF')

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
      const headers = { Authorization: `Bearer ${token}` }
      const [project, backupsRes] = await Promise.all([
        fetchJSON<SupabaseProjectResponse>(
          `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef!)}`,
          { headers, revalidate: 0 },
        ),
        fetchJSON<SupabaseBackupsResponse>(
          `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef!)}/database/backups`,
          { headers, revalidate: 0 },
        ).catch((): SupabaseBackupsResponse => ({ pitr_enabled: false, backups: [] })),
      ])

      const snapshots: ProviderSnapshotItem[] = (backupsRes.backups ?? []).map((b, idx) => ({
        id: String(b.id ?? `sb-backup-${idx}`),
        name: `${b.is_physical_backup ? 'Physical' : 'Logical'} backup (${b.status ?? 'COMPLETED'})`,
        sourceBranchId: null,
        lsn: null,
        timestamp: b.inserted_at ?? null,
        createdAt: b.inserted_at ?? new Date().toISOString(),
        expiresAt: null,
        manual: false,
      }))

      return {
        provider: 'supabase',
        providerName: this.name,
        projectId: project.id || projectRef!,
        projectName: project.name || projectRef!,
        regionId: project.region || backupsRes.region || 'unknown',
        pgVersion: project.database?.version ?? '15+',
        activeBranchId: 'main',
        activeEndpointId: null,
        autoDetectedProject: !env.SUPABASE_PROJECT_REF?.trim(),
        capabilities: [...SUPABASE_CAPABILITIES],
        snapshots,
        branches: [],
        endpoints: [],
        notes: [
          backupsRes.pitr_enabled
            ? 'Supabase Point-in-Time Recovery (PITR) is active on this project.'
            : 'Supabase daily automated backups inspected via Management API.',
        ],
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
