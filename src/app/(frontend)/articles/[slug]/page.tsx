import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleLivePreview } from '@/app/(frontend)/components/article/ArticleLivePreview'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import { getCachedArticleDoc, getCachedArticleSlugs } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildArticleMetadata, buildBlogPostingJsonLd } from '@/app/(frontend)/lib/seo'

// Article page (article page spec §5.1). Composition only: SiteChrome plus the article components.
// Only articles with a slug and a body have a page. Anything else gets notFound() (not-found.tsx).
// The article body renders through ArticleLivePreview so the admin's Live Preview iframe updates
// as the editor types; on the public site the same component shows the server-fetched document.

export async function generateStaticParams() {
  const slugs = await getCachedArticleSlugs()
  return slugs.map((slug) => ({ slug }))
}

type ArticlePageProps = { params: Promise<{ slug: string }> }

// Per-article metadata (article page spec §7). A missing article is marked noindex, so search engines drop it.
export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const doc = await getCachedArticleDoc(slug)
  const article = doc ? mapArticleDetail(doc) : null
  if (!article) return { title: 'Article not found', robots: { index: false, follow: true } }
  return buildArticleMetadata(article)
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const [doc, content] = await Promise.all([
    getCachedArticleDoc(slug),
    getCachedPortfolioContent(),
  ])

  const article = doc ? mapArticleDetail(doc) : null
  if (!article || !doc) notFound()

  return (
    <>
      <SiteChrome footer={content.footer}>
        <main id="main-content" className="article-page">
          <ArticleLivePreview initialData={doc} />
        </main>
      </SiteChrome>
      <JsonLd data={buildBlogPostingJsonLd(article, content.header, content.footer)} />
    </>
  )
}
