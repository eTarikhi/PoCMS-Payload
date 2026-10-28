import '@/app/(frontend)/styles/article.css'

import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { ARTICLES_HUB_PATH } from '@/app/(frontend)/lib/article-page'
import { getCachedSiteChrome } from '@/app/(frontend)/lib/cache'

export default async function ArticleNotFound() {
  const content = await getCachedSiteChrome()
  const { articlesSection, footerLabels } = content.siteSettings

  return (
    <SiteChrome
      navigation={content.navigation}
      footer={content.footer}
      footerLabels={footerLabels}
    >
      <main id="main-content" className="article-page article-not-found">
        <h1 className="article-title">{articlesSection.notFoundTitle}</h1>
        <p className="article-excerpt">{articlesSection.notFoundDescription}</p>
        <Link href={ARTICLES_HUB_PATH} className="article-cta">
          {articlesSection.backToArticlesLabel}
        </Link>
      </main>
    </SiteChrome>
  )
}
