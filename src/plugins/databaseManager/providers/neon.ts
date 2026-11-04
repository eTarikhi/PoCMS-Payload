import { createNeonClient, type NeonClient } from '@neon/sdk'

import { IntegrationError, settle } from '@/integrations/result'

import type {
  ConnectionDiagnostics,
  ProviderBranchItem,
  ProviderCapability,
  ProviderComputeEndpointItem,
  ProviderOverviewData,
  ProviderSnapshotItem,
  ProviderStatusDescriptor,
} from '../shared'

import type {
  ComputeControlInput,
  CreateBranchActionInput,
  CreateSnapshotInput,
  DatabaseProviderAdapter,
  RestoreSnapshotActionInput,
} from './types'

export type NeonClientFactory = (apiKey: string) => NeonClient

type ResolvedNeonTarget = {
  projectId: string
  projectName: string
  regionId: string
  pgVersion: string
  activeBranchId: string | null
  activeEndpointId: string | null
  autoDetectedProject: boolean
}

const NEON_CAPABILITIES: readonly ProviderCapability[] = [
  'snapshots',
  'branches',
  'pitr',
  'compute',
  'auto-safety-snapshot',
]

function unwrapNeonOutcome<T>(outcome: {
  data?: T
  error?: { message?: string; status?: number | string } | null
}): T {
  if (outcome.error) {
    const httpStatus = typeof outcome.error.status === 'number' ? outcome.error.status : undefined
    throw new IntegrationError(
      outcome.error.message || 'Neon API request failed',
      httpStatus,
      outcome.error,
    )
  }
  return outcome.data as T
}

function mapBranch(b: {
  id: string
  name: string
  parent_id?: string
  default: boolean
  protected: boolean
  current_state: string
  logical_size?: number
  created_at: string
  expires_at?: string
}): ProviderBranchItem {
  return {
    id: b.id,
    name: b.name,
    parentId: b.parent_id ?? null,
    isDefault: Boolean(b.default),
    isProtected: Boolean(b.protected),
    currentState: b.current_state,
    logicalSizeBytes: typeof b.logical_size === 'number' ? b.logical_size : null,
    createdAt: b.created_at,
    expiresAt: b.expires_at ?? null,
  }
}

function mapSnapshot(s: {
  id: string
  name: string
  source_branch_id?: string
  lsn?: string
  timestamp?: string
  created_at: string
  expires_at?: string
  manual?: boolean
}): ProviderSnapshotItem {
  return {
    id: s.id,
    name: s.name,
    sourceBranchId: s.source_branch_id ?? null,
    lsn: s.lsn ?? null,
    timestamp: s.timestamp ?? null,
    createdAt: s.created_at,
    expiresAt: s.expires_at ?? null,
    manual: Boolean(s.manual),
  }
}

function mapEndpoint(ep: {
  id: string
  host: string
  branch_id: string
  type: string
  current_state: string
  autoscaling_limit_min_cu: number
  autoscaling_limit_max_cu: number
  suspend_timeout_seconds?: number
  region_id: string
}): ProviderComputeEndpointItem {
  return {
    id: ep.id,
    host: ep.host,
    branchId: ep.branch_id,
    type: ep.type,
    currentState: ep.current_state,
    minCu: ep.autoscaling_limit_min_cu,
    maxCu: ep.autoscaling_limit_max_cu,
    suspendTimeoutSeconds:
      typeof ep.suspend_timeout_seconds === 'number' ? ep.suspend_timeout_seconds : null,
    regionId: ep.region_id,
  }
}

/**
 * Resolves the Neon `projectId`, `branchId`, and `endpointId` either from explicit env vars
 * (`NEON_PROJECT_ID`, `NEON_BRANCH_ID`) or automatically by matching the `ep-...` endpoint ID
 * extracted from `POSTGRES_URL` across the account's Neon projects!
 */
