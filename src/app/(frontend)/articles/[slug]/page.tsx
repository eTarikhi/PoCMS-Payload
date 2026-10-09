import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
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
  const article = await getCachedArticleBySlug(slug)
  if (!article) return { title: 'Article not found', robots: { index: false, follow: true } }
  return buildArticleMetadata(article)
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const [article, content] = await Promise.all([
    getCachedArticleBySlug(slug),
    getCachedPortfolioContent(),
  ])

  if (!article) notFound()

  return (
    <>
      <SiteChrome footer={content.footer}>
        <main id="main-content" className="article-page">
          <ArticleLayout article={article} />
        </main>
      </SiteChrome>
      <JsonLd data={buildBlogPostingJsonLd(article, content.header, content.footer)} />
    </>
  )
}
