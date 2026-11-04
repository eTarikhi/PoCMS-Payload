import type { Article } from '@/payload-types'

import { hasArticlePage, splitArticleBody } from './article-page'
import { formatDisplayDate, formatReadTime } from './format'
import {
  calculateReadTimeMinutes,
  extractLexicalText,
  extractTableOfContents,
  hasLexicalContent,
  plainTextToLexical,
  type TocItem,
} from './lexical'
import { mapSeoOverride, resolveArticleDetailMedia } from './mappers'
import type {
  ArticleGalleryLayout,
  ArticleGallerySlide,
  ArticleMediaMode,
  SeoOverride,
} from './types'

/** The view model for one article page. Components receive only this, never the Payload document. */
export type ArticleDetail = {
  /** Document id (Live Preview needs it to fetch the editor's draft with relations resolved). */
  id: number
  slug: string
  title: string
  excerpt: string
  featured?: boolean
  category: 'articles' | 'others' | null
  /** ISO date for <time dateTime>. Null when the article has no date. */
  publishedAt: string | null
  /** e.g. "February 2, 2025" */
  publishedDisplay: string
  /** e.g. "3 min" */
  readTimeDisplay: string
  /** Resolved lead media preview mode (`'none'` | `'single'` | `'gallery'`). */
  mediaMode?: ArticleMediaMode
  coverUrl: string | null
  coverBlurDataURL?: string | null
  coverObjectPosition?: string
  /** Alt text from override or media record (§9). Falls back to the title. */
  coverAlt: string
  /** Gallery display layout when `mediaMode === 'gallery'`. */
  galleryLayout?: ArticleGalleryLayout
  /** Resolved gallery slides when `mediaMode === 'gallery'`. */
  gallery?: ArticleGallerySlide[]
  /** Rich-text Lexical editor state (converted from legacy `description` when `content` is empty). */
  content?: Article['content']
  /** Extracted plain-text paragraphs (kept for backward compatibility and lightweight excerpts). */
  paragraphs: string[]
  /** Extracted Table of Contents from H2/H3/H4 headings inside `content`. */
  toc?: TocItem[]
  /** Where the article is also published (LinkedIn, Medium). */
  externalLink: string | null
  /** Optional per-document SEO overrides from `@payloadcms/plugin-seo`. */
  seo?: SeoOverride
}

/**
 * Maps an article to its page view model, or returns null when the article has no page (no slug, or no
 * body). The route calls `notFound()` for null.
 */
export const mapArticleDetail = (doc: Article): ArticleDetail | null => {
  if (!doc.slug || !hasArticlePage(doc)) return null

  const hasRichContent = hasLexicalContent(doc.content)
  const effectiveContent = hasRichContent
    ? doc.content
    : (plainTextToLexical(doc.description ?? '') as Article['content'])

  const minutes = calculateReadTimeMinutes({
    content: doc.content,
    description: doc.description,
    fallbackReadTime: doc.readTime,
  })

  const paragraphs = hasRichContent
    ? splitArticleBody(extractLexicalText(doc.content))
    : splitArticleBody(doc.description ?? '')
  const leadMedia = resolveArticleDetailMedia(doc)

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    featured: Boolean(doc.featured),
    category: doc.category ?? null,
    publishedAt: doc.publishedAt ?? null,
    publishedDisplay: formatDisplayDate(doc.publishedAt),
    readTimeDisplay: formatReadTime(minutes),
    mediaMode: leadMedia.mediaMode,
    coverUrl: leadMedia.heroUrl,
    ...(leadMedia.blurDataURL ? { coverBlurDataURL: leadMedia.blurDataURL } : {}),
    ...(leadMedia.coverObjectPosition
      ? { coverObjectPosition: leadMedia.coverObjectPosition }
      : {}),
    coverAlt: leadMedia.coverAlt,
    galleryLayout: leadMedia.galleryLayout,
    gallery: leadMedia.gallery,
    content: effectiveContent,
    paragraphs,
    toc: extractTableOfContents(effectiveContent),
    externalLink: doc.link || null,
    seo: mapSeoOverride(doc.meta),
  }
}
