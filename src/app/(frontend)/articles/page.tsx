import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { ArticlesArchive } from '@/app/(frontend)/components/article/ArticlesArchive'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildArticlesHubJsonLd, buildArticlesHubMetadata } from '@/app/(frontend)/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const content = await getCachedPortfolioContent()
  return buildArticlesHubMetadata(content.siteSettings)
}

export default async function ArticlesHubPage() {
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
          <ArticlesArchive
            articles={content.articles}
            labels={siteSettings.articlesSection}
          />
        </main>
      </SiteChrome>
      <JsonLd data={buildArticlesHubJsonLd(content.articles, siteSettings)} />
    </>
  )
}
