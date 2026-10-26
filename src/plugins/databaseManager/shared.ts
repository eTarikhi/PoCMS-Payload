import type { RunTone } from '@/components/admin/elements/RunStatus'
import type { IntegrationResult } from '@/integrations/result'

/**
 * Pure isomorphic types and deterministic helpers for the Two-Tier Database Management Plugin:
 *   - Tier 1 (Pilot Core): Provider-agnostic PostgreSQL monitoring, portable logical backups,
 *     transactional restore, and sequence / bloat / Payload hygiene repair.
 *   - Tier 2 (Serverless Provider Adapters): Pluggable cloud API adapters (Neon `@neon/sdk`,
 *     Supabase Management API, Prisma Postgres API) unlocked via optional API keys.
 *
 * IMPORTANT: Keep this module completely free of `next/cache`, `node:*`, `pg`, `@neon/sdk`,
 * and `@vercel/blob` runtime imports so Client Components can safely import from it under Turbopack.
 */

export type DetectedDbHostKind =
  | 'neon'
  | 'vercel-postgres'
  | 'supabase'
  | 'prisma-postgres'
  | 'local'
  | 'postgresql'
  | 'unconfigured'

export type ConnectionDiagnostics = {
  configured: boolean
  hostKind: DetectedDbHostKind
  providerLabel: string
  host: string | null
  database: string | null
  pooled: boolean
  hasUnpooledUrl: boolean
  sslMode: string | null
  neonEndpointId: string | null
  supabaseProjectRef: string | null
  advisoryNote: string | null
}

export type DatabaseVitalStats = {
  status: 'connected' | 'unreachable' | 'not-configured'
  latencyMs: number | null
  serverVersion: string | null
  databaseSizeBytes: number | null
  cacheHitRatio: number | null
  transactionsCommitted: number | null
  transactionsRolledBack: number | null
  deadlocks: number | null
  statsResetAt: string | null
  connections: {
    total: number
    active: number
    idle: number
    idleInTransaction: number
    maxConnections: number | null
  } | null
  migrations: {
    applied: number
    latest: string | null
  } | null
  errorMessage: string | null
}

export type TableHealthRow = {
  tableName: string
  estimatedLiveRows: number
  deadTuples: number
  bloatRatioPercent: number
  tableBytes: number
  indexBytes: number
  totalBytes: number
  seqScans: number
  idxScans: number
  lastVacuum: string | null
  lastAutovacuum: string | null
  lastAnalyze: string | null
  lastAutoanalyze: string | null
}

export type SequenceHealthRow = {
  tableName: string
  columnName: string
  sequenceName: string
  lastValue: number
  maxId: number
  inSync: boolean
}

export type PayloadHygieneReport = {
  staleLocksCount: number
  failedJobsCount: number
  missingOrderRanks: Array<{
    collection: string
    tableName: string
    missingCount: number
  }>
  outOfSyncSequencesCount: number
  bloatedTablesCount: number
}

export type BackupColumnMeta = {
  name: string
  dataType: string
  udtName: string
  isNullable: boolean
}

export type BackupForeignKeyMeta = {
  column: string
  refTable: string
  refColumn: string
}

export type BackupTableDump = {
  name: string
  columns: BackupColumnMeta[]
  primaryKey: string[]
  foreignKeys: BackupForeignKeyMeta[]
  rowCount: number
  rows: Array<Record<string, unknown>>
}

export const LOGICAL_BACKUP_FORMAT = 'pocms-pg-logical-v1' as const

export type LogicalBackupArchive = {
  format: typeof LOGICAL_BACKUP_FORMAT
  createdAt: string
  appVersion: string
  payloadVersion: string
  serverVersion: string | null
  databaseName: string | null
  redactedSecrets: boolean
  migrations: Array<{ name: string; batch: number | null }>
  tables: BackupTableDump[]
  sequences: Array<{
    tableName: string
    columnName: string
    sequenceName: string
    maxId: number
  }>
  checksumSha256: string
}

export type CloudBackupItem = {
  pathname: string
  filename: string
  sizeBytes: number
  uploadedAt: string
  encrypted: boolean
}

export type BackupVaultStatus = {
  configured: boolean
  encryptionConfigured: boolean
  prefix: string
  items: CloudBackupItem[]
  errorMessage: string | null
}

export type RestoreDryRunReport = {
  valid: boolean
  format: string
  createdAt: string | null
  encrypted: boolean
  redactedSecrets: boolean
  checksumVerified: boolean
  totalTables: number
  totalRows: number
  matchedTables: string[]
  missingTargetTables: string[]
  columnWarnings: string[]
  migrationWarnings: string[]
  insertOrder: string[]
  cyclicTables: string[]
  tableSummaries: Array<{
    name: string
    backupRows: number
    targetExists: boolean
    missingColumns: string[]
  }>
}

