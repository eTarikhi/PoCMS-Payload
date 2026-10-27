'use client'

import { useLivePreview } from '@payloadcms/live-preview-react'
import type { ReactNode } from 'react'

import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import type { ProjectDetailHeaderConfig, ProjectItem } from '@/app/(frontend)/lib/types'
import type { Project } from '@/payload-types'

import { ProjectLayout, type ProjectPageLabels } from './ProjectLayout'

type ProjectLivePreviewProps = {
  id: number
  labels?: ProjectPageLabels
  headerConfig?: ProjectDetailHeaderConfig
  relatedProjects?: ProjectItem[]
  fallback: ReactNode
}

export default function ProjectLivePreview({
  id,
  labels,
  headerConfig,
  relatedProjects,
  fallback,
}: ProjectLivePreviewProps) {
  const { data, isLoading } = useLivePreview<Partial<Project>>({
    initialData: { id },
    serverURL: window.location.origin,
    depth: 2,
  })
  const project = !isLoading && data.title ? mapProjectDetail(data as Project) : null
  return project ? (
    <ProjectLayout
      project={project}
      labels={labels}
      headerConfig={headerConfig}
      relatedProjects={relatedProjects}
    />
  ) : (
    fallback
  )
}
