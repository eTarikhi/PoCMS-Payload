import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { ArticleLivePreviewSwitch } from '@/app/(frontend)/components/article/ArticleLivePreviewSwitch'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { PayloadRedirects } from '@/app/(frontend)/components/seo/PayloadRedirects'
import { articlePagePath } from '@/app/(frontend)/lib/article-page'
import { getCachedArticleBySlug, getCachedArticleSlugs } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildArticleMetadata, buildBlogPostingJsonLd } from '@/app/(frontend)/lib/seo'

// Article page (article page spec §5.1). Composition only: SiteChrome plus the article components.
// Only articles with a slug and a body have a page. Anything else gets notFound() (not-found.tsx).

export async function generateStaticParams() {
  const slugs = await getCachedArticleSlugs()
  return slugs.map((slug) => ({ slug }))
}

type ArticlePageProps = { params: Promise<{ slug: string }> }

// Per-article metadata (article page spec §7). A missing article is marked noindex, so search engines drop it.
export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const [article, content] = await Promise.all([
    getCachedArticleBySlug(slug),
    getCachedPortfolioContent(),
  ])
  if (!article) {
    return {
      title: content.siteSettings.articlesSection.notFoundTitle,
      robots: { index: false, follow: true },
    }
  }
  return buildArticleMetadata(article, content.siteSettings)
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const [article, content] = await Promise.all([
    getCachedArticleBySlug(slug),
    getCachedPortfolioContent(),
  ])

  if (!article) {
    return <PayloadRedirects url={articlePagePath(slug)} />
  }

  const { siteSettings } = content
  const footerNavLabels = {
    backToArticlesLabel: siteSettings.articlesSection.backToArticlesLabel,
    externalPublicationLabel: siteSettings.articlesSection.externalPublicationLabel,
  }

  return (
    <>
      <SiteChrome
        navigation={content.navigation}
        footer={content.footer}
        footerLabels={siteSettings.footerLabels}
      >
        <main id="main-content" className="article-page">
          {/* In the admin's Live Preview iframe the article follows the editor's changes. */}
          <ArticleLivePreviewSwitch id={article.id} labels={footerNavLabels}>
            <ArticleLayout article={article} labels={footerNavLabels} />
          </ArticleLivePreviewSwitch>
        </main>
      </SiteChrome>
      <JsonLd data={buildBlogPostingJsonLd(article, content.header, content.footer, siteSettings)} />
    </>
  )
}
