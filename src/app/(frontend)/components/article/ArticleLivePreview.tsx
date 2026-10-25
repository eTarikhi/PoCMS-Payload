'use client'

import { useLivePreview } from '@payloadcms/live-preview-react'
import type { ReactNode } from 'react'

import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import type { Article } from '@/payload-types'

import type { ArticleFooterNavLabels } from './ArticleFooterNav'
import { ArticleLayout } from './ArticleLayout'

/**
 * Inside the admin's Live Preview iframe: renders the article from the editor's unsaved form state
 * (Payload posts it on load and on every change). Until the first message arrives, and whenever
 * the draft has no page yet (empty body), the server-rendered article stays on screen.
 */
type ArticleLivePreviewProps = {
  /** The saved article's id: Payload resolves the draft's relations (cover image) for it. */
  id: number
  labels?: ArticleFooterNavLabels
  fallback: ReactNode
}

export default function ArticleLivePreview({ id, labels, fallback }: ArticleLivePreviewProps) {
  const { data, isLoading } = useLivePreview<Partial<Article>>({
    initialData: { id },
    serverURL: window.location.origin,
    depth: 1,
  })
  const article = !isLoading && data.title ? mapArticleDetail(data as Article) : null
  return article ? <ArticleLayout article={article} labels={labels} /> : fallback
}
