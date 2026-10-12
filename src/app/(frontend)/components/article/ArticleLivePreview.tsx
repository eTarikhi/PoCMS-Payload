'use client'

import { useLivePreview } from '@payloadcms/live-preview-react'
import React, { useMemo } from 'react'

import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import type { Article } from '@/payload-types'

import { ArticleLayout } from './ArticleLayout'

type ArticleLivePreviewProps = {
  /** Raw article document, used as-is until a Live Preview message arrives. */
  initialData: Article
}

/**
 * Renders the article page and, when embedded in the admin's Live Preview iframe, swaps in
 * document changes as the editor types. Outside the admin iframe the hook stays idle and the
 * server-rendered `initialData` is displayed unchanged.
 */
export function ArticleLivePreview({ initialData }: ArticleLivePreviewProps) {
  // Same-origin app: the admin and the site share a host, so the window origin is the API origin.
  const serverURL = typeof window !== 'undefined' ? window.location.origin : ''

  const { data } = useLivePreview<Article>({
    initialData,
    serverURL,
    depth: 1,
  })

  const article = useMemo(() => mapArticleDetail(data), [data])

  if (!article) return null

  return <ArticleLayout article={article} />
}

export default ArticleLivePreview
