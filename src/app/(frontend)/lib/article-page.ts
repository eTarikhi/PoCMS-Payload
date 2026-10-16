import { DEFAULT_LOCALE, localizePath, type Locale } from '@/i18n/locales'

/**
 * Pure helpers for the article page. No Payload or Next imports, so `mappers.ts` and
 * `article-mappers.ts` can both use them without an import cycle.
 */

type ArticleBodyFields = { slug?: string | null; description?: string | null }

/** An article has a page when it has a slug and a non-empty body. */
export const hasArticlePage = (doc: ArticleBodyFields): boolean =>
  Boolean(doc.slug) && (doc.description ?? '').trim().length > 0

export const articlePagePath = (slug: string, locale: Locale = DEFAULT_LOCALE): string =>
  localizePath(locale, `/articles/${slug}`)

/**
 * Splits a plain-text body into paragraphs. Paragraphs are separated by a blank line. Single line
 * breaks inside a paragraph become spaces. Empty chunks are dropped. No HTML is parsed.
 */
export const splitArticleBody = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
