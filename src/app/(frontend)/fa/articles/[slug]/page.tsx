import '@/app/(frontend)/styles/article.css'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { JsonLd } from '@/app/(frontend)/components/seo/JsonLd'
import { getCachedArticleBySlug, getCachedArticleSlugs } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { buildArticleMetadata, buildBlogPostingJsonLd } from '@/app/(frontend)/lib/seo'
import { getMessages } from '@/i18n/messages'

const locale = 'fa' as const

type ArticlePageProps = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const slugs = await getCachedArticleSlugs(locale)
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const article = await getCachedArticleBySlug(slug, locale)
  if (!article) {
    return { title: getMessages(locale).notFound.title, robots: { index: false, follow: true } }
  }
  return buildArticleMetadata(article, locale)
}

export default async function PersianArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
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
