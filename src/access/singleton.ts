import type { Access, CollectionSlug } from 'payload'

/**
 * Create access for one-document collections: signed-in users may create the document only while
 * none exists. The frontend reads the first document, so a second one would silently never show.
 * The count bypasses access control on purpose (it must see every document).
 */
export const createWhileEmpty =
  (slug: CollectionSlug): Access =>
  async ({ req }) => {
    if (!req.user) return false
    const { totalDocs } = await req.payload.count({ collection: slug, req, overrideAccess: true })
    return totalDocs === 0
  }
