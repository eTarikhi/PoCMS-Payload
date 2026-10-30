/**
 * Isomorphic types, constants, and deterministic retention planner for Content Version Pruning.
 *
 * IMPORTANT: Keep this module free of `payload` runtime, `next/cache`, and `node:*` imports
 * so Client Components (`DocumentVersionRetention`, `DatabaseClient`) can safely import from it.
 */

export const VERSIONED_CONTENT_COLLECTIONS = ['articles', 'projects'] as const
export type VersionedContentCollection = (typeof VERSIONED_CONTENT_COLLECTIONS)[number]

/** Default automatic `versions.maxPerDoc` cap on `Articles` and `Projects`. */
export const DEFAULT_MAX_VERSIONS_PER_DOC = 10

/** Default manual/scheduled retention window per document when pruning historical versions. */
export const DEFAULT_RETENTION_KEEP_PER_DOC = 5

export const VERSIONED_COLLECTION_LABELS: Record<VersionedContentCollection, string> = {
  articles: 'Articles',
  projects: 'Projects',
}

export type VersionRetentionPolicy = {
  /** Number of recent non-obsolete versions to retain per document (minimum 1, maximum 100). */
  keepLatestPerDoc?: number
  /** Optional age cutoff in days; non-protected versions older than this are pruned. */
  maxAgeDays?: number | null
  /** Prune stale `autosave: true` rows that are no longer `latest: true`. Defaults to `true`. */
  pruneAutosaveSnapshots?: boolean
}

export type NormalizedVersionRetentionPolicy = {
  keepLatestPerDoc: number
  maxAgeDays: number | null
  pruneAutosaveSnapshots: boolean
}

export type VersionRowSnapshot = {
  id: number | string
  parentId: string
  latest: boolean
  autosave: boolean
  status: 'draft' | 'published' | null
  updatedAt: string
  createdAt: string
}

export type CollectionVersionStats = {
  collection: VersionedContentCollection
  label: string
  maxPerDocCap: number
  totalVersions: number
  distinctParents: number
  protectedVersions: number
  prunableVersions: number
  autosaveVersions: number
  oldestVersionAt: string | null
  newestVersionAt: string | null
}

export type DocumentVersionStats = {
  collection: VersionedContentCollection
  parentId: string
  totalVersions: number
  protectedVersions: number
  prunableVersions: number
  autosaveVersions: number
  latestPublishedAt: string | null
  oldestVersionAt: string | null
  newestVersionAt: string | null
}

export type CollectionVersionPruneSummary = {
  collection: VersionedContentCollection
  label: string
  scannedVersions: number
  protectedVersions: number
  deletedVersions: number
  affectedParents: number
  deletedVersionIds: Array<number | string>
}

export type VersionRetentionOverview = {
  inspectedAt: string
  policy: NormalizedVersionRetentionPolicy
  collections: CollectionVersionStats[]
  totals: {
    totalVersions: number
    distinctParents: number
    protectedVersions: number
    prunableVersions: number
    autosaveVersions: number
  }
}

export type VersionPruneReport = {
  executedAt: string
  dryRun: boolean
  policy: NormalizedVersionRetentionPolicy
  collections: CollectionVersionPruneSummary[]
  totalScanned: number
  totalProtected: number
  totalDeleted: number
}

export function isVersionedContentCollection(val: unknown): val is VersionedContentCollection {
  return (
    typeof val === 'string' &&
    (VERSIONED_CONTENT_COLLECTIONS as readonly string[]).includes(val)
  )
}

export function normalizeVersionRetentionPolicy(
  input?: VersionRetentionPolicy | null,
): NormalizedVersionRetentionPolicy {
  const rawKeep = input?.keepLatestPerDoc
  const keepLatestPerDoc =
    typeof rawKeep === 'number' && Number.isFinite(rawKeep)
      ? Math.min(100, Math.max(1, Math.floor(rawKeep)))
      : DEFAULT_RETENTION_KEEP_PER_DOC

  const rawAge = input?.maxAgeDays
  const maxAgeDays =
    typeof rawAge === 'number' && Number.isFinite(rawAge) && rawAge > 0
      ? Math.min(3650, Math.floor(rawAge))
      : null

  const pruneAutosaveSnapshots = input?.pruneAutosaveSnapshots !== false

  return {
    keepLatestPerDoc,
    maxAgeDays,
    pruneAutosaveSnapshots,
  }
}

const parseIsoMs = (iso: string | null | undefined): number => {
  if (!iso) return 0
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? 0 : parsed
}

