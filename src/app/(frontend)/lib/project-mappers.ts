import type { Project } from '@/payload-types'

import { formatReadTime } from './format'
import {
  calculateReadTimeMinutes,
  extractTableOfContents,
  type TocItem,
} from './lexical'
import { mapSeoOverride, resolveProjectDetailMedia } from './mappers'
import { hasProjectPage } from './project-page'
import type {
  ArticleGalleryLayout,
  ArticleGallerySlide,
  ArticleMediaMode,
  SeoOverride,
} from './types'

const CATEGORY_LABELS: Record<string, string> = {
  'front-end': 'Front-End',
  'back-end': 'Back-End',
  'cms-crm': 'CMS-CRM',
}

export type ProjectDetail = {
  id: number
  slug: string
  title: string
  excerpt: string | null
  categories: string[]
  categoryLabels: string[]
  role: string | null
  client: string | null
  year: string | null
  techStack: string[]
  readTimeDisplay: string
  /** Resolved case-study lead media preview mode (`'none'` | `'single'` | `'gallery'`). */
  mediaMode?: ArticleMediaMode
  coverUrl: string | null
  coverBlurDataURL?: string | null
  coverObjectPosition?: string
  coverAlt: string
  /** Gallery display layout when `mediaMode === 'gallery'`. */
  galleryLayout?: ArticleGalleryLayout
  /** Resolved gallery slides when `mediaMode === 'gallery'`. */
  gallery?: ArticleGallerySlide[]
  liveUrl: string | null
  readMoreUrl: string | null
  content: Project['content']
  toc: TocItem[]
  /** Optional per-document SEO overrides from `@payloadcms/plugin-seo`. */
  seo?: SeoOverride
}

/**
 * Maps a `Project` document to its case-study page view model, or returns `null` when the project
 * has no slug or no rich-text case-study body.
 */
export const mapProjectDetail = (doc: Project): ProjectDetail | null => {
  if (!doc.slug || !hasProjectPage(doc)) return null

  const minutes = calculateReadTimeMinutes({
    content: doc.content,
    fallbackReadTime: doc.readTime,
  })
  const categories = doc.categories ?? []
  const leadMedia = resolveProjectDetailMedia(doc)

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt?.trim() || null,
    categories,
    categoryLabels: categories.map((value) => CATEGORY_LABELS[value] ?? value),
    role: doc.role?.trim() || null,
    client: doc.client?.trim() || null,
    year: doc.year?.trim() || null,
    techStack: (doc.techStack ?? []).map((item) => item.trim()).filter(Boolean),
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
    liveUrl: doc.url?.trim() || null,
    readMoreUrl: doc.readMoreUrl?.trim() || null,
    content: doc.content,
    toc: extractTableOfContents(doc.content),
    seo: mapSeoOverride(doc.meta),
  }
}