export type RestoreExecutionResult = {
  ok: boolean
  restoredTables: number
  restoredRows: number
  syncedSequences: number
  usedUnpooledConnection: boolean
  safetySnapshotId: string | null
  safetySnapshotName: string | null
  durationMs: number
  warnings: string[]
}

export type RepairActionKind =
  | 'sync-sequences'
  | 'analyze-all'
  | 'vacuum-analyze'
  | 'reindex-public'
  | 'clear-stale-locks'
  | 'repair-order-ranks'

export const REPAIR_ACTION_META: readonly {
  action: RepairActionKind
  label: string
  description: string
  prefersUnpooled: boolean
  destructive: boolean
}[] = [
  {
    action: 'sync-sequences',
    label: 'Sync primary-key sequences',
    description:
      'Aligns every serial/identity sequence with COALESCE(MAX(id), 1) to prevent duplicate-key insert errors after seeds or manual imports.',
    prefersUnpooled: false,
    destructive: false,
  },
  {
    action: 'analyze-all',
    label: 'Update planner statistics (ANALYZE)',
    description:
      'Refreshes PostgreSQL row-distribution statistics across public tables for optimal query execution plans.',
    prefersUnpooled: false,
    destructive: false,
  },
  {
    action: 'vacuum-analyze',
    label: 'Reclaim dead tuples (VACUUM ANALYZE)',
    description:
      'Reclaims space from dead row versions and refreshes statistics. Automatically uses the direct unpooled connection when available.',
    prefersUnpooled: true,
    destructive: false,
  },
  {
    action: 'reindex-public',
    label: 'Rebuild table indexes (REINDEX)',
    description:
      'Rebuilds B-tree and relational indexes across public user tables over the direct connection to eliminate index bloat.',
    prefersUnpooled: true,
    destructive: false,
  },
  {
    action: 'clear-stale-locks',
    label: 'Clear stale document locks',
    description:
      'Removes abandoned editing locks older than 2 hours from payload_locked_documents so editors are never blocked.',
    prefersUnpooled: false,
    destructive: false,
  },
  {
    action: 'repair-order-ranks',
    label: 'Repair collection _order keys',
    description:
      'Backfills missing fractional _order ranks across orderable collections (Articles, Projects, Skills, Experiences, etc.).',
    prefersUnpooled: false,
    destructive: false,
  },
] as const

