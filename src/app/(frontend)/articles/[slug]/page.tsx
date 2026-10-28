import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { draftMode } from 'next/headers'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { ArticleLivePreviewSwitch } from '@/app/(frontend)/components/article/ArticleLivePreviewSwitch'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { PayloadRedirects } from '@/app/(frontend)/components/seo/PayloadRedirects'
import { DraftModeBanner } from '@/app/(frontend)/components/ui/DraftModeBanner'
import { articlePagePath } from '@/app/(frontend)/lib/article-page'
import {
  getCachedArticleBySlug,
  getCachedArticleSlugs,
  getDraftArticleBySlug,
} from '@/app/(frontend)/lib/articles'
import { getCachedArticlesList, getCachedSiteChrome } from '@/app/(frontend)/lib/cache'
import { buildArticleMetadata, buildBlogPostingJsonLd } from '@/app/(frontend)/lib/seo'

export async function generateStaticParams() {
  const slugs = await getCachedArticleSlugs()
  return slugs.map((slug) => ({ slug }))
}

type ArticlePageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const { isEnabled: isDraft } = await draftMode()
  const [article, chrome] = await Promise.all([
    isDraft ? getDraftArticleBySlug(slug) : getCachedArticleBySlug(slug),
    getCachedSiteChrome(),
  ])
  if (!article) {
    return {
      title: chrome.siteSettings.articlesSection.notFoundTitle,
      robots: { index: false, follow: true },
    }
  }
  const metadata = buildArticleMetadata(article, chrome.siteSettings)
  return isDraft ? { ...metadata, robots: { index: false, follow: false } } : metadata
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const { isEnabled: isDraft } = await draftMode()
  const [article, chrome, allArticles] = await Promise.all([
    isDraft ? getDraftArticleBySlug(slug) : getCachedArticleBySlug(slug),
    getCachedSiteChrome(),
    getCachedArticlesList(),
  ])

  if (!article) {
    return <PayloadRedirects url={articlePagePath(slug)} />
  }

  const { siteSettings, headerStudio } = chrome
  const footerNavLabels = {
    backToArticlesLabel: siteSettings.articlesSection.backToArticlesLabel,
    externalPublicationLabel: siteSettings.articlesSection.externalPublicationLabel,
  }
  const currentPath = articlePagePath(article.slug)
  const relatedArticles = allArticles
    .filter((item) => item.pagePath !== currentPath && String(item.id) !== String(article.id))
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
          {/* In the admin's Live Preview iframe the article follows the editor's changes. */}
          <ArticleLivePreviewSwitch
            id={article.id}
            labels={footerNavLabels}
            headerConfig={headerStudio.articleDetail}
            ownerName={siteSettings.ownerName}
            featuredBadgeLabel={siteSettings.articlesSection.featuredBadgeLabel}
            relatedArticles={relatedArticles}
          >
            <ArticleLayout
              article={article}
              labels={footerNavLabels}
              headerConfig={headerStudio.articleDetail}
              ownerName={siteSettings.ownerName}
              featuredBadgeLabel={siteSettings.articlesSection.featuredBadgeLabel}
              relatedArticles={relatedArticles}
            />
          </ArticleLivePreviewSwitch>
        </main>
      </SiteChrome>
      <JsonLd data={buildBlogPostingJsonLd(article, chrome.header, chrome.footer, siteSettings)} />
    </>
  )
}
