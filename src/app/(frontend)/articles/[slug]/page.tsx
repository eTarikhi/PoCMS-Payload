import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedArticleBySlug, getCachedArticleSlugs } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildArticleMetadata, buildBlogPostingJsonLd } from '@/app/(frontend)/lib/seo'
import { DEFAULT_LOCALE } from '@/i18n/locales'

export async function generateStaticParams() {
  const slugs = await getCachedArticleSlugs(DEFAULT_LOCALE)
  return slugs.map((slug) => ({ slug }))
}

type ArticlePageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const article = await getCachedArticleBySlug(slug, DEFAULT_LOCALE)
  if (!article) return { title: 'Article not found', robots: { index: false, follow: true } }
  return buildArticleMetadata(article, DEFAULT_LOCALE)
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const locale = DEFAULT_LOCALE
  const [article, content] = await Promise.all([
    getCachedArticleBySlug(slug, locale),
    getCachedPortfolioContent(locale),
  ])

  if (!article) notFound()

  return (
    <>
      <SiteChrome currentPath={`/articles/${slug}`} footer={content.footer} locale={locale}>
        <main id="main-content" className="article-page">
          <ArticleLayout article={article} locale={locale} />
        </main>
      </SiteChrome>
      <JsonLd data={buildBlogPostingJsonLd(article, content.header, content.footer, locale)} />
    </>
  )
}
