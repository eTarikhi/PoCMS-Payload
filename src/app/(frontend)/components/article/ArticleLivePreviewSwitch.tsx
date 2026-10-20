'use client'

import dynamic from 'next/dynamic'
import { type ReactNode, useSyncExternalStore } from 'react'

const ArticleLivePreview = dynamic(() => import('./ArticleLivePreview'), { ssr: false })

const noopSubscribe = () => () => {}
const isEmbedded = () => window.self !== window.top

/**
 * Public visitors get the server-rendered article (`children`) and nothing else. Only when the page
 * runs inside a frame (the admin's Live Preview) is the live renderer loaded, as a separate chunk.
 */
export function ArticleLivePreviewSwitch({ id, children }: { id: number; children: ReactNode }) {
  const embedded = useSyncExternalStore(noopSubscribe, isEmbedded, () => false)
  return embedded ? <ArticleLivePreview id={id} fallback={children} /> : children
}
