import type { Article } from '@/payload-types'

import { hasArticlePage, splitArticleBody } from './article-page'
import { formatDisplayDate, formatReadTime } from './format'
import { resolveMediaUrl } from './mappers'

/** The view model for one article page. Components receive only this, never the Payload document. */
export type ArticleDetail = {
  slug: string
  title: string
  excerpt: string
  category: 'articles' | 'others' | null
  /** e.g. "February 2, 2025" */
  publishedDisplay: string
  /** e.g. "3 min" */
  readTimeDisplay: string
  coverUrl: string | null
  /** The body, split from `description` (§5.3). */
  paragraphs: string[]
  /** Where the article is also published (LinkedIn, Medium). */
  externalLink: string | null
}

/**
 * Maps an article to its page view model, or returns null when the article has no page (no slug, or no
 * body). The route calls `notFound()` for null.
 */
export const mapArticleDetail = (doc: Article): ArticleDetail | null => {
  if (!doc.slug || !hasArticlePage(doc)) return null

  return {
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    category: doc.category ?? null,
    publishedDisplay: formatDisplayDate(doc.publishedAt),
    readTimeDisplay: formatReadTime(doc.readTime),
    coverUrl: resolveMediaUrl(doc.image) ?? (doc.imageUrl || null),
    paragraphs: splitArticleBody(doc.description ?? ''),
    externalLink: doc.link || null,
  }
}
