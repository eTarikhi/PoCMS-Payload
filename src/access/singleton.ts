import type { Access, CollectionSlug } from 'payload'

import { can } from './permissions'

/**
 * Create access for one-document collections: users whose role may create in the collection
 * ("edit" or "full", ADR 0011) may create the document only while none exists. The frontend reads
 * the first document, so a second one would silently never show. The count bypasses access control
 * on purpose (it must see every document).
 */
export const createWhileEmpty =
  (slug: CollectionSlug): Access =>
  async ({ req }) => {
    if (!can(req.user, slug, 'create')) return false
    const { totalDocs } = await req.payload.count({ collection: slug, req, overrideAccess: true })
    return totalDocs === 0
  }
