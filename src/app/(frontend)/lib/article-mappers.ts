import type { Article } from '@/payload-types'

import { hasArticlePage, splitArticleBody } from './article-page'
import { formatDisplayDate, formatReadTime } from './format'
import { mapSeoMeta, resolveMediaSize, resolveMediaUrl } from './mappers'
import type { SeoMeta } from './types'

/** The view model for one article page. Components receive only this, never the Payload document. */
export type ArticleDetail = {
  /** Document id (Live Preview needs it to fetch the editor's draft with relations resolved). */
  id: number
  slug: string
  title: string
  excerpt: string
  category: 'articles' | 'others' | null
  /** ISO date for <time dateTime>. Null when the article has no date. */
  publishedAt: string | null
  /** e.g. "February 2, 2025" */
  publishedDisplay: string
  /** e.g. "3 min" */
  readTimeDisplay: string
  coverUrl: string | null
  /** 1200x630 Open Graph crop of the cover, when the cover has one (Media → sizes.og). */
  coverOg: { url: string; width: number | null; height: number | null } | null
  /** Alt text from the media record (§9). Falls back to the title. */
  coverAlt: string
  /** The body, split from `description` (§5.3). */
  paragraphs: string[]
  /** Where the article is also published (LinkedIn, Medium). */
  externalLink: string | null
  /** Editor-written metadata (Payload's SEO plugin). Empty fields fall back to the fields above. */
  seo: SeoMeta
}

/**
 * Maps an article to its page view model, or returns null when the article has no page (no slug, or no
 * body). The route calls `notFound()` for null.
 */
export const mapArticleDetail = (doc: Article): ArticleDetail | null => {
  if (!doc.slug || !hasArticlePage(doc)) return null

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    category: doc.category ?? null,
    publishedAt: doc.publishedAt ?? null,
    publishedDisplay: formatDisplayDate(doc.publishedAt),
    readTimeDisplay: formatReadTime(doc.readTime),
    coverUrl: resolveMediaUrl(doc.image) ?? (doc.imageUrl || null),
    // A legacy text URL has no generated sizes; the metadata then falls back to the profile image.
    coverOg: resolveMediaSize(doc.image, 'og'),
    coverAlt: (typeof doc.image === 'object' && doc.image?.alt) || doc.title,
    paragraphs: splitArticleBody(doc.description ?? ''),
    externalLink: doc.link || null,
    seo: mapSeoMeta(doc.meta),
  }
}
