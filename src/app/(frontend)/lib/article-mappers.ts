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
import { mapSeoOverride, resolveMediaBlurDataURL, resolveMediaSizeUrl } from './mappers'
import type { SeoOverride } from './types'

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
  coverUrl: string | null
  coverBlurDataURL?: string | null
  /** Alt text from the media record (§9). Falls back to the title. */
  coverAlt: string
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
  const coverBlurDataURL = resolveMediaBlurDataURL(doc.image)

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
    coverUrl: resolveMediaSizeUrl(doc.image, 'hero') ?? (doc.imageUrl || null),
    ...(coverBlurDataURL ? { coverBlurDataURL } : {}),
    coverAlt: (typeof doc.image === 'object' && doc.image?.alt) || doc.title,
    content: effectiveContent,
    paragraphs,
    toc: extractTableOfContents(effectiveContent),
    externalLink: doc.link || null,
    seo: mapSeoOverride(doc.meta),
  }
}