export type RepairOperationResult = {
  action: RepairActionKind
  ok: boolean
  usedUnpooledConnection: boolean
  durationMs: number
  summary: string
  details: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Tier 2: Pluggable Serverless Provider Adapter DTOs                          */
/* -------------------------------------------------------------------------- */

export type ProviderSlug = 'neon' | 'supabase' | 'prisma-postgres'

export type ProviderCapability =
  | 'snapshots'
  | 'branches'
  | 'pitr'
  | 'compute'
  | 'auto-safety-snapshot'

export type ProviderSnapshotItem = {
  id: string
  name: string
  sourceBranchId: string | null
  lsn: string | null
  timestamp: string | null
  createdAt: string
  expiresAt: string | null
  manual: boolean
}

export type ProviderBranchItem = {
  id: string
  name: string
  parentId: string | null
  isDefault: boolean
  isProtected: boolean
  currentState: string
  logicalSizeBytes: number | null
  createdAt: string
  expiresAt: string | null
}

export type ProviderComputeEndpointItem = {
  id: string
  host: string
  branchId: string
  type: string
  currentState: string
  minCu: number
  maxCu: number
  suspendTimeoutSeconds: number | null
  regionId: string
}

export type ProviderOverviewData = {
  provider: ProviderSlug
  providerName: string
  projectId: string
  projectName: string
  regionId: string
  pgVersion: string
  activeBranchId: string | null
  activeEndpointId: string | null
  autoDetectedProject: boolean
  capabilities: ProviderCapability[]
  snapshots: ProviderSnapshotItem[]
  branches: ProviderBranchItem[]
  endpoints: ProviderComputeEndpointItem[]
  notes?: string[]
}

export type ProviderStatusDescriptor = {
  slug: ProviderSlug
  name: string
  detectedFromHost: boolean
  requiredEnv: string[]
  optionalEnv: string[]
  docsUrl: string
  capabilities: ProviderCapability[]
  result: IntegrationResult<ProviderOverviewData>
}

export type DatabaseManagementSnapshot = {
  generatedAt: string
  connection: ConnectionDiagnostics
  vitals: DatabaseVitalStats
  tables: TableHealthRow[]
  sequences: SequenceHealthRow[]
  hygiene: PayloadHygieneReport
  vault: BackupVaultStatus
  activeProvider: ProviderSlug | null
  providers: ProviderStatusDescriptor[]
}

/* -------------------------------------------------------------------------- */
/* Pure Isomorphic Helpers                                                    */
/* -------------------------------------------------------------------------- */

/** Formats byte counts into compact human-readable units (B, KB, MB, GB, TB). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—'
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / 1024 ** exp
  return `${exp === 0 ? Math.round(val) : val.toFixed(val >= 100 ? 0 : 1)} ${units[exp]}`
}

/**
 * Extracts a Neon compute endpoint ID (`ep-...`) from a pooled or direct Neon hostname.
 * Example: `ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech` -> `ep-cool-morning-a2bc`
 */
export function extractNeonEndpointIdFromHost(host: string | null | undefined): string | null {
  if (!host) return null
  const firstLabel = host.trim().toLowerCase().split('.')[0] ?? ''
  if (!firstLabel.startsWith('ep-')) return null
  return firstLabel.endsWith('-pooler') ? firstLabel.slice(0, -'-pooler'.length) : firstLabel
}

/**
 * Extracts a Supabase project ref from direct (`db.<ref>.supabase.co`) or pooler usernames/hosts.
 */
export function extractSupabaseProjectRefFromHost(
  host: string | null | undefined,
  username?: string | null,
): string | null {
  if (host) {
    const lower = host.trim().toLowerCase()
    const directMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(lower)
    if (directMatch?.[1]) return directMatch[1]
  }
  if (username) {
    // Supavisor pooler format: `postgres.<project-ref>`
    const parts = username.trim().split('.')
    if (parts.length === 2 && parts[1]) return parts[1]
  }
  return null
}

/**
 * Parses Postgres connection strings without exposing usernames, passwords, or query tokens.
 */
export function parsePostgresDiagnostics(
  rawPooledUrl?: string,
  rawUnpooledUrl?: string,
): ConnectionDiagnostics {
  const trimmed = rawPooledUrl?.trim() ?? ''
  const unpooledTrimmed = rawUnpooledUrl?.trim() ?? ''
  const hasUnpooledUrl = Boolean(unpooledTrimmed)

  if (!trimmed) {
    return {
      configured: false,
      hostKind: 'unconfigured',
      providerLabel: 'Not configured',
      host: null,
      database: null,
      pooled: false,
      hasUnpooledUrl,
      sslMode: null,
      neonEndpointId: null,
      supabaseProjectRef: null,
      advisoryNote: 'Set POSTGRES_URL to enable PostgreSQL monitoring, backups, and maintenance.',
    }
  }

  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    const database = parsed.pathname.replace(/^\/+/, '') || null
    const sslMode = parsed.searchParams.get('sslmode')
    const pooled =
      host.includes('-pooler.') ||
      host.includes('.pooler.supabase.com') ||
      parsed.port === '6543' ||
      parsed.searchParams.get('pgbouncer') === 'true'

    let unpooledHost: string | null = null
    if (unpooledTrimmed) {
      try {
        unpooledHost = new URL(unpooledTrimmed).hostname.toLowerCase()
      } catch {
        unpooledHost = null
      }
    }

    const neonEndpointId =
      extractNeonEndpointIdFromHost(host) ?? extractNeonEndpointIdFromHost(unpooledHost)
    const supabaseProjectRef = extractSupabaseProjectRefFromHost(
      host,
      decodeURIComponent(parsed.username || ''),
    )

    let hostKind: DetectedDbHostKind = 'postgresql'
    let providerLabel = 'Standard PostgreSQL'
    if (host.includes('.neon.tech')) {
      hostKind = 'neon'
      providerLabel = 'Neon Serverless Postgres'
    } else if (host.includes('vercel-storage.com')) {
      hostKind = 'vercel-postgres'
      providerLabel = 'Vercel Postgres (Neon)'
    } else if (host.includes('.supabase.co') || host.includes('.pooler.supabase.com')) {
      hostKind = 'supabase'
      providerLabel = 'Supabase PostgreSQL'
    } else if (host.includes('.db.prisma.io') || host.includes('prisma-data.net')) {
      hostKind = 'prisma-postgres'
      providerLabel = 'Prisma Postgres'
    } else if (host === 'localhost' || host === '127.0.0.1' || host === 'postgres') {
      hostKind = 'local'
      providerLabel = 'Local PostgreSQL'
    }

    const advisoryNote =
      pooled && !hasUnpooledUrl
        ? 'Connected via PgBouncer transaction pooler (-pooler) without POSTGRES_URL_NON_POOLING. Add POSTGRES_URL_NON_POOLING in Vercel for optimal VACUUM, REINDEX, and bulk transactional restores.'
        : null

    return {
      configured: true,
      hostKind,
      providerLabel,
      host,
      database,
      pooled,
      hasUnpooledUrl,
      sslMode,
      neonEndpointId,
      supabaseProjectRef,
      advisoryNote,
    }
  } catch {
    return {
      configured: true,
      hostKind: 'postgresql',
      providerLabel: 'PostgreSQL',
      host: null,
      database: null,
      pooled: false,
      hasUnpooledUrl,
      sslMode: null,
      neonEndpointId: null,
      supabaseProjectRef: null,
      advisoryNote: null,
    }
  }
}

