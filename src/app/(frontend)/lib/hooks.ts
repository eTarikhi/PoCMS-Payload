import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  GlobalAfterChangeHook,
} from 'payload'

import { revalidatePortfolio } from './revalidate'
import { slugify, withUniqueSuffix } from './slug'

/**
 * Hooks that refresh the home-page cache when editors change content.
 *
 * Attach `portfolioAfterChange` and `portfolioAfterDelete` to every content collection and the
 * `footer` global. Each hook makes one `revalidatePortfolio()` call, which never throws, so a failed
 * refresh cannot fail the save (roadmap §3.2).
 */
export const portfolioAfterChange: CollectionAfterChangeHook & GlobalAfterChangeHook = ({
  doc,
}) => {
  revalidatePortfolio()
  return doc
}

export const portfolioAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  revalidatePortfolio()
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
