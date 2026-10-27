'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { DEFAULT_HEADER_STUDIO, DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type {
  ArticleItem,
  ArticlesArchiveHeaderConfig,
  ArticlesArchiveLayoutMode,
  SiteSettingsContent,
} from '@/app/(frontend)/lib/types'
import { ArchiveHubHeader } from '../headers/ArchiveHubHeader'
import { CoverImage } from '../ui/CoverImage'

type CategoryFilter = 'all' | 'articles' | 'others' | 'on-site'
type ArticleSortMode = 'featured' | 'latest' | 'title'

const CATEGORY_FILTER_OPTIONS: Array<{ label: string; value: CategoryFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Articles', value: 'articles' },
  { label: 'Others', value: 'others' },
  { label: 'On this site', value: 'on-site' },
]

const SORT_OPTIONS: Array<{ label: string; value: ArticleSortMode }> = [
  { label: 'Sort: Featured first', value: 'featured' },
  { label: 'Sort: Latest order', value: 'latest' },
  { label: 'Sort: Title (A–Z)', value: 'title' },
]

const VIEW_OPTIONS: Array<{ label: string; value: ArticlesArchiveLayoutMode }> = [
  { label: 'Magazine', value: 'magazine' },
  { label: 'List', value: 'list' },
  { label: 'Grid', value: 'grid' },
]

export type ArticlesArchiveProps = {
  articles: ArticleItem[]
  labels?: SiteSettingsContent['articlesSection']
  headerConfig?: ArticlesArchiveHeaderConfig
  initialQuery?: string
  initialCategory?: string
  initialSort?: string
  initialView?: ArticlesArchiveLayoutMode
}

