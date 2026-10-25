import type { Payload } from 'payload'
import { generateNKeysBetween } from 'payload/shared'

export const ORDERABLE_COLLECTIONS = [
  'projects',
  'services',
  'skills',
  'experiences',
  'educations',
] as const

export type OrderableCollectionSlug = (typeof ORDERABLE_COLLECTIONS)[number]

/**
 * Ensures every document in an `orderable: true` collection has a valid fractional `_order` key.
 *
 * New documents get `_order` automatically from Payload's built-in `beforeChange` hook, while
 * documents created before `orderable: true` was enabled start with `_order = null`. Backfilling
 * missing keys once on startup guarantees deterministic ordering on the public site before an
 * editor drags any rows.
 */
export async function ensureOrderable(payload: Payload): Promise<void> {
  for (const collection of ORDERABLE_COLLECTIONS) {
    try {
      const { totalDocs: missingCount } = await payload.count({
        collection,
        where: { or: [{ _order: { exists: false } }, { _order: { equals: null } }] },
        overrideAccess: true,
      })
      if (missingCount === 0) continue

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
