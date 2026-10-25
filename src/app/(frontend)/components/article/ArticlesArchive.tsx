'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ArticleItem, SiteSettingsContent } from '@/app/(frontend)/lib/types'
import { CoverImage } from '../ui/CoverImage'

type CategoryFilter = 'all' | 'articles' | 'others' | 'on-site'

const CATEGORY_FILTER_OPTIONS: Array<{ label: string; value: CategoryFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Articles', value: 'articles' },
  { label: 'Others', value: 'others' },
  { label: 'On this site', value: 'on-site' },
]

export type ArticlesArchiveProps = {
  articles: ArticleItem[]
  labels?: SiteSettingsContent['articlesSection']
  initialQuery?: string
  initialCategory?: string
}

export function ArticlesArchive({
  articles,
  labels = DEFAULT_SITE_SETTINGS.articlesSection,
  initialQuery = '',
  initialCategory = 'all',
}: ArticlesArchiveProps) {
  const validInitialCategory: CategoryFilter =
    initialCategory === 'articles' ||
    initialCategory === 'others' ||
    initialCategory === 'on-site'
      ? initialCategory
      : 'all'

  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<CategoryFilter>(validInitialCategory)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return articles.filter((article) => {
      if (category === 'articles' && article.category !== 'articles') return false
      if (category === 'others' && article.category !== 'others') return false
      if (category === 'on-site' && !article.pagePath) return false

      if (!normalizedQuery) return true
      const haystack = `${article.title} ${article.excerpt} ${article.category ?? ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [articles, category, query])

  const featuredItems = filtered.filter((article) => article.featured)
  const regularItems =
    featuredItems.length > 0 ? filtered.filter((article) => !article.featured) : filtered

  return (
    <div className="articles-hub">
      <header className="articles-hub-header">
        <h1 className="article-title">{labels.heading}</h1>
        {labels.archiveDescription ? (
          <p className="article-excerpt mb-0">{labels.archiveDescription}</p>
        ) : null}
      </header>

      <div className="articles-hub-controls">
        <input
          type="search"
          className="articles-hub-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label="Search articles"
        />
        <div className="articles-hub-filters" role="group" aria-label="Filter articles">
          {CATEGORY_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`articles-filter-btn ${category === option.value ? 'active' : ''}`}
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="articles-hub-count" aria-live="polite">
        Showing {filtered.length} of {articles.length}{' '}
        {articles.length === 1 ? 'article' : 'articles'}
      </p>

      {filtered.length === 0 ? (
        <div className="service-item rounded p-4 text-center">
          <p className="mb-3">No articles match your search or selected filter.</p>
          <button
            type="button"
            className="articles-filter-btn active"
            onClick={() => {
              setQuery('')
              setCategory('all')
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <>
          {featuredItems.length > 0 ? (
            <div className="row g-4 mb-4" data-testid="archive-featured-articles">
              {featuredItems.map((article) => (
                <FeaturedArchiveCard
                  key={article.id}
                  article={article}
                  featuredBadgeLabel={labels.featuredBadgeLabel}
                  readOnSiteLabel={labels.readOnSiteLabel}
                />
              ))}
            </div>
          ) : null}

          <div className="row g-4">
            {regularItems.map((article) => (
              <ArchiveArticleCard
                key={article.id}
                article={article}
                featuredBadgeLabel={labels.featuredBadgeLabel}
                readOnSiteLabel={labels.readOnSiteLabel}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FeaturedArchiveCard({
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
    <article className="col-12">
      <div className="service-item rounded p-3 p-md-4">
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
              <span className="featured-badge">{featuredBadgeLabel}</span>
              <span className="small text-secondary">
                Issued: {article.author} • {article.readTime} read
              </span>
            </div>
            <h2 className="h3 mb-2">
              <Link
                href={primaryHref}
                {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="text-white text-decoration-none"
              >
                {article.title}
              </Link>
            </h2>
            <p className="article-text mb-3">{article.excerpt}</p>
            <div className="d-flex flex-wrap gap-3 align-items-center">
              {article.pagePath ? (
                <Link href={article.pagePath} className="project-cta-primary">
                  {readOnSiteLabel}
                </Link>
              ) : null}
              {article.link ? (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="small"
                >
                  External link ↗
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function ArchiveArticleCard({
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
    <article className="col-lg-4 col-md-6">
      <div className="service-item rounded h-100 p-2 d-flex flex-column">
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
            {article.featured ? (
              <span className="featured-badge mb-2">{featuredBadgeLabel}</span>
            ) : null}
            <h2 className="h5 my-2 text-white">{article.title}</h2>
            <p className="article-text">{article.excerpt}</p>
          </div>
        </Link>
        <div className="px-2 pb-2 mt-auto">
          <p className="small text-secondary mb-1">
            Issued: {article.author} • {article.readTime} read
          </p>
          <div className="d-flex flex-wrap gap-3">
            {article.pagePath ? (
              <Link href={article.pagePath} className="small">
                {readOnSiteLabel}
              </Link>
            ) : null}
            {article.link && article.pagePath ? (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="small"
              >
                External ↗
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