export function ArticlesArchive({
  articles,
  labels = DEFAULT_SITE_SETTINGS.articlesSection,
  headerConfig,
  initialQuery = '',
  initialCategory = 'all',
  initialSort = 'featured',
  initialView,
}: ArticlesArchiveProps) {
  const effectiveHeader = headerConfig ?? DEFAULT_HEADER_STUDIO.articlesArchive

  const validInitialCategory: CategoryFilter =
    initialCategory === 'articles' ||
    initialCategory === 'others' ||
    initialCategory === 'on-site'
      ? initialCategory
      : 'all'

  const validInitialSort: ArticleSortMode =
    initialSort === 'latest' || initialSort === 'title' ? initialSort : 'featured'

  const resolvedDefaultView: ArticlesArchiveLayoutMode =
    initialView ?? (headerConfig ? headerConfig.defaultLayout : 'grid')

  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<CategoryFilter>(validInitialCategory)
  const [sortBy, setSortBy] = useState<ArticleSortMode>(validInitialSort)
  const [viewMode, setViewMode] = useState<ArticlesArchiveLayoutMode>(resolvedDefaultView)

  // Keep URL query parameters in sync for shareable filtered views
  useEffect(() => {
    if (typeof window === 'undefined' || !headerConfig) return
    const params = new URLSearchParams(window.location.search)
    if (query.trim()) params.set('q', query.trim())
    else params.delete('q')

    if (category !== 'all') params.set('category', category)
    else params.delete('category')

    if (sortBy !== 'featured') params.set('sort', sortBy)
    else params.delete('sort')

    if (viewMode !== effectiveHeader.defaultLayout) params.set('view', viewMode)
    else params.delete('view')

    const qs = params.toString()
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [category, effectiveHeader.defaultLayout, headerConfig, query, sortBy, viewMode])

  const onSiteCount = useMemo(
    () => articles.filter((a) => Boolean(a.pagePath)).length,
    [articles],
  )

  const featuredReads = useMemo(() => {
    const featured = articles.filter((a) => a.featured)
    if (featured.length >= 3) return featured.slice(0, 4)
    const rest = articles.filter((a) => !a.featured)
    return [...featured, ...rest].slice(0, 4)
  }, [articles])

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

    const copy = [...matches]
    if (sortBy === 'title') {
      copy.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortBy === 'featured') {
      copy.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    }
    return copy
  }, [articles, category, query, sortBy])

  const hasActiveFilters = Boolean(query.trim()) || category !== 'all'
  const resetFilters = () => {
    setQuery('')
    setCategory('all')
    setSortBy('featured')
  }

  const statusText = `Showing ${filtered.length} of ${articles.length} ${
    articles.length === 1 ? 'article' : 'articles'
  }`

  const resolvedHeading = effectiveHeader.headingOverride || labels.heading
  const resolvedSubtitle = effectiveHeader.subtitleOverride ?? labels.archiveDescription

  const showSpotlightInMagazine =
    viewMode === 'magazine' && !hasActiveFilters && filtered.length > 0
  const spotlightArticle = showSpotlightInMagazine ? filtered[0] : null
  const streamArticles =
    showSpotlightInMagazine && filtered.length > 1 ? filtered.slice(1) : filtered

  return (
    <div className="pocms-subpage-shell articles-hub">
      <ArchiveHubHeader
        hubName="Articles"
        siblingLink={{ label: 'Projects', href: '/projects' }}
        eyebrow={effectiveHeader.eyebrow}
        heading={resolvedHeading}
        subtitle={resolvedSubtitle}
        backgroundPreset={effectiveHeader.backgroundPreset}
        accentTone={effectiveHeader.accentTone}
        showStatsBar={effectiveHeader.showStatsBar}
        stats={[
          { value: articles.length, label: articles.length === 1 ? 'Article' : 'Articles' },
          { value: onSiteCount, label: onSiteCount === 1 ? 'Full Guide' : 'Full Guides' },
        ]}
        showRssLink={effectiveHeader.showRssLink}
        showSearch={effectiveHeader.showSearch}
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder={labels.searchPlaceholder}
        searchAriaLabel="Search articles"
        showCategoryFilters={effectiveHeader.showFilters}
        categoryOptions={CATEGORY_FILTER_OPTIONS}
        activeCategory={category}
        onCategoryChange={(val) => setCategory(val as CategoryFilter)}
        categoryGroupAriaLabel="Filter articles"
        sortValue={sortBy}
        onSortChange={(val) => setSortBy(val as ArticleSortMode)}
        sortOptions={SORT_OPTIONS}
        sortAriaLabel="Sort articles"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewOptions={VIEW_OPTIONS}
        statusText={statusText}
        hasActiveFilters={hasActiveFilters && filtered.length > 0}
        onResetFilters={resetFilters}
      />

      <div className="pocms-inner-main">
        <div className="container-xxl px-4 px-lg-5">
          {filtered.length === 0 ? (
            <div className="service-item rounded-4 p-5 text-center">
              <p className="mb-3">No articles match your search or selected filter.</p>
              <button
                type="button"
                className="pocms-pill-btn is-active"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>
          ) : viewMode === 'magazine' ? (
            <div data-archive-view="magazine">
              {spotlightArticle && (
                <section aria-label="Featured spotlight">
                  <div className="pocms-section-kicker">
                    <p className="pocms-section-kicker__title">Featured Lead</p>
                  </div>
                  <MagazineSpotlightCard
                    article={spotlightArticle}
                    featuredBadgeLabel={labels.featuredBadgeLabel}
                    readOnSiteLabel={labels.readOnSiteLabel}
                  />
                </section>
              )}

              <div className="row g-4 align-items-start">
                <div className="col-lg-8">
                  <div className="pocms-section-kicker">
                    <p className="pocms-section-kicker__title">
                      {hasActiveFilters ? 'Filtered Results' : 'Engineering Stream'}
                    </p>
                  </div>
                  <div className="pocms-stream-list">
                    {streamArticles.map((article) => (
                      <EditorialStreamRow
                        key={article.id}
                        article={article}
                        featuredBadgeLabel={labels.featuredBadgeLabel}
                        readOnSiteLabel={labels.readOnSiteLabel}
                      />
                    ))}
                  </div>
                </div>

                <aside className="col-lg-4" aria-label="Editorial highlights">
                  <div className="pocms-editorial-rail">
                    {featuredReads.length > 0 && (
                      <div className="pocms-rail-card">
                        <h2 className="pocms-rail-card__heading">Essential Reads</h2>
                        <ol className="pocms-rail-ranked">
                          {featuredReads.map((item, idx) => {
                            const href = item.pagePath ?? (item.link || '#')
                            const internal = href.startsWith('/')
                            return (
                              <li key={item.id} className="pocms-rail-ranked__item">
                                <span className="pocms-rail-ranked__num">
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <div>
                                  <Link
                                    href={href}
                                    {...(internal
                                      ? {}
                                      : { target: '_blank', rel: 'noopener noreferrer' })}
                                    className="pocms-rail-ranked__link"
                                  >
                                    {item.title}
                                  </Link>
                                  <div className="small text-white-50 mt-1">
                                    {item.readTime} read
                                  </div>
                                </div>
                              </li>
                            )
                          })}
                        </ol>
                      </div>
                    )}

                    <div className="pocms-rail-card">
                      <h2 className="pocms-rail-card__heading">Browse Format</h2>
                      <div className="d-flex flex-column gap-2">
                        <button
                          type="button"
                          className="pocms-utility-btn justify-content-between w-100"
                          onClick={() => setCategory('on-site')}
                        >
                          <span>Full On-Site Guides</span>
                          <strong>{onSiteCount}</strong>
                        </button>
                        <button
                          type="button"
                          className="pocms-utility-btn justify-content-between w-100"
                          onClick={() => setCategory('all')}
                        >
                          <span>Complete Archive</span>
                          <strong>{articles.length}</strong>
                        </button>
                        {effectiveHeader.showRssLink && (
                          <a
                            href="/feed.xml"
                            className="pocms-utility-btn justify-content-between w-100"
                          >
                            <span>RSS 2.0 Feed</span>
                            <span>/feed.xml ↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            <div
              className="pocms-stream-list mx-auto"
              style={{ maxWidth: '940px' }}
              data-archive-view="list"
            >
              {filtered.map((article) => (
                <EditorialStreamRow
                  key={article.id}
                  article={article}
                  featuredBadgeLabel={labels.featuredBadgeLabel}
                  readOnSiteLabel={labels.readOnSiteLabel}
                />
              ))}
            </div>
          ) : (
            <div className="row gy-3 gx-4 align-items-stretch" data-archive-view="grid">
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
      </div>
    </div>
  )
}

function MagazineSpotlightCard({
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
    <div
      className="pocms-featured-hero"
      data-featured={article.featured ? 'true' : undefined}
    >
      <Link
        href={primaryHref}
        {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        className="pocms-featured-hero__media text-decoration-none"
      >
        <CoverImage
          src={article.imageUrl}
          alt={article.title}
          fallbackSrc="/placeholder.svg"
          sizes="(max-width: 992px) 100vw, 55vw"
          width={680}
          height={420}
          className="img-fluid"
        />
      </Link>

      <div className="pocms-featured-hero__body">
        <div className="d-flex flex-wrap align-items-center gap-2">
          {article.featured && <span className="pocms-eyebrow">{featuredBadgeLabel}</span>}
          <span className="pocms-badge-subtle">
            {article.pagePath ? 'Full On-Site Article' : 'External Note'}
          </span>
        </div>

        <h2 className="pocms-featured-hero__title">
          <Link
            href={primaryHref}
            {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {article.title}
          </Link>
        </h2>

        <p className="pocms-featured-hero__excerpt">{article.excerpt}</p>

        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-auto">
          <span className="small text-white-50">
            {article.author} • {article.readTime} read
          </span>
          <div className="d-flex flex-wrap gap-2">
            {article.pagePath ? (
              <Link href={article.pagePath} className="pocms-btn-gold">
                {readOnSiteLabel} →
              </Link>
            ) : article.link ? (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="pocms-btn-gold"
              >
                Read external ↗
              </a>
            ) : null}
            {article.link && article.pagePath && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="pocms-btn-ghost"
              >
                External ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditorialStreamRow({
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
    <div
      className={`pocms-stream-item${article.imageUrl ? ' pocms-stream-item--with-thumb' : ''}`}
      data-featured={article.featured ? 'true' : undefined}
    >
      <div>
        <div className="pocms-stream-item__meta">
          {article.featured && (
            <span className="featured-badge">{featuredBadgeLabel}</span>
          )}
          <span>{article.author}</span>
          <span aria-hidden="true">•</span>
          <span>{article.readTime} read</span>
          <span aria-hidden="true">•</span>
          <span>{article.pagePath ? 'On-site guide' : 'External publication'}</span>
        </div>

        <h2 className="pocms-stream-item__title">
          <Link
            href={primaryHref}
            {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {article.title}
          </Link>
        </h2>

        <p className="pocms-stream-item__excerpt">{article.excerpt}</p>

        <div className="d-flex flex-wrap gap-3 align-items-center">
          {article.pagePath ? (
            <Link href={article.pagePath} className="small fw-semibold">
              {readOnSiteLabel} →
            </Link>
          ) : article.link ? (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="small fw-semibold"
            >
              Read external ↗
            </a>
          ) : null}
          {article.link && article.pagePath && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="small text-white-50"
            >
              External ↗
            </a>
          )}
        </div>
      </div>

      {article.imageUrl && (
        <Link
          href={primaryHref}
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="pocms-stream-item__thumb"
        >
          <CoverImage
            src={article.imageUrl}
            alt={article.title}
            fallbackSrc="/placeholder.svg"
            sizes="200px"
            width={240}
            height={150}
            className="img-fluid"
          />
        </Link>
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
