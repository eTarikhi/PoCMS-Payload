import type {
  ConnectionDiagnostics,
  ProviderBranchItem,
  ProviderCapability,
  ProviderComputeEndpointItem,
  ProviderSlug,
  ProviderSnapshotItem,
  ProviderStatusDescriptor,
} from '../shared'

export type CreateSnapshotInput = {
  name?: string
  expiresInDays?: number
}

export type RestoreSnapshotActionInput = {
  snapshotId: string
  newBranchName?: string
  targetBranchId?: string
  finalize?: boolean
}

export type CreateBranchActionInput = {
  name: string
  parentBranchId?: string
  parentTimestamp?: string
  expiresInHours?: number
  noCompute?: boolean
}

export type ComputeControlInput = {
  endpointId: string
  operation: 'start' | 'suspend' | 'restart'
}

/**
 * Pluggable Tier-2 Serverless PostgreSQL Provider Adapter contract.
 * Keeps Tier-1 Core Postgres features 100% provider-agnostic while unlocking instant CoW snapshots,
 * PITR branches, and serverless compute controls when a provider API key is configured.
 */
export interface DatabaseProviderAdapter {
  readonly slug: ProviderSlug
  readonly name: string
  readonly requiredEnv: readonly string[]
  readonly optionalEnv: readonly string[]
  readonly docsUrl: string
  readonly capabilities: readonly ProviderCapability[]

  matchesConnection(connection: ConnectionDiagnostics): boolean

  getStatus(
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<ProviderStatusDescriptor>

  createSnapshot?(
    input: CreateSnapshotInput,
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<ProviderSnapshotItem>

  deleteSnapshot?(
    snapshotId: string,
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<void>

  restoreSnapshot?(
    input: RestoreSnapshotActionInput,
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<ProviderBranchItem>

  createBranch?(
    input: CreateBranchActionInput,
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<ProviderBranchItem>

  deleteBranch?(
    branchId: string,
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<void>

  controlCompute?(
    input: ComputeControlInput,
    connection: ConnectionDiagnostics,
    env?: NodeJS.ProcessEnv,
  ): Promise<ProviderComputeEndpointItem>
}