/**
 * Topologically orders tables from referenced parents -> referencing children so relational
 * restores satisfy foreign-key constraints without requiring PostgreSQL SUPERUSER privileges
 * (`session_replication_role = replica` is forbidden on Neon `neondb_owner` and managed cloud roles).
 */
export function topologicalSortTables(
  tables: readonly {
    name: string
    foreignKeys: readonly { refTable: string }[]
  }[],
): { ordered: string[]; cyclicTables: string[] } {
  const known = new Set(tables.map((t) => t.name))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, Set<string>>()

  for (const table of tables) {
    inDegree.set(table.name, 0)
    dependents.set(table.name, new Set())
  }

  for (const table of tables) {
    const parentSet = new Set<string>()
    for (const fk of table.foreignKeys) {
      // Ignore self-references and external tables outside the dump set.
      if (fk.refTable === table.name || !known.has(fk.refTable)) continue
      parentSet.add(fk.refTable)
    }
    inDegree.set(table.name, parentSet.size)
    for (const parent of parentSet) {
      dependents.get(parent)?.add(table.name)
    }
  }

  const queue: string[] = []
  for (const [name, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(name)
  }
  queue.sort()

  const ordered: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    ordered.push(current)
    const children = [...(dependents.get(current) ?? [])].sort()
    for (const child of children) {
      const nextDeg = (inDegree.get(child) ?? 0) - 1
      inDegree.set(child, nextDeg)
      if (nextDeg === 0) {
        queue.push(child)
        queue.sort()
      }
    }
  }

  const orderedSet = new Set(ordered)
  const cyclicTables = tables
    .map((t) => t.name)
    .filter((name) => !orderedSet.has(name))
    .sort()

  return {
    ordered: [...ordered, ...cyclicTables],
    cyclicTables,
  }
}

/**
 * Summarizes overall database health into a status tone + actionable warnings for widgets and headers.
 */
export function classifyDatabaseHealth(
  vitals: DatabaseVitalStats,
  hygiene: PayloadHygieneReport,
): { tone: RunTone; label: string; issues: string[] } {
  if (vitals.status === 'not-configured') {
    return { tone: 'muted', label: 'Not configured', issues: [] }
  }
  if (vitals.status === 'unreachable') {
    return {
      tone: 'poor',
      label: 'Unreachable',
      issues: [vitals.errorMessage ?? 'Database connection failed'],
    }
  }

  const issues: string[] = []
  if (hygiene.outOfSyncSequencesCount > 0) {
    issues.push(
      `${hygiene.outOfSyncSequencesCount} primary-key sequence(s) out of sync`,
    )
  }
  if (hygiene.bloatedTablesCount > 0) {
    issues.push(`${hygiene.bloatedTablesCount} table(s) have high dead-tuple bloat`)
  }
  if (hygiene.staleLocksCount > 0) {
    issues.push(`${hygiene.staleLocksCount} stale document lock(s)`)
  }
  const missingOrders = hygiene.missingOrderRanks.reduce((sum, item) => sum + item.missingCount, 0)
  if (missingOrders > 0) {
    issues.push(`${missingOrders} document(s) missing _order rank`)
  }
  if (vitals.cacheHitRatio !== null && vitals.cacheHitRatio < 90) {
    issues.push(`Low buffer cache hit ratio (${vitals.cacheHitRatio}%)`)
  }

  if (hygiene.outOfSyncSequencesCount > 0) {
    return { tone: 'poor', label: 'Sequence drift', issues }
  }
  if (issues.length > 0) {
    return { tone: 'running', label: 'Needs maintenance', issues }
  }
  return { tone: 'good', label: 'Healthy', issues: [] }
}
