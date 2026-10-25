import Link from 'next/link'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ArticleItem, SiteSettingsContent } from '@/app/(frontend)/lib/types'
import { CoverImage } from '../ui/CoverImage'

// Ported from vTarikhi/components/sections/articles.tsx. All articles are shown in the 3-column grid (D-12);
// articles marked `featured` appear first in the grid while preserving the original home-page card layout.

export type ArticlesSectionProps = {
  articles: ArticleItem[]
  labels?: SiteSettingsContent['articlesSection']
}

export function ArticlesSection({
  articles,
  labels = DEFAULT_SITE_SETTINGS.articlesSection,
}: ArticlesSectionProps) {
  const orderedArticles = [...articles].sort(
    (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  )
  const ctaIsInternal = Boolean(labels.cta?.url.startsWith('/'))

  return (
    <section id="article">
      <div className="container-xxl py-5">
        <div className="row g-5">
          <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
            <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
              <div className="col-lg-6">
                <h2 className="display-6 mb-0">{labels.heading}</h2>
              </div>
              <div className="col-lg-6 text-lg-end">
                {labels.cta ? (
                  <Link
                    className="btn btn-primary py-3 px-5"
                    href={labels.cta.url}
                    {...(ctaIsInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                  >
                    {labels.cta.label}
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="row gy-1 gx-4 align-items-center">
              {orderedArticles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  readOnSiteLabel={labels.readOnSiteLabel}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ArticleCard({
  article,
  readOnSiteLabel,
}: {
  article: ArticleItem
  readOnSiteLabel: string
}) {
  const primaryHref = article.link || article.pagePath || '#'
  const isInternal = primaryHref.startsWith('/')

  return (
    <article
      className="col-lg-4 col-md-6"
      data-featured={article.featured ? 'true' : undefined}
    >
      <div className="service-item rounded h-100 p-1 my-2 wow fadeInUp">
        <Link
          href={primaryHref}
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className=""
        >
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
              {readOnSiteLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
