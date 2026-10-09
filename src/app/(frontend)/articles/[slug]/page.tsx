import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { CoverImage } from '@/app/(frontend)/components/ui/CoverImage'
import { getCachedArticleBySlug, getCachedArticleSlugs } from '@/app/(frontend)/lib/articles'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'

// Article page (article page spec §5.1). Set B: routing and data. The reading layer comes in Set C.
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
      <main id="main-content" className="container-xxl py-5">
        <article className="row justify-content-center">
          <div className="col-lg-8">
            <p className="text-muted">
              {article.publishedDisplay} • {article.readTimeDisplay} read
            </p>
            <h1 className="display-5 mb-4">{article.title}</h1>
            {article.coverUrl ? (
              <div className="mb-4">
                <CoverImage
                  src={article.coverUrl}
                  alt={article.title}
                  fallbackSrc="/placeholder.svg"
                  sizes="(max-width: 992px) 100vw, 800px"
                  width={800}
                  height={450}
                  className="img-fluid rounded"
                />
              </div>
            ) : null}
            {article.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <p className="mt-5">
              {article.externalLink ? (
                <a href={article.externalLink} target="_blank" rel="noopener noreferrer">
                  Originally published at
                </a>
              ) : null}
              {article.externalLink ? ' · ' : null}
              <Link href="/#article">Back to articles</Link>
            </p>
          </div>
        </article>
      </main>
    </SiteChrome>
  )
}
