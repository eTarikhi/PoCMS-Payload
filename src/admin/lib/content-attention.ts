import { stringify } from 'qs-esm'
import type { Where } from 'payload'

/**
 * Content-gap checks for the "Needs attention" dashboard widget.
 * Pure data — no Payload runtime imports — so it is unit-testable without a database.
 */
export type AttentionCheck = {
  collection: 'articles' | 'projects'
  collectionLabel: string
  label: string
  note: string
  where: Where
}

export const ATTENTION_CHECKS: AttentionCheck[] = [
  {
    collection: 'articles',
    collectionLabel: 'Articles',
    label: 'Articles without a cover image',
    note: 'Neither the image upload nor the image URL is set, so cards fall back to a placeholder.',
    where: { and: [{ image: { exists: false } }, { imageUrl: { exists: false } }] },
  },
  {
    collection: 'articles',
    collectionLabel: 'Articles',
    label: 'Articles without a reading time',
    note: 'The article meta line shows "min" only when this is filled in.',
    where: { or: [{ readTime: { exists: false } }, { readTime: { equals: null } }] },
  },
  {
    collection: 'projects',
    collectionLabel: 'Projects',
    label: 'Projects without any image',
    note: 'None of the image upload, image URL, or placeholder URL is set.',
    where: {
      and: [{ image: { exists: false } }, { src: { exists: false } }, { placeHolder: { exists: false } }],
    },
  },
  {
    collection: 'projects',
    collectionLabel: 'Projects',
    label: 'Projects without a live URL',
    note: 'The project card cannot link out to a live site or case study.',
    where: { or: [{ url: { exists: false } }, { url: { equals: null } }] },
  },
]

/**
 * Builds a list-view URL with a pre-applied `where` filter, e.g.
 * `/admin/collections/articles?where[image][exists]=false`.
 */
export function attentionListUrl(collection: string, where: Where): string {
  return `/admin/collections/${collection}?${stringify({ where }, { encodeValuesOnly: true })}`
}