export type PlannedVersionRetention = {
  policy: NormalizedVersionRetentionPolicy
  protectedIds: Array<number | string>
  prunableIds: Array<number | string>
  distinctParents: number
  affectedParents: number
  autosaveCount: number
  latestPublishedAt: string | null
  oldestVersionAt: string | null
  newestVersionAt: string | null
}

/**
 * Pure retention planner:
 * Guarantees that EVERY parent document keeps:
 *   1. Any version marked `latest === true` (active working draft/published head)
 *   2. Its newest `status === 'published'` version snapshot (live published fallback)
 *   3. At least 1 newest version if neither flag was present on legacy rows
 * Then applies `keepLatestPerDoc`, optional `maxAgeDays`, and `pruneAutosaveSnapshots`.
 */
export function planVersionRetention(
  rows: readonly VersionRowSnapshot[],
  rawPolicy?: VersionRetentionPolicy | null,
  nowMs: number = Date.now(),
): PlannedVersionRetention {
  const policy = normalizeVersionRetentionPolicy(rawPolicy)
  const cutoffMs =
    policy.maxAgeDays !== null ? nowMs - policy.maxAgeDays * 86_400_000 : null

  const byParent = new Map<string, VersionRowSnapshot[]>()
  let autosaveCount = 0
  let oldestMs = Number.POSITIVE_INFINITY
  let newestMs = Number.NEGATIVE_INFINITY
  let oldestVersionAt: string | null = null
  let newestVersionAt: string | null = null
  let latestPublishedMs = Number.NEGATIVE_INFINITY
  let latestPublishedAt: string | null = null

  for (const row of rows) {
    if (!row.parentId) continue
    if (row.autosave) autosaveCount += 1

    const ts = parseIsoMs(row.updatedAt) || parseIsoMs(row.createdAt)
    if (ts > 0 && ts < oldestMs) {
      oldestMs = ts
      oldestVersionAt = row.updatedAt || row.createdAt
    }
    if (ts > newestMs) {
      newestMs = ts
      newestVersionAt = row.updatedAt || row.createdAt
    }
    if (row.status === 'published' && ts > latestPublishedMs) {
      latestPublishedMs = ts
      latestPublishedAt = row.updatedAt || row.createdAt
    }

    const bucket = byParent.get(row.parentId)
    if (bucket) {
      bucket.push(row)
    } else {
      byParent.set(row.parentId, [row])
    }
  }

  const protectedIds: Array<number | string> = []
  const prunableIds: Array<number | string> = []
  let affectedParents = 0

  for (const parentRows of byParent.values()) {
    const sorted = [...parentRows].sort((a, b) => {
      const diffUpdated = parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt)
      if (diffUpdated !== 0) return diffUpdated
      const diffCreated = parseIsoMs(b.createdAt) - parseIsoMs(a.createdAt)
      if (diffCreated !== 0) return diffCreated
      return String(b.id).localeCompare(String(a.id), undefined, { numeric: true })
    })

    const hardProtected = new Set<number | string>()
    let foundLatestPublished = false

    for (const item of sorted) {
      if (item.latest) {
        hardProtected.add(item.id)
      }
      if (!foundLatestPublished && item.status === 'published') {
        hardProtected.add(item.id)
        foundLatestPublished = true
      }
    }

    if (hardProtected.size === 0 && sorted[0]) {
      hardProtected.add(sorted[0].id)
    }

    let keptWindowCount = 0
    let parentPruned = 0

    for (const item of sorted) {
      if (hardProtected.has(item.id)) {
        protectedIds.push(item.id)
        keptWindowCount += 1
        continue
      }

      if (policy.pruneAutosaveSnapshots && item.autosave) {
        prunableIds.push(item.id)
        parentPruned += 1
        continue
      }

      if (keptWindowCount >= policy.keepLatestPerDoc) {
        prunableIds.push(item.id)
        parentPruned += 1
        continue
      }

      const itemTs = parseIsoMs(item.updatedAt) || parseIsoMs(item.createdAt)
      if (cutoffMs !== null && itemTs > 0 && itemTs < cutoffMs) {
        prunableIds.push(item.id)
        parentPruned += 1
        continue
      }

      protectedIds.push(item.id)
      keptWindowCount += 1
    }

    if (parentPruned > 0) {
      affectedParents += 1
    }
  }

  return {
    policy,
    protectedIds,
    prunableIds,
    distinctParents: byParent.size,
    affectedParents,
    autosaveCount,
    latestPublishedAt,
    oldestVersionAt,
    newestVersionAt,
  }
}
