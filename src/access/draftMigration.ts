import type { Payload } from 'payload'

import { CACHE_TAGS, revalidateTags } from '@/app/(frontend)/lib/revalidate'

export const DRAFT_ENABLED_COLLECTIONS = ['articles', 'projects'] as const
export type DraftEnabledCollectionSlug = (typeof DRAFT_ENABLED_COLLECTIONS)[number]

/**
 * Auto-migrates pre-existing `Articles` and `Projects` documents on startup after enabling
 * `versions.drafts`.
 *
 * Why this is needed:
 * 1. When Drizzle adds `_status` (`DEFAULT 'draft'`) to an existing PostgreSQL table, every
 *    pre-existing row receives `_status = 'draft'` instead of `'published'`, hiding it from
 *    public frontend queries.
 * 2. Payload's Admin list & document views query `_articles_v` / `_projects_v` (`WHERE latest = true`)
 *    whenever `versions.drafts` is enabled. Pre-existing rows have `0` version rows until saved once,
 *    making Admin list views appear empty even though `payload.count()` still counts the main table.
 *
 * Any document in the main table that has `0` rows in its `_v` versions table is deterministically
 * a pre-draft legacy row (every document created or edited after `versions.drafts` was enabled has
 * at least 1 version row). Backfilling those rows with `_status: 'published'` via `payload.update`
 * sets `_status = 'published'` on the main row AND writes the initial `latest = true` snapshot row.
 */
export async function ensureDraftVersions(payload: Payload): Promise<number> {
  let totalBackfilled = 0

  for (const collection of DRAFT_ENABLED_COLLECTIONS) {
    try {
      const mainRes = await payload.find({
        collection,
        draft: false,
        pagination: false,
        depth: 0,
        sort: 'id',
        select: { title: true },
        overrideAccess: true,
      })

      if (mainRes.docs.length === 0) continue

      const versionsRes = await payload.findVersions({
        collection,
        pagination: false,
        depth: 0,
        select: { parent: true } as never,
        overrideAccess: true,
      })

      const versionedParentIds = new Set<string>()
      for (const v of versionsRes.docs as Array<{ parent?: number | string | { id?: number | string } | null }>) {
        const rawParent = v.parent
        const parentId =
          typeof rawParent === 'number' || typeof rawParent === 'string'
            ? String(rawParent)
            : rawParent && typeof rawParent === 'object' && 'id' in rawParent && rawParent.id !== undefined
              ? String(rawParent.id)
              : null
        if (parentId) versionedParentIds.add(parentId)
      }

      const unversionedIds = mainRes.docs
        .map((doc) => doc.id)
        .filter((id) => !versionedParentIds.has(String(id)))

      if (unversionedIds.length === 0) continue

      let migratedForCollection = 0
      for (const id of unversionedIds) {
        await payload.update({
          collection,
          id,
          data: { _status: 'published' },
          draft: false,
          depth: 0,
          overrideAccess: true,
          context: { skipRevalidate: true, skipAuditLog: true },
        })
        migratedForCollection += 1
      }

      totalBackfilled += migratedForCollection
      payload.logger.info(
        `[drafts] Backfilled published version snapshots for ${migratedForCollection} pre-existing ${collection} document(s).`,
      )
    } catch (error) {
      payload.logger.error(
        `[drafts] Could not verify version snapshots on ${collection}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (totalBackfilled > 0) {
    revalidateTags(Object.values(CACHE_TAGS))
  }

  return totalBackfilled
}
