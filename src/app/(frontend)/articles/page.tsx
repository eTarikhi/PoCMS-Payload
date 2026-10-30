import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { ArticlesArchive } from '@/app/(frontend)/components/article/ArticlesArchive'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedArticlesList, getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { buildArticlesHubJsonLd, buildArticlesHubMetadata } from '@/app/(frontend)/lib/seo'
import type { ArticlesArchiveLayoutMode } from '@/app/(frontend)/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  const { siteSettings } = await getCachedSiteChrome()
  return buildArticlesHubMetadata(siteSettings)
}

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>

const pickFirst = (val: string | string[] | undefined): string | undefined =>
  Array.isArray(val) ? val[0] : val

export default async function ArticlesHubPage(props?: { searchParams?: SearchParamsInput }) {
  const [chrome, articles, resolvedParams] = await Promise.all([
    getCachedSiteChrome(),
    getCachedArticlesList(),
    props?.searchParams
      ? props.searchParams
      : Promise.resolve({} as Record<string, string | string[] | undefined>),
  ])
  const { siteSettings, headerStudio } = chrome
  const rawView = pickFirst(resolvedParams.view)
  const initialView: ArticlesArchiveLayoutMode | undefined =
    rawView === 'magazine' || rawView === 'list' || rawView === 'grid' ? rawView : undefined

  return (
    <>
      <SiteChrome
        navigation={chrome.navigation}
        footer={chrome.footer}
        footerLabels={siteSettings.footerLabels}
        customCode={chrome.customCode}
      >
        <main id="main-content" className="article-page p-0">
          <ArticlesArchive
            articles={articles}
            labels={siteSettings.articlesSection}
            headerConfig={headerStudio.articlesArchive}
            initialQuery={pickFirst(resolvedParams.q)}
            initialCategory={pickFirst(resolvedParams.category)}
            initialSort={pickFirst(resolvedParams.sort)}
            initialView={initialView}
          />
        </main>
      </SiteChrome>
      <JsonLd data={buildArticlesHubJsonLd(articles, siteSettings)} />
    </>
  )
}
