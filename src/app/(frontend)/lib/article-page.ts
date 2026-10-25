import { hasLexicalContent } from './lexical'

/**
 * Pure helpers for article pages and the `/articles` hub. No Payload or Next runtime imports,
 * so `mappers.ts`, `article-mappers.ts`, and Payload collection configs can share them cleanly.
 */

export type ArticleBodyFields = {
  slug?: string | null
  content?: unknown
  description?: string | null
}

/**
 * An article has an on-site page when it has a slug and either non-empty Lexical `content`
 * or a non-empty legacy plain-text `description`.
 */
export const hasArticlePage = (doc: ArticleBodyFields): boolean =>
  Boolean(doc.slug) &&
  (hasLexicalContent(doc.content) || (doc.description ?? '').trim().length > 0)

export const articlePagePath = (slug: string): string => `/articles/${slug}`

export const ARTICLES_HUB_PATH = '/articles'

/**
 * Splits a legacy plain-text body into paragraphs. Paragraphs are separated by a blank line.
 * Single line breaks inside a paragraph become spaces. Empty chunks are dropped.
 */
export const splitArticleBody = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
