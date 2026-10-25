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
    const matches = articles.filter((article) => {
      if (category === 'articles' && article.category !== 'articles') return false
      if (category === 'others' && article.category !== 'others') return false
      if (category === 'on-site' && !article.pagePath) return false

      if (!normalizedQuery) return true
      const haystack = `${article.title} ${article.excerpt} ${article.category ?? ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })

    return [...matches].sort(
      (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
    )
  }, [articles, category, query])

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
        <div className="row gy-1 gx-4 align-items-center">
          {filtered.map((article) => (
            <ArchiveArticleCard
              key={article.id}
              article={article}
              featuredBadgeLabel={labels.featuredBadgeLabel}
              readOnSiteLabel={labels.readOnSiteLabel}
            />
          ))}
        </div>
      )}
    </div>
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
    <article
      className="col-lg-4 col-md-6"
      data-featured={article.featured ? 'true' : undefined}
    >
      <div className="service-item rounded h-100 p-1 my-2 d-flex flex-column">
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
            <h2 className="h5 my-2 article-title text-white">{article.title}</h2>
            <p className="article-text">{article.excerpt}</p>
          </div>
        </Link>
        <div className="px-4 pb-4 mt-auto">
          <p className="text-xs text-muted-foreground mb-1">
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
