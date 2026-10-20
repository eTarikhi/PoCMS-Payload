import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  GlobalAfterChangeHook,
} from 'payload'

import { revalidatePortfolio } from './revalidate'
import { slugify, withUniqueSuffix } from './slug'

/**
 * The routes a change affects: the home page always (every collection feeds it), plus the article
 * page when an article with a slug was saved or deleted.
 */
const affectedPaths = (collection?: CollectionConfig, doc?: { slug?: string | null }): string[] => {
  const paths = ['/']
  if (collection?.slug === 'articles' && typeof doc?.slug === 'string' && doc.slug) {
    paths.push(`/articles/${doc.slug}`)
  }
  return paths
}

/**
 * Hooks that refresh the public site's cache when editors change content.
 *
 * Attach `portfolioAfterChange` and `portfolioAfterDelete` to every content collection and the
 * `footer` global. Each hook makes one `revalidatePortfolio()` call, which never throws, so a failed
 * refresh cannot fail the save (roadmap §3.2).
 */
export const portfolioAfterChange: CollectionAfterChangeHook & GlobalAfterChangeHook = (args) => {
  // Global hooks pass `global`, collection hooks pass `collection`; only the latter can be an article.
  const collection = 'collection' in args ? (args.collection as CollectionConfig) : undefined
  revalidatePortfolio(affectedPaths(collection, args.doc as { slug?: string | null }))
  return args.doc
}

export const portfolioAfterDelete: CollectionAfterDeleteHook = ({ collection, doc }) => {
  revalidatePortfolio(affectedPaths(collection, doc as { slug?: string | null }))
  return doc
}

/**
 * Fills in `articles.slug` (article page spec §3).
 *
 * - On create, or when an editor clears the field, the slug is made from the title (or from the typed
 *   value), then a `-2`, `-3` suffix is added if another article already has it.
 * - On update, when the field is not in the request, the existing slug is kept, so a title edit does
 *   not break an article URL.
 * - Any typed slug is normalised with the same `slugify`, so URLs stay ASCII.
 */
export const articleSlugBeforeValidate: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data
  if (operation === 'update' && data.slug === undefined) return data

  const typed = typeof data.slug === 'string' ? data.slug.trim() : ''
  const source = typed || data.title || originalDoc?.title || ''
  const base = slugify(source)
  const ownId = originalDoc?.id

  const slug = await withUniqueSuffix(base, async (candidate) => {
    const { docs } = await req.payload.find({
      collection: 'articles',
      depth: 0,
      limit: 1,
      pagination: false,
      req,
      where:
        ownId === undefined
          ? { slug: { equals: candidate } }
          : { and: [{ slug: { equals: candidate } }, { id: { not_equals: ownId } }] },
    })
    return docs.length > 0
  })

  return { ...data, slug }
}
