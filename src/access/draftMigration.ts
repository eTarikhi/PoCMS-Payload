import type { Payload } from 'payload'

import { CACHE_TAGS, revalidateTags } from '@/app/(frontend)/lib/revalidate'
import { executePayloadSql, qualifiedPayloadTable } from '@/lib/payloadSql'

export const DRAFT_ENABLED_COLLECTIONS = ['articles', 'projects'] as const
export type DraftEnabledCollectionSlug = (typeof DRAFT_ENABLED_COLLECTIONS)[number]

/**
 * Finds pre-draft legacy rows (rows in the main table with 0 rows in `_<collection>_v`) via a
 * single indexed SQL `NOT EXISTS` anti-join instead of pulling all historical `_v` rows into Node
 * memory (`pagination: false`). Returns `null` when no SQL client is attached (unit-test mocks).
 */
async function findUnversionedIdsViaSql(
  payload: Payload,
): Promise<Map<DraftEnabledCollectionSlug, Array<number | string>> | null> {
  const articlesTable = qualifiedPayloadTable(payload, 'articles')
  const articlesVersionsTable = qualifiedPayloadTable(payload, '_articles_v')
  const projectsTable = qualifiedPayloadTable(payload, 'projects')
  const projectsVersionsTable = qualifiedPayloadTable(payload, '_projects_v')

  try {
    const sqlRes = await executePayloadSql<{
      collection: DraftEnabledCollectionSlug
      id: number | string
    }>(
      payload,
      `
        SELECT 'articles' AS collection, a.id
        FROM ${articlesTable} a
        WHERE NOT EXISTS (
          SELECT 1 FROM ${articlesVersionsTable} v WHERE v.parent_id = a.id
        )
        UNION ALL
        SELECT 'projects' AS collection, p.id
        FROM ${projectsTable} p
        WHERE NOT EXISTS (
          SELECT 1 FROM ${projectsVersionsTable} v WHERE v.parent_id = p.id
        )
        ORDER BY 1 ASC, 2 ASC
      `,
    )
    if (!sqlRes) return null

    const byCollection = new Map<DraftEnabledCollectionSlug, Array<number | string>>([
      ['articles', []],
      ['projects', []],
    ])
    for (const row of sqlRes.rows) {
      if (row.collection === 'articles' || row.collection === 'projects') {
        byCollection.get(row.collection)?.push(row.id)
      }
    }
    return byCollection
  } catch {
    return null
  }
}

/**
 * Auto-migrates pre-existing `Articles` and `Projects` documents on startup after enabling
 * `versions.drafts`.
 *
 * Uses a single indexed `NOT EXISTS` anti-join in PostgreSQL so cold starts transfer 0 historical
 * `_articles_v` / `_projects_v` rows and preserve Neon's Local File Cache (LFC), falling back to
 * the Payload Local API when running against in-memory test harnesses.
 */
export async function ensureDraftVersions(payload: Payload): Promise<number> {
  let totalBackfilled = 0
  const sqlUnversioned = await findUnversionedIdsViaSql(payload)

  for (const collection of DRAFT_ENABLED_COLLECTIONS) {
    try {
      let unversionedIds: Array<number | string>

      if (sqlUnversioned) {
        unversionedIds = sqlUnversioned.get(collection) ?? []
      } else {
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
        for (const v of versionsRes.docs as Array<{
          parent?: number | string | { id?: number | string } | null
        }>) {
          const rawParent = v.parent
          const parentId =
            typeof rawParent === 'number' || typeof rawParent === 'string'
              ? String(rawParent)
              : rawParent &&
                  typeof rawParent === 'object' &&
                  'id' in rawParent &&
                  rawParent.id !== undefined
                ? String(rawParent.id)
                : null
          if (parentId) versionedParentIds.add(parentId)
        }

        unversionedIds = mainRes.docs
          .map((doc) => doc.id)
          .filter((id) => !versionedParentIds.has(String(id)))
      }

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
