'use client'

import dynamic from 'next/dynamic'
import { type ReactNode, useSyncExternalStore } from 'react'

import type { ProjectPageLabels } from './ProjectLayout'

const ProjectLivePreview = dynamic(() => import('./ProjectLivePreview'), { ssr: false })

const noopSubscribe = () => () => {}
const isEmbedded = () => window.self !== window.top

export function ProjectLivePreviewSwitch({
  id,
  labels,
  children,
}: {
  id: number
  labels?: ProjectPageLabels
  children: ReactNode
}) {
  const embedded = useSyncExternalStore(noopSubscribe, isEmbedded, () => false)
  return embedded ? <ProjectLivePreview id={id} labels={labels} fallback={children} /> : children
}
