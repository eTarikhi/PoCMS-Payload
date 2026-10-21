import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { ArticleLivePreviewSwitch } from '@/app/(frontend)/components/article/ArticleLivePreviewSwitch'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedArticleBySlug } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'

/**
 * The admin's Live Preview target for articles (`Articles.admin.livePreview`).
 *
 * The public article page is prerendered and only knows published articles, which is what the site
 * needs. A draft, however, has to be previewable — so Live Preview opens this route instead. It is
 * dynamic (the editor's preview cannot be cached), keeps itself out of search engines, and renders
 * the same `ArticleLayout` the public page uses:
 *
 * - the published article, when there is one, as the first paint;
 * - an empty article page for a draft, which `ArticleLivePreview` fills from the editor's form
 *   state as soon as Payload posts it.
 *
 * The data the preview component fetches goes through Payload's REST API with the editor's own
 * session, so access control decides what a visitor opening this URL directly can see: for anyone
 * who is not signed in, drafts stay invisible.
 */
export const dynamic = 'force-dynamic'

type PreviewPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ id?: string }>
}

export const metadata: Metadata = {
  title: 'Article preview',
  robots: { index: false, follow: false },
}

export default async function ArticlePreviewPage({ params, searchParams }: PreviewPageProps) {
  const { slug } = await params
  const { id } = await searchParams
  const [article, content] = await Promise.all([
    getCachedArticleBySlug(slug),
    getCachedPortfolioContent(),
  ])
  const previewId = Number(id)

  return (
    <SiteChrome footer={content.footer} navigation={content.navigation}>
      {article ? (
        <main id="main-content" className="article-page">
          <ArticleLivePreviewSwitch id={previewId}>
            <ArticleLayout article={article} />
          </ArticleLivePreviewSwitch>
        </main>
      ) : (
        <main id="main-content" className="article-page">
          <ArticleLivePreviewSwitch id={previewId}>
            <p className="article-excerpt">This article is not published yet.</p>
          </ArticleLivePreviewSwitch>
        </main>
      )}
    </SiteChrome>
  )
}
