import Link from 'next/link'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ArticleItem, SiteSettingsContent } from '@/app/(frontend)/lib/types'
import { CoverImage } from '../ui/CoverImage'

export type ArticlesSectionProps = {
  articles: ArticleItem[]
  labels?: SiteSettingsContent['articlesSection']
}

export function ArticlesSection({
  articles,
  labels = DEFAULT_SITE_SETTINGS.articlesSection,
}: ArticlesSectionProps) {
  const featuredArticles = articles.filter((article) => article.featured)
  const regularArticles =
    featuredArticles.length > 0 ? articles.filter((article) => !article.featured) : articles
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

            {featuredArticles.length > 0 ? (
              <div className="row g-4 mb-4" data-testid="featured-articles-slot">
                {featuredArticles.map((article) => (
                  <FeaturedArticleCard
                    key={article.id}
                    article={article}
                    featuredBadgeLabel={labels.featuredBadgeLabel}
                    readOnSiteLabel={labels.readOnSiteLabel}
                  />
                ))}
              </div>
            ) : null}

            <div className="row gy-1 gx-4 align-items-stretch">
              {regularArticles.map((article) => (
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

function FeaturedArticleCard({
  article,
  featuredBadgeLabel,
  readOnSiteLabel,
}: {
  article: ArticleItem
  featuredBadgeLabel: string
  readOnSiteLabel: string
}) {
  const primaryHref = article.pagePath ?? (article.link || '#')
  const isInternal = primaryHref.startsWith('/')

  return (
    <article className="col-12" data-featured="true">
      <div className="service-item rounded p-3 p-md-4 wow fadeInUp">
        <div className="row g-4 align-items-center">
          <div className="col-lg-5">
            <Link
              href={primaryHref}
              {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className="d-block rounded overflow-hidden"
            >
              <CoverImage
                src={article.imageUrl}
                alt={article.title}
                fallbackSrc="/placeholder.svg"
                sizes="(max-width: 992px) 100vw, 45vw"
                width={520}
                height={320}
                className="img-fluid w-100"
              />
            </Link>
          </div>
          <div className="col-lg-7">
            <div className="mb-2 d-flex flex-wrap align-items-center gap-2">
              <span className="badge bg-primary text-dark text-uppercase">
                {featuredBadgeLabel}
              </span>
              <span className="small text-secondary">
                Issued: {article.author} • {article.readTime} read
              </span>
            </div>
            <h3 className="h4 my-2">
              <Link
                href={primaryHref}
                {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="text-white text-decoration-none"
              >
                {article.title}
              </Link>
            </h3>
            <p className="article-text mb-3">{article.excerpt}</p>
            <div className="d-flex flex-wrap gap-3 align-items-center">
              {article.pagePath ? (
                <Link href={article.pagePath} className="btn btn-primary btn-sm px-3 py-2">
                  {readOnSiteLabel}
                </Link>
              ) : null}
              {article.link ? (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="small text-secondary"
                >
                  External ↗
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
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
    <article className="col-lg-4 col-md-6">
      <div className="service-item rounded h-100 p-1 my-2 wow fadeInUp d-flex flex-column">
        <Link
          href={primaryHref}
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="text-decoration-none"
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
