import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { draftMode } from 'next/headers'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import { ProjectLivePreviewSwitch } from '@/app/(frontend)/components/project/ProjectLivePreviewSwitch'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { PayloadRedirects } from '@/app/(frontend)/components/seo/PayloadRedirects'
import { DraftModeBanner } from '@/app/(frontend)/components/ui/DraftModeBanner'
import { getCachedProjectsList, getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { projectPagePath } from '@/app/(frontend)/lib/project-page'
import {
  getCachedProjectBySlug,
  getCachedProjectSlugs,
  getDraftProjectBySlug,
} from '@/app/(frontend)/lib/projects'
import { buildProjectJsonLd, buildProjectMetadata } from '@/app/(frontend)/lib/seo'

export async function generateStaticParams() {
  const slugs = await getCachedProjectSlugs()
  return slugs.map((slug) => ({ slug }))
}

type ProjectPageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params
  const { isEnabled: isDraft } = await draftMode()
  const [project, chrome] = await Promise.all([
    isDraft ? getDraftProjectBySlug(slug) : getCachedProjectBySlug(slug),
    getCachedSiteChrome(),
  ])
  if (!project) {
    return {
      title: chrome.siteSettings.projectsSection.notFoundTitle,
      robots: { index: false, follow: true },
    }
  }
  const metadata = buildProjectMetadata(project, chrome.siteSettings)
  return isDraft ? { ...metadata, robots: { index: false, follow: false } } : metadata
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params
  const { isEnabled: isDraft } = await draftMode()
  const [project, chrome, projectsContent] = await Promise.all([
    isDraft ? getDraftProjectBySlug(slug) : getCachedProjectBySlug(slug),
    getCachedSiteChrome(),
    getCachedProjectsList(),
  ])

  if (!project) {
    return <PayloadRedirects url={projectPagePath(slug)} />
  }

  const { siteSettings, headerStudio } = chrome
  const projectLabels = {
    caseStudyLabel: siteSettings.projectsSection.caseStudyLabel,
    backToProjectsLabel: siteSettings.projectsSection.backToProjectsLabel,
    liveProjectLabel: siteSettings.projectsSection.liveProjectLabel,
  }
  const currentPath = projectPagePath(project.slug)
  const relatedProjects = projectsContent.items
    .filter((item) => item.pagePath !== currentPath && String(item.id) !== String(project.id))
    .slice(0, 3)

  return (
    <>
      <SiteChrome
        navigation={chrome.navigation}
        footer={chrome.footer}
        footerLabels={siteSettings.footerLabels}
      >
        <main id="main-content" className="article-page p-0">
          {isDraft ? <DraftModeBanner currentPath={currentPath} /> : null}
          <ProjectLivePreviewSwitch
            id={project.id}
            labels={projectLabels}
            headerConfig={headerStudio.projectDetail}
            relatedProjects={relatedProjects}
          >
            <ProjectLayout
              project={project}
              labels={projectLabels}
              headerConfig={headerStudio.projectDetail}
              relatedProjects={relatedProjects}
            />
          </ProjectLivePreviewSwitch>
        </main>
      </SiteChrome>
      <JsonLd data={buildProjectJsonLd(project, chrome.header, chrome.footer, siteSettings)} />
    </>
  )
}
