import type { Project } from '@/payload-types'

import { formatReadTime } from './format'
import {
  calculateReadTimeMinutes,
  extractTableOfContents,
  type TocItem,
} from './lexical'
import { resolveMediaUrl } from './mappers'
import { hasProjectPage } from './project-page'

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
  coverUrl: string | null
  coverAlt: string
  liveUrl: string | null
  readMoreUrl: string | null
  content: Project['content']
  toc: TocItem[]
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
  const uploadUrl = resolveMediaUrl(doc.image)

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
    coverUrl: uploadUrl ?? (doc.src?.trim() || null),
    coverAlt: (typeof doc.image === 'object' && doc.image?.alt) || doc.title,
    liveUrl: doc.url?.trim() || null,
    readMoreUrl: doc.readMoreUrl?.trim() || null,
    content: doc.content,
    toc: extractTableOfContents(doc.content),
  }
}
