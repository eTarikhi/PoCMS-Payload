'use client'

import dynamic from 'next/dynamic'
import { type ReactNode, useSyncExternalStore } from 'react'

import type { ArticleFooterNavLabels } from './ArticleFooterNav'

const ArticleLivePreview = dynamic(() => import('./ArticleLivePreview'), { ssr: false })

const noopSubscribe = () => () => {}
const isEmbedded = () => window.self !== window.top

/**
 * Public visitors get the server-rendered article (`children`) and nothing else. Only when the page
 * runs inside a frame (the admin's Live Preview) is the live renderer loaded, as a separate chunk.
 */
export function ArticleLivePreviewSwitch({
  id,
  labels,
  children,
}: {
  id: number
  labels?: ArticleFooterNavLabels
  children: ReactNode
}) {
  const embedded = useSyncExternalStore(noopSubscribe, isEmbedded, () => false)
  return embedded ? <ArticleLivePreview id={id} labels={labels} fallback={children} /> : children
}
