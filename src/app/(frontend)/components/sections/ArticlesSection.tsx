import Link from 'next/link'

import type { ArticleItem } from '@/app/(frontend)/lib/types'
import { CoverImage } from '../ui/CoverImage'

// Ported from vTarikhi/components/sections/articles.tsx. All articles are shown (D-12).

export type ArticlesSectionProps = {
  articles: ArticleItem[]
}

export function ArticlesSection({ articles }: ArticlesSectionProps) {
  return (
    <section id="article">
      <div className="container-xxl py-5">
        <div className="row g-5">
          <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
            <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
              <div className="col-lg-6">
                <h2 className="display-6 mb-0">Latest Articles</h2>
              </div>
              <div className="col-lg-6 text-lg-end">
                <Link
                  className="btn btn-primary py-3 px-5"
                  target="_blank"
                  href="https://www.linkedin.com/in/etarikhi/recent-activity/articles/"
                >
                  All Articles &gt;
                </Link>
              </div>
            </div>
            <div className="row gy-1 gx-4 align-items-center">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ArticleCard({ article }: { article: ArticleItem }) {
  return (
    <article className="col-lg-4 col-md-6">
      <div className="service-item rounded h-100 p-1 my-2 wow fadeInUp">
        <Link href={article.link} target="_blank" rel="noopener noreferrer" className="">
          <div className="rounded overflow-hidden">
            <CoverImage
              src={article.imageUrl}
              alt={article.title}
              fallbackSrc="/placeholder.svg"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              width={400}
              height={255}
              className="img-fluid"
            />
          </div>
          <div className="p-2">
            <h3 className="h5 my-2 article-title">{article.title}</h3>
            <p className="article-text">{article.excerpt}</p>
          </div>
        </Link>
        <div className="px-4 pb-4 mt-auto">
          <p className="text-xs text-muted-foreground">
            Issued: {article.author} • {article.readTime} read
          </p>
          {article.pagePath ? (
            <Link href={article.pagePath} className="small">
              Read on this site
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
