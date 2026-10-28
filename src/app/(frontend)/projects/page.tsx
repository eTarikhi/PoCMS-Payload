import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedProjectsList, getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { buildProjectsHubJsonLd, buildProjectsHubMetadata } from '@/app/(frontend)/lib/seo'
import type { ProjectsArchiveLayoutMode } from '@/app/(frontend)/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  const { siteSettings } = await getCachedSiteChrome()
  return buildProjectsHubMetadata(siteSettings)
}

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>

const pickFirst = (val: string | string[] | undefined): string | undefined =>
  Array.isArray(val) ? val[0] : val

export default async function ProjectsHubPage(props?: { searchParams?: SearchParamsInput }) {
  const [chrome, projectsContent, resolvedParams] = await Promise.all([
    getCachedSiteChrome(),
    getCachedProjectsList(),
    props?.searchParams
      ? props.searchParams
      : Promise.resolve({} as Record<string, string | string[] | undefined>),
  ])
  const { siteSettings, headerStudio } = chrome
  const rawView = pickFirst(resolvedParams.view)
  const initialView: ProjectsArchiveLayoutMode | undefined =
    rawView === 'showcase' || rawView === 'list' || rawView === 'grid' ? rawView : undefined

  return (
    <>
      <SiteChrome
        navigation={chrome.navigation}
        footer={chrome.footer}
        footerLabels={siteSettings.footerLabels}
      >
        <main id="main-content" className="article-page p-0">
          <ProjectsArchive
            projects={projectsContent.items}
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
      <JsonLd data={buildProjectsHubJsonLd(projectsContent.items, siteSettings)} />
    </>
  )
}
