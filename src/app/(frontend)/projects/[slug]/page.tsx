import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import { ProjectLivePreviewSwitch } from '@/app/(frontend)/components/project/ProjectLivePreviewSwitch'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { getCachedProjectBySlug, getCachedProjectSlugs } from '@/app/(frontend)/lib/projects'
import { buildProjectJsonLd, buildProjectMetadata } from '@/app/(frontend)/lib/seo'

export async function generateStaticParams() {
  const slugs = await getCachedProjectSlugs()
  return slugs.map((slug) => ({ slug }))
}

type ProjectPageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params
  const [project, content] = await Promise.all([
    getCachedProjectBySlug(slug),
    getCachedPortfolioContent(),
  ])
  if (!project) {
    return {
      title: content.siteSettings.projectsSection.notFoundTitle,
      robots: { index: false, follow: true },
    }
  }
  return buildProjectMetadata(project, content.siteSettings)
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params
  const [project, content] = await Promise.all([
    getCachedProjectBySlug(slug),
    getCachedPortfolioContent(),
  ])

  if (!project) notFound()

  const { siteSettings } = content
  const projectLabels = {
    caseStudyLabel: siteSettings.projectsSection.caseStudyLabel,
    backToProjectsLabel: siteSettings.projectsSection.backToProjectsLabel,
    liveProjectLabel: siteSettings.projectsSection.liveProjectLabel,
  }

  return (
    <>
      <SiteChrome
        navigation={content.navigation}
        footer={content.footer}
        footerLabels={siteSettings.footerLabels}
      >
        <main id="main-content" className="article-page">
          <ProjectLivePreviewSwitch id={project.id} labels={projectLabels}>
            <ProjectLayout project={project} labels={projectLabels} />
          </ProjectLivePreviewSwitch>
        </main>
      </SiteChrome>
      <JsonLd data={buildProjectJsonLd(project, content.header, content.footer, siteSettings)} />
    </>
  )
}
