import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildProjectsHubJsonLd, buildProjectsHubMetadata } from '@/app/(frontend)/lib/seo'
import type { ProjectsArchiveLayoutMode } from '@/app/(frontend)/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  const content = await getCachedPortfolioContent()
  return buildProjectsHubMetadata(content.siteSettings)
}

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>

const pickFirst = (val: string | string[] | undefined): string | undefined =>
  Array.isArray(val) ? val[0] : val

export default async function ProjectsHubPage(props?: { searchParams?: SearchParamsInput }) {
  const [content, resolvedParams] = await Promise.all([
    getCachedPortfolioContent(),
    props?.searchParams
      ? props.searchParams
      : Promise.resolve({} as Record<string, string | string[] | undefined>),
  ])
  const { siteSettings, headerStudio } = content
  const rawView = pickFirst(resolvedParams.view)
  const initialView: ProjectsArchiveLayoutMode | undefined =
    rawView === 'showcase' || rawView === 'list' || rawView === 'grid' ? rawView : undefined

  return (
    <>
      <SiteChrome
        navigation={content.navigation}
        footer={content.footer}
        footerLabels={siteSettings.footerLabels}
      >
        <main id="main-content" className="article-page p-0">
          <ProjectsArchive
            projects={content.projects.items}
            labels={siteSettings.projectsSection}
            headerConfig={headerStudio.projectsArchive}
            initialQuery={pickFirst(resolvedParams.q)}
            initialCategory={pickFirst(resolvedParams.category)}
            initialTech={pickFirst(resolvedParams.tech)}
            initialSort={pickFirst(resolvedParams.sort)}
            initialView={initialView}
          />
        </main>
      </SiteChrome>
      <JsonLd data={buildProjectsHubJsonLd(content.projects.items, siteSettings)} />
    </>
  )
}
