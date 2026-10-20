import type { CollectionSlug, PayloadRequest } from 'payload'

/** The admin URL of a collection list or document. */
export function adminURL(req: PayloadRequest, slug: CollectionSlug, id?: number | string): string {
  const base = `${req.payload.config.routes.admin}/collections/${slug}`
  return id === undefined ? base : `${base}/${id}`
}

/** The plural label of a collection, as configured (falls back to the slug). */
export function collectionLabel(req: PayloadRequest, slug: CollectionSlug): string {
  const plural = req.payload.collections[slug]?.config.labels?.plural
  if (typeof plural === 'string') return plural
  if (plural && typeof plural === 'object') {
    const record = plural as Record<string, string>
    return record[req.i18n.language] ?? record.en ?? slug
  }
  return slug
}
