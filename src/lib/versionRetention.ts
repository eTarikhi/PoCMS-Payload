import type { Payload, PayloadRequest, Where } from 'payload'

import { recordDatabaseAuditLog } from '@/plugins/auditLog'

import {
  DEFAULT_MAX_VERSIONS_PER_DOC,
  normalizeVersionRetentionPolicy,
  planVersionRetention,
  VERSIONED_COLLECTION_LABELS,
  VERSIONED_CONTENT_COLLECTIONS,
  type CollectionVersionPruneSummary,
  type CollectionVersionStats,
  type DocumentVersionStats,
  type VersionedContentCollection,
  type VersionPruneReport,
  type VersionRetentionOverview,
  type VersionRetentionPolicy,
  type VersionRowSnapshot,
} from './versionRetentionShared'

const DELETE_BATCH_SIZE = 200

function extractParentId(rawParent: unknown): string {
  if (typeof rawParent === 'number' && Number.isFinite(rawParent)) return String(rawParent)
  if (typeof rawParent === 'string' && rawParent.trim()) return rawParent.trim()
  if (rawParent && typeof rawParent === 'object' && 'id' in rawParent) {
    const id = (rawParent as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return String(id)
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return ''
}

function getConfiguredMaxPerDoc(
  payload: Payload,
  collection: VersionedContentCollection,
): number {
  const col = payload.collections?.[collection]?.config
  const versions = col?.versions
  if (versions && typeof versions === 'object' && typeof versions.maxPerDoc === 'number') {
    return versions.maxPerDoc
  }
  return DEFAULT_MAX_VERSIONS_PER_DOC
}

async function fetchLightweightVersionRows(args: {
  payload: Payload
  collection: VersionedContentCollection
  parentId?: number | string | null
  req?: PayloadRequest
}): Promise<VersionRowSnapshot[]> {
  const { payload, collection, parentId, req } = args
  const where: Where | undefined =
    parentId !== undefined && parentId !== null && String(parentId).trim() !== ''
      ? {
          parent: {
            equals:
              typeof parentId === 'string' && /^\d+$/.test(parentId.trim())
                ? Number(parentId.trim())
                : parentId,
          },
        }
      : undefined

  const res = await payload.findVersions({
    collection,
    where,
    sort: '-updatedAt',
    pagination: false,
    depth: 0,
    trash: true,
    overrideAccess: true,
    req,
    select: {
      parent: true,
      latest: true,
      autosave: true,
      createdAt: true,
      updatedAt: true,
      version: {
        _status: true,
      },
    } as never,
  })

  return (res.docs as unknown as Array<Record<string, unknown>>)
    .map((doc): VersionRowSnapshot | null => {
      const id = doc.id as number | string | undefined
      const resolvedParent = extractParentId(doc.parent)
      if (id === undefined || !resolvedParent) return null

      const versionObj =
        doc.version && typeof doc.version === 'object'
          ? (doc.version as Record<string, unknown>)
          : null
      const rawStatus = versionObj?._status
      const status =
        rawStatus === 'published' || rawStatus === 'draft' ? rawStatus : null

      return {
        id,
        parentId: resolvedParent,
        latest: Boolean(doc.latest),
        autosave: Boolean(doc.autosave),
        status,
        updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : '',
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : '',
      }
    })
    .filter((item): item is VersionRowSnapshot => item !== null)
}

/**
 * Inspects version footprint and prunable snapshot counts across `articles` and/or `projects`.
 */
export async function inspectVersionRetention(args: {
  payload: Payload
  collections?: readonly VersionedContentCollection[]
  policy?: VersionRetentionPolicy | null
  req?: PayloadRequest
}): Promise<VersionRetentionOverview> {
  const { payload, req } = args
  const targetCollections = args.collections?.length
    ? args.collections
    : VERSIONED_CONTENT_COLLECTIONS
  const policy = normalizeVersionRetentionPolicy(args.policy)

  const collectionStats: CollectionVersionStats[] = []

  for (const slug of targetCollections) {
    try {
      const rows = await fetchLightweightVersionRows({ payload, collection: slug, req })
      const planned = planVersionRetention(rows, policy)
      collectionStats.push({
        collection: slug,
        label: VERSIONED_COLLECTION_LABELS[slug],
        maxPerDocCap: getConfiguredMaxPerDoc(payload, slug),
        totalVersions: rows.length,
        distinctParents: planned.distinctParents,
        protectedVersions: planned.protectedIds.length,
        prunableVersions: planned.prunableIds.length,
        autosaveVersions: planned.autosaveCount,
        oldestVersionAt: planned.oldestVersionAt,
        newestVersionAt: planned.newestVersionAt,
      })
    } catch {
      collectionStats.push({
        collection: slug,
        label: VERSIONED_COLLECTION_LABELS[slug],
        maxPerDocCap: getConfiguredMaxPerDoc(payload, slug),
        totalVersions: 0,
        distinctParents: 0,
        protectedVersions: 0,
        prunableVersions: 0,
        autosaveVersions: 0,
        oldestVersionAt: null,
        newestVersionAt: null,
      })
    }
  }

  const totals = collectionStats.reduce(
    (acc, item) => ({
      totalVersions: acc.totalVersions + item.totalVersions,
      distinctParents: acc.distinctParents + item.distinctParents,
      protectedVersions: acc.protectedVersions + item.protectedVersions,
      prunableVersions: acc.prunableVersions + item.prunableVersions,
      autosaveVersions: acc.autosaveVersions + item.autosaveVersions,
    }),
    {
      totalVersions: 0,
      distinctParents: 0,
      protectedVersions: 0,
      prunableVersions: 0,
      autosaveVersions: 0,
    },
  )

  return {
    inspectedAt: new Date().toISOString(),
    policy,
    collections: collectionStats,
    totals,
  }
}

/**
 * Inspects version counts for a single `Article` or `Project` document.
 */
export async function inspectDocumentVersionRetention(args: {
  payload: Payload
  collection: VersionedContentCollection
  parentId: number | string
  policy?: VersionRetentionPolicy | null
  req?: PayloadRequest
}): Promise<DocumentVersionStats> {
  const { payload, collection, parentId, policy, req } = args
  try {
    const rows = await fetchLightweightVersionRows({
      payload,
      collection,
      parentId,
      req,
    })
    const planned = planVersionRetention(rows, policy)
    return {
      collection,
      parentId: String(parentId),
      totalVersions: rows.length,
      protectedVersions: planned.protectedIds.length,
      prunableVersions: planned.prunableIds.length,
      autosaveVersions: planned.autosaveCount,
      latestPublishedAt: planned.latestPublishedAt,
      oldestVersionAt: planned.oldestVersionAt,
      newestVersionAt: planned.newestVersionAt,
    }
  } catch {
    return {
      collection,
      parentId: String(parentId),
      totalVersions: 0,
      protectedVersions: 0,
      prunableVersions: 0,
      autosaveVersions: 0,
      latestPublishedAt: null,
      oldestVersionAt: null,
      newestVersionAt: null,
    }
  }
}

/**
 * Executes (or dry-runs) safe version pruning for one document or across `articles` & `projects`.
 * Uses `payload.db.deleteVersions` in bounded batches so child `_v_version_*` tables cascade cleanly,
 * while strictly protecting `latest: true` and the newest `published` snapshot per document.
 */
export async function pruneContentVersions(args: {
  payload: Payload
  collections?: readonly VersionedContentCollection[]
  parentId?: number | string | null
  policy?: VersionRetentionPolicy | null
  dryRun?: boolean
  req?: PayloadRequest
}): Promise<VersionPruneReport> {
  const { payload, parentId, req } = args
  const dryRun = Boolean(args.dryRun)
  const policy = normalizeVersionRetentionPolicy(args.policy)
  const targetCollections = args.collections?.length
    ? args.collections
    : VERSIONED_CONTENT_COLLECTIONS

  const summaries: CollectionVersionPruneSummary[] = []

  for (const slug of targetCollections) {
    const rows = await fetchLightweightVersionRows({
      payload,
      collection: slug,
      parentId,
      req,
    })
    const planned = planVersionRetention(rows, policy)

    if (!dryRun && planned.prunableIds.length > 0) {
      for (let i = 0; i < planned.prunableIds.length; i += DELETE_BATCH_SIZE) {
        const chunk = planned.prunableIds.slice(i, i + DELETE_BATCH_SIZE)
        await payload.db.deleteVersions({
          collection: slug,
          req,
          where: {
            id: { in: chunk },
          },
        })
      }
    }

    summaries.push({
      collection: slug,
      label: VERSIONED_COLLECTION_LABELS[slug],
      scannedVersions: rows.length,
      protectedVersions: planned.protectedIds.length,
      deletedVersions: planned.prunableIds.length,
      affectedParents: planned.affectedParents,
      deletedVersionIds: planned.prunableIds,
    })
  }

  const totalScanned = summaries.reduce((sum, s) => sum + s.scannedVersions, 0)
  const totalProtected = summaries.reduce((sum, s) => sum + s.protectedVersions, 0)
  const totalDeleted = summaries.reduce((sum, s) => sum + s.deletedVersions, 0)

  if (!dryRun && totalDeleted > 0 && req) {
    const targetDesc =
      parentId !== undefined && parentId !== null && targetCollections.length === 1
        ? `${targetCollections[0]} #${String(parentId)}`
        : targetCollections.join(' & ')

    await recordDatabaseAuditLog(req, {
      action: 'maintenance',
      entityType:
        parentId !== undefined && parentId !== null && targetCollections.length === 1
          ? targetCollections[0]!
          : 'version-retention',
      documentId: parentId !== undefined && parentId !== null ? String(parentId) : null,
      summary: `Pruned ${totalDeleted} historical version snapshot(s) from ${targetDesc} (kept ${totalProtected} protected)`,
      meta: {
        policy,
        parentId: parentId ?? null,
        collections: summaries.map((s) => ({
          collection: s.collection,
          scanned: s.scannedVersions,
          protected: s.protectedVersions,
          deleted: s.deletedVersions,
        })),
      },
    })
  }

  return {
    executedAt: new Date().toISOString(),
    dryRun,
    policy,
    collections: summaries,
    totalScanned,
    totalProtected,
    totalDeleted,
  }
}