async function resolveNeonTarget(
  neon: NeonClient,
  connection: ConnectionDiagnostics,
  env: NodeJS.ProcessEnv,
): Promise<ResolvedNeonTarget> {
  const explicitProjectId = env.NEON_PROJECT_ID?.trim()
  const explicitBranchId = env.NEON_BRANCH_ID?.trim()
  const hostEndpointId = connection.neonEndpointId

  if (explicitProjectId) {
    const projectResp = unwrapNeonOutcome(
      await neon.projects.get({ projectId: explicitProjectId }),
    ) as {
      project?: {
        id: string
        name: string
        region_id: string
        pg_version: number | string
      }
      id?: string
      name?: string
      region_id?: string
      pg_version?: number | string
    }
    const proj = projectResp.project ?? projectResp
    const endpoints = unwrapNeonOutcome(
      await neon.postgres.endpoints.list({ projectId: explicitProjectId }),
    )
    const matchedEndpoint = hostEndpointId
      ? endpoints.find((ep) => ep.id === hostEndpointId)
      : endpoints.find((ep) => ep.type === 'read_write') ?? endpoints[0]

    let activeBranchId: string | null =
      explicitBranchId || matchedEndpoint?.branch_id || null
    if (!activeBranchId) {
      const def = await neon.branches.getDefault({ projectId: explicitProjectId })
      if (!def.error && def.data) activeBranchId = def.data.id
    }

    return {
      projectId: proj.id ?? explicitProjectId,
      projectName: proj.name ?? explicitProjectId,
      regionId: proj.region_id ?? matchedEndpoint?.region_id ?? 'unknown',
      pgVersion: String(proj.pg_version ?? ''),
      activeBranchId,
      activeEndpointId: matchedEndpoint?.id ?? null,
      autoDetectedProject: false,
    }
  }

  // Auto-discover from `neon.projects.list()`
  const projectsOutcome = await neon.projects.list({ limit: 50 }).all()
  const projects = unwrapNeonOutcome(projectsOutcome)
  if (projects.length === 0) {
    throw new IntegrationError('No Neon projects found for this NEON_API_KEY.')
  }

  if (hostEndpointId) {
    for (const proj of projects) {
      const epsRes = await neon.postgres.endpoints.list({ projectId: proj.id })
      if (epsRes.error || !epsRes.data) continue
      const match = epsRes.data.find((ep) => ep.id === hostEndpointId)
      if (match) {
        return {
          projectId: proj.id,
          projectName: proj.name,
          regionId: proj.region_id,
          pgVersion: String(proj.pg_version),
          activeBranchId: explicitBranchId || match.branch_id,
          activeEndpointId: match.id,
          autoDetectedProject: true,
        }
      }
    }
  }

  if (projects.length === 1) {
    const single = projects[0]!
    const epsRes = await neon.postgres.endpoints.list({ projectId: single.id })
    const eps = epsRes.data ?? []
    const rw = eps.find((ep) => ep.type === 'read_write') ?? eps[0]
    let activeBranchId: string | null = explicitBranchId || rw?.branch_id || null
    if (!activeBranchId) {
      const def = await neon.branches.getDefault({ projectId: single.id })
      if (!def.error && def.data) activeBranchId = def.data.id
    }
    return {
      projectId: single.id,
      projectName: single.name,
      regionId: single.region_id,
      pgVersion: String(single.pg_version),
      activeBranchId,
      activeEndpointId: rw?.id ?? null,
      autoDetectedProject: true,
    }
  }

  throw new IntegrationError(
    `Found ${projects.length} Neon projects on this account and could not match endpoint "${hostEndpointId ?? 'unknown'}". Set NEON_PROJECT_ID to select the target project.`,
  )
}

