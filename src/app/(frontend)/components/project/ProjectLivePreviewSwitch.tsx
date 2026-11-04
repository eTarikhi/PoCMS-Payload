'use client'

import dynamic from 'next/dynamic'
import { type ReactNode, useSyncExternalStore } from 'react'

import type { ProjectDetailHeaderConfig, ProjectItem } from '@/app/(frontend)/lib/types'

import type { ProjectPageLabels } from './ProjectLayout'

const ProjectLivePreview = dynamic(() => import('./ProjectLivePreview'), { ssr: false })

const noopSubscribe = () => () => {}
const isEmbedded = () => window.self !== window.top

export function ProjectLivePreviewSwitch({
  id,
  labels,
  headerConfig,
  relatedProjects,
  children,
}: {
  id: number
  labels?: ProjectPageLabels
  headerConfig?: ProjectDetailHeaderConfig
  relatedProjects?: ProjectItem[]
  children: ReactNode
}) {
  const embedded = useSyncExternalStore(noopSubscribe, isEmbedded, () => false)
  return embedded ? (
    <ProjectLivePreview
      id={id}
      labels={labels}
      headerConfig={headerConfig}
      relatedProjects={relatedProjects}
      fallback={children}
    />
  ) : (
    children
  )
}
