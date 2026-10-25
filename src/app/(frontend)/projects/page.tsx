import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildProjectsHubJsonLd, buildProjectsHubMetadata } from '@/app/(frontend)/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const content = await getCachedPortfolioContent()
  return buildProjectsHubMetadata(content.siteSettings)
}

export default async function ProjectsHubPage() {
  const content = await getCachedPortfolioContent()
  const { siteSettings } = content

  return (
    <>
      <SiteChrome
        navigation={content.navigation}
        footer={content.footer}
        footerLabels={siteSettings.footerLabels}
      >
        <main id="main-content" className="article-page">
          <ProjectsArchive
            projects={content.projects.items}
            labels={siteSettings.projectsSection}
          />
        </main>
      </SiteChrome>
      <JsonLd data={buildProjectsHubJsonLd(content.projects.items, siteSettings)} />
    </>
  )
}
