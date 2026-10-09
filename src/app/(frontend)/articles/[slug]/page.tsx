import '@/app/(frontend)/styles/article.css'

import { notFound } from 'next/navigation'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedArticleBySlug, getCachedArticleSlugs } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'

// Article page (article page spec §5.1). Composition only: SiteChrome plus the article components.
// Only articles with a slug and a body have a page. Anything else gets notFound() (not-found.tsx).

export async function generateStaticParams() {
  const slugs = await getCachedArticleSlugs()
  return slugs.map((slug) => ({ slug }))
}

type ArticlePageProps = { params: Promise<{ slug: string }> }

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const [article, content] = await Promise.all([
    getCachedArticleBySlug(slug),
    getCachedPortfolioContent(),
  ])

  if (!article) notFound()

  return (
    <SiteChrome footer={content.footer}>
      <main id="main-content" className="article-page">
        <ArticleLayout article={article} />
      </main>
    </SiteChrome>
  )
}
