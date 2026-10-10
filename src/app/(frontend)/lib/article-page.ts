/**
 * Pure helpers for the article page (article page spec §3 and §5.3). No Payload or Next imports,
 * so `mappers.ts` and `article-mappers.ts` can both use them without an import cycle.
 */

type ArticleBodyFields = { slug?: string | null; description?: string | null }

/** An article has a page when it has a slug and a non-empty body (`description`). D-A1, D-A10. */
export const hasArticlePage = (doc: ArticleBodyFields): boolean =>
  Boolean(doc.slug) && (doc.description ?? '').trim().length > 0

export const articlePagePath = (slug: string): string => `/articles/${slug}`

/**
 * Splits a plain-text body into paragraphs. Paragraphs are separated by a blank line. Single line breaks
 * inside a paragraph become spaces. Empty chunks are dropped. No HTML is parsed (D-A2 revised).
 */
export const splitArticleBody = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
