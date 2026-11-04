import type { Payload } from 'payload'
import { generateNKeysBetween } from 'payload/shared'

import { executePayloadSql, qualifiedPayloadTable, quoteSqlIdent } from '@/lib/payloadSql'

export const ORDERABLE_COLLECTIONS = [
  'projects',
  'services',
  'skills',
  'experiences',
  'educations',
] as const

export type OrderableCollectionSlug = (typeof ORDERABLE_COLLECTIONS)[number]

/**
 * Short-circuits all 5 orderable collections in a single SQL `SELECT EXISTS (...)` round-trip
 * rather than 5 sequential `COUNT(*)` table scans on every cold start.
 * Returns `null` when no live SQL client is attached (e.g. unit-test mocks).
 */
async function probeCollectionsMissingOrderViaSql(
  payload: Payload,
): Promise<Set<OrderableCollectionSlug> | null> {
  try {
    const projections = ORDERABLE_COLLECTIONS.map((slug) => {
      const table = qualifiedPayloadTable(payload, slug)
      return `EXISTS (SELECT 1 FROM ${table} WHERE "_order" IS NULL OR "_order" = '') AS ${quoteSqlIdent(slug)}`
    })
    const res = await executePayloadSql<Record<string, boolean>>(
      payload,
      `SELECT ${projections.join(', ')}`,
    )
    if (!res || !res.rows[0]) return null

    const row = res.rows[0]
    const missing = new Set<OrderableCollectionSlug>()
    for (const slug of ORDERABLE_COLLECTIONS) {
      if (Boolean(row[slug])) {
        missing.add(slug)
      }
    }
    return missing
  } catch {
    return null
  }
}

/**
 * Ensures every document in an `orderable: true` collection has a valid fractional `_order` key.
 *
 * New documents get `_order` automatically from Payload's built-in `beforeChange` hook, while
 * documents created before `orderable: true` was enabled start with `_order = null`. Backfilling
 * missing keys once on startup guarantees deterministic ordering on the public site before an
 * editor drags any rows.
 */
export async function ensureOrderable(payload: Payload): Promise<void> {
  const sqlMissingSet = await probeCollectionsMissingOrderViaSql(payload)

  let collectionsToBackfill: OrderableCollectionSlug[]
  if (sqlMissingSet) {
    collectionsToBackfill = ORDERABLE_COLLECTIONS.filter((slug) => sqlMissingSet.has(slug))
  } else {
    const counts = await Promise.all(
      ORDERABLE_COLLECTIONS.map(async (collection) => {
        try {
          const { totalDocs } = await payload.count({
            collection,
            where: { or: [{ _order: { exists: false } }, { _order: { equals: null } }] },
            overrideAccess: true,
          })
          return { collection, totalDocs }
        } catch (error) {
          payload.logger.error(
            `[orderable] Could not verify _order keys on ${collection}: ${error instanceof Error ? error.message : String(error)}`,
          )
          return { collection, totalDocs: 0 }
        }
      }),
    )
    collectionsToBackfill = counts
      .filter((entry) => entry.totalDocs > 0)
      .map((entry) => entry.collection)
  }

  for (const collection of collectionsToBackfill) {
    try {
      const { docs } = await payload.find({
        collection,
        depth: 0,
        pagination: false,
        sort: 'id',
        select: { _order: true },
        overrideAccess: true,
      })

      let lastKey: string | null = null
      const missingIds: (number | string)[] = []

      for (const doc of docs as { id: number | string; _order?: string | null }[]) {
        if (typeof doc._order === 'string' && doc._order.length > 0) {
          if (lastKey === null || doc._order > lastKey) {
            lastKey = doc._order
          }
        } else {
          missingIds.push(doc.id)
        }
      }

      if (missingIds.length === 0) continue

      const keys = generateNKeysBetween(lastKey, null, missingIds.length)
      for (let index = 0; index < missingIds.length; index++) {
        await payload.update({
          collection,
          id: missingIds[index],
          data: { _order: keys[index] },
          depth: 0,
          overrideAccess: true,
          context: { skipRevalidate: true, skipAuditLog: true },
        })
      }

      payload.logger.info(
        `[orderable] Initialized _order keys for ${missingIds.length} ${collection} document(s).`,
      )
    } catch (error) {
      payload.logger.error(
        `[orderable] Could not verify _order keys on ${collection}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
