import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
  GlobalAfterChangeHook,
} from 'payload'

import { calculateReadTimeMinutes, hasLexicalContent } from './lexical'
import { revalidatePortfolio } from './revalidate'
import { slugify, withUniqueSuffix } from './slug'

/**
 * Hooks that refresh the portfolio cache when editors change content.
 *
 * Attach `portfolioAfterChange` and `portfolioAfterDelete` to every content collection and global.
 * Each hook makes one `revalidatePortfolio()` call, which never throws, so a failed refresh cannot
 * fail the save (roadmap §3.2).
 */
export const portfolioAfterChange: CollectionAfterChangeHook & GlobalAfterChangeHook = ({
  context,
  doc,
}) => {
  if (!context?.skipRevalidate) revalidatePortfolio()
  return doc
}

export const portfolioAfterDelete: CollectionAfterDeleteHook = ({ context, doc }) => {
  if (!context?.skipRevalidate) revalidatePortfolio()
  return doc
}

/**
 * Builds a `beforeValidate` hook that fills in a unique `slug` field for a collection:
 * - On create, or when an editor clears the field, the slug is made from `title` (or from the typed
 *   value), then a `-2`, `-3` suffix is added if another document in the collection already has it.
 * - On update, when `slug` is omitted from the payload, the existing slug is kept so title edits
 *   do not break published URLs.
 * - Any typed slug is normalized with `slugify` so URLs stay ASCII.
 */
export const createSlugBeforeValidate =
  (collection: CollectionSlug): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, operation, req }) => {
    if (!data) return data
    if (operation === 'update' && data.slug === undefined) return data

    const typed = typeof data.slug === 'string' ? data.slug.trim() : ''
    const source = typed || data.title || originalDoc?.title || ''
    const base = slugify(source)
    const ownId = originalDoc?.id

    const slug = await withUniqueSuffix(base, async (candidate) => {
      const { docs } = await req.payload.find({
        collection,
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

export const articleSlugBeforeValidate: CollectionBeforeValidateHook =
  createSlugBeforeValidate('articles')

export const projectSlugBeforeValidate: CollectionBeforeValidateHook =
  createSlugBeforeValidate('projects')

/**
 * Automatically calculates `readTime` (in minutes, ~200 words/min) whenever a document has
 * Lexical `content` or legacy plain-text `description`. When the document has no body (e.g. an
 * external link-out article), any manually entered `readTime` is preserved.
 */
export const computeReadTimeBeforeChange: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  if (!data) return data

  const content = data.content !== undefined ? data.content : originalDoc?.content
  const description =
    data.description !== undefined
      ? (data.description as string | null | undefined)
      : (originalDoc?.description as string | null | undefined)
  const manualReadTime =
    data.readTime !== undefined
      ? (data.readTime as number | null | undefined)
      : (originalDoc?.readTime as number | null | undefined)

  const hasBody = hasLexicalContent(content) || Boolean(description && description.trim().length > 0)
  if (!hasBody) {
    return data
  }

  const computed = calculateReadTimeMinutes({
    content,
    description,
    fallbackReadTime: manualReadTime ?? null,
  })

  return {
    ...data,
    readTime: computed,
  }
}