export function createNeonProviderAdapter(
  clientFactory: NeonClientFactory = (apiKey) => createNeonClient({ apiKey }),
): DatabaseProviderAdapter {
  const getClient = (env: NodeJS.ProcessEnv): NeonClient => {
    const apiKey = env.NEON_API_KEY?.trim()
    if (!apiKey) {
      throw new IntegrationError('NEON_API_KEY is not configured.')
    }
    return clientFactory(apiKey)
  }

  return {
    slug: 'neon',
    name: 'Neon Serverless Postgres',
    requiredEnv: ['NEON_API_KEY'],
    optionalEnv: ['NEON_PROJECT_ID', 'NEON_BRANCH_ID'],
    docsUrl: 'https://neon.com/docs/manage/api-keys',
    capabilities: NEON_CAPABILITIES,

    matchesConnection(connection: ConnectionDiagnostics): boolean {
      return connection.hostKind === 'neon' || connection.hostKind === 'vercel-postgres'
    },

    async getStatus(
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<ProviderStatusDescriptor> {
      const detectedFromHost = this.matchesConnection(connection)
      const apiKey = env.NEON_API_KEY?.trim()

      if (!apiKey) {
        return {
          slug: this.slug,
          name: this.name,
          detectedFromHost,
          requiredEnv: [...this.requiredEnv],
          optionalEnv: [...this.optionalEnv],
          docsUrl: this.docsUrl,
          capabilities: [...this.capabilities],
          result: { status: 'not-configured', missing: ['NEON_API_KEY'] },
        }
      }

      const result = await settle<ProviderOverviewData>(async () => {
        const neon = clientFactory(apiKey)
        const target = await resolveNeonTarget(neon, connection, env)

        const [branchesOut, snapshotsOut, endpointsOut] = await Promise.all([
          neon.branches.list({ projectId: target.projectId }).all(),
          neon.snapshots.list({ projectId: target.projectId }),
          neon.postgres.endpoints.list({ projectId: target.projectId }),
        ])

        const branchesRaw = unwrapNeonOutcome(branchesOut)
        const snapshotsRaw = snapshotsOut.error ? [] : (snapshotsOut.data ?? [])
        const endpointsRaw = unwrapNeonOutcome(endpointsOut)

        return {
          provider: 'neon',
          providerName: this.name,
          projectId: target.projectId,
          projectName: target.projectName,
          regionId: target.regionId,
          pgVersion: target.pgVersion,
          activeBranchId: target.activeBranchId,
          activeEndpointId: target.activeEndpointId,
          autoDetectedProject: target.autoDetectedProject,
          capabilities: [...NEON_CAPABILITIES],
          snapshots: snapshotsRaw
            .map((s) => mapSnapshot(s as Parameters<typeof mapSnapshot>[0]))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          branches: branchesRaw
            .map((b) => mapBranch(b as Parameters<typeof mapBranch>[0]))
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
          endpoints: endpointsRaw.map((ep) =>
            mapEndpoint(ep as Parameters<typeof mapEndpoint>[0]),
          ),
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

    async createSnapshot(
      input: CreateSnapshotInput,
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<ProviderSnapshotItem> {
      const neon = getClient(env)
      const target = await resolveNeonTarget(neon, connection, env)
      if (!target.activeBranchId) {
        throw new IntegrationError(
          'Could not determine the active Neon branch ID. Set NEON_BRANCH_ID.',
        )
      }

      const name =
        input.name?.trim() ||
        `pocms-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
      const expiresAt =
        typeof input.expiresInDays === 'number' && input.expiresInDays > 0
          ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
          : undefined

      const created = unwrapNeonOutcome(
        await neon.snapshots.create({
          projectId: target.projectId,
          branchId: target.activeBranchId,
          name,
          ...(expiresAt ? { expiresAt } : {}),
        }),
      )
      return mapSnapshot(created as Parameters<typeof mapSnapshot>[0])
    },

    async deleteSnapshot(
      snapshotId: string,
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<void> {
      const neon = getClient(env)
      const target = await resolveNeonTarget(neon, connection, env)
      unwrapNeonOutcome(
        await neon.snapshots.delete({
          projectId: target.projectId,
          snapshotId: snapshotId.trim(),
        }),
      )
    },

    async restoreSnapshot(
      input: RestoreSnapshotActionInput,
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<ProviderBranchItem> {
      const neon = getClient(env)
      const target = await resolveNeonTarget(neon, connection, env)
      const branch = unwrapNeonOutcome(
        await neon.snapshots.restore({
          projectId: target.projectId,
          snapshotId: input.snapshotId.trim(),
          ...(input.newBranchName?.trim() ? { name: input.newBranchName.trim() } : {}),
          ...(input.targetBranchId?.trim()
            ? { targetBranchId: input.targetBranchId.trim() }
            : {}),
          ...(typeof input.finalize === 'boolean' ? { finalize: input.finalize } : {}),
        }),
      )
      return mapBranch(branch as Parameters<typeof mapBranch>[0])
    },

    async createBranch(
      input: CreateBranchActionInput,
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<ProviderBranchItem> {
      const neon = getClient(env)
      const target = await resolveNeonTarget(neon, connection, env)
      const name = input.name.trim()
      if (!name) throw new IntegrationError('Branch name is required.')

      const parentId = input.parentBranchId?.trim() || target.activeBranchId || undefined
      const expiresAt =
        typeof input.expiresInHours === 'number' && input.expiresInHours > 0
          ? new Date(Date.now() + input.expiresInHours * 3_600_000).toISOString()
          : undefined

      const basePayload = {
        projectId: target.projectId,
        name,
        ...(parentId ? { parent_id: parentId } : {}),
        ...(input.parentTimestamp?.trim()
          ? { parent_timestamp: new Date(input.parentTimestamp.trim()).toISOString() }
          : {}),
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      }

      const branch = unwrapNeonOutcome(
        input.noCompute
          ? await neon.branches.create({ ...basePayload, noCompute: true })
          : await neon.branches.create({ ...basePayload, noCompute: false }),
      )
      return mapBranch(branch as Parameters<typeof mapBranch>[0])
    },

    async deleteBranch(
      branchId: string,
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<void> {
      const neon = getClient(env)
      const target = await resolveNeonTarget(neon, connection, env)
      const cleanId = branchId.trim()
      const existing = unwrapNeonOutcome(
        await neon.branches.get({ projectId: target.projectId, branchId: cleanId }),
      ) as { branch?: { default?: boolean; protected?: boolean; name?: string }; default?: boolean; protected?: boolean; name?: string }
      const b = existing.branch ?? existing
      if (b.default || b.protected) {
        throw new IntegrationError(
          `Refusing to delete branch "${b.name ?? cleanId}" because it is the default or protected production branch.`,
        )
      }
      unwrapNeonOutcome(
        await neon.branches.delete({
          projectId: target.projectId,
          branchId: cleanId,
        }),
      )
    },

    async controlCompute(
      input: ComputeControlInput,
      connection: ConnectionDiagnostics,
      env: NodeJS.ProcessEnv = process.env,
    ): Promise<ProviderComputeEndpointItem> {
      const neon = getClient(env)
      const target = await resolveNeonTarget(neon, connection, env)
      const endpointId = input.endpointId.trim()
      const params = { projectId: target.projectId, endpointId }

      const ep =
        input.operation === 'start'
          ? unwrapNeonOutcome(await neon.postgres.endpoints.start(params))
          : input.operation === 'suspend'
            ? unwrapNeonOutcome(await neon.postgres.endpoints.suspend(params))
            : unwrapNeonOutcome(await neon.postgres.endpoints.restart(params))

      return mapEndpoint(ep as Parameters<typeof mapEndpoint>[0])
    },
  }
}

export const neonProviderAdapter = createNeonProviderAdapter()
