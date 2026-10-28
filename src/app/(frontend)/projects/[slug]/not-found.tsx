import '@/app/(frontend)/styles/article.css'

import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { PROJECTS_HUB_PATH } from '@/app/(frontend)/lib/project-page'

export default async function ProjectNotFound() {
  const content = await getCachedSiteChrome()
  const { projectsSection, footerLabels } = content.siteSettings

  return (
    <SiteChrome
      navigation={content.navigation}
      footer={content.footer}
      footerLabels={footerLabels}
    >
      <main id="main-content" className="article-page article-not-found">
        <h1 className="article-title">{projectsSection.notFoundTitle}</h1>
        <p className="article-excerpt">{projectsSection.notFoundDescription}</p>
        <Link href={PROJECTS_HUB_PATH} className="article-cta">
          {projectsSection.backToProjectsLabel}
        </Link>
      </main>
    </SiteChrome>
  )
}
