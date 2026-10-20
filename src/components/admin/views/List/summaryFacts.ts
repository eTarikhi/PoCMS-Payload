import type { BasePayload, CollectionSlug, TypedUser, Where } from 'payload'

/** A collection-specific line in the list summary: a count of documents matching `where`. */
export type SummaryFact = {
  label: string
  where: Where
  /** Shown as a warning (amber) when the count is above zero. */
  attention?: boolean
}

/** No value: missing or an empty string (same rule as the dashboard's content health checks). */
const empty = (field: string): Where => ({
  or: [{ [field]: { exists: false } }, { [field]: { equals: '' } }],
})
const filled = (field: string): Where => ({
  and: [{ [field]: { exists: true } }, { [field]: { not_equals: '' } }],
})

/** Extra facts per collection. Collections without an entry get the generic facts only. */
export const SUMMARY_FACTS: Partial<Record<CollectionSlug, SummaryFact[]>> = {
  articles: [
    { label: 'with a page', where: filled('description') },
    { label: 'featured', where: { featured: { equals: true } } },
    {
      label: 'without an image',
      where: { and: [{ image: { exists: false } }, empty('imageUrl')] },
      attention: true,
    },
  ],
  projects: [
    {
      label: 'without an image',
      where: { and: [{ image: { exists: false } }, empty('src')] },
      attention: true,
    },
  ],
  users: [
    // Without a role nobody can open the admin (ADR 0011).
    { label: 'without a role', where: { roles: { exists: false } }, attention: true },
  ],
  roles: [{ label: 'with full access', where: { fullAccess: { equals: true } } }],
}

/**
 * Counts with the signed-in user's access, so the summary never reveals hidden documents. Returns
 * null instead of throwing (for example after a field rename), so the list view always renders.
 */
export const countWithAccess = async (
  { payload, user }: { payload: BasePayload; user: TypedUser | null | undefined },
  collection: CollectionSlug,
  where?: Where,
  trash?: boolean,
) =>
  payload
    .count({ collection, where, trash, user: user ?? undefined, overrideAccess: false })
    .then((result) => result.totalDocs)
    .catch((error: unknown) => {
      payload.logger.warn({ msg: `List summary: count on ${collection} failed`, err: error })
      return null
    })
