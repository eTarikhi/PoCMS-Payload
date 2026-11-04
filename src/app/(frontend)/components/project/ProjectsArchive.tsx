'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { DEFAULT_HEADER_STUDIO, DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type {
  ProjectItem,
  ProjectsArchiveHeaderConfig,
  ProjectsArchiveLayoutMode,
  SiteSettingsContent,
} from '@/app/(frontend)/lib/types'
import { ArchiveHubHeader } from '../headers/ArchiveHubHeader'
import { CoverImage } from '../ui/CoverImage'

type CategoryFilter = '*' | 'front-end' | 'back-end' | 'cms-crm' | 'case-study'
type ProjectSortMode = 'default' | 'case-studies' | 'year-desc' | 'title'

const CATEGORY_LABELS: Record<string, string> = {
  'front-end': 'Front-End',
  'back-end': 'Back-End',
  'cms-crm': 'CMS-CRM',
}

const SORT_OPTIONS: Array<{ label: string; value: ProjectSortMode }> = [
  { label: 'Sort: Curated order', value: 'default' },
  { label: 'Sort: Case studies first', value: 'case-studies' },
  { label: 'Sort: Newest year', value: 'year-desc' },
  { label: 'Sort: Title (A–Z)', value: 'title' },
]

const VIEW_OPTIONS: Array<{ label: string; value: ProjectsArchiveLayoutMode }> = [
  { label: 'Showcase', value: 'showcase' },
  { label: 'Index', value: 'list' },
  { label: 'Grid', value: 'grid' },
]

export type ProjectsArchiveProps = {
  projects: ProjectItem[]
  labels?: SiteSettingsContent['projectsSection']
  headerConfig?: ProjectsArchiveHeaderConfig
  initialQuery?: string
  initialCategory?: string
  initialTech?: string
  initialSort?: string
  initialView?: ProjectsArchiveLayoutMode
}

export function ProjectsArchive({
  projects,
  labels = DEFAULT_SITE_SETTINGS.projectsSection,
  headerConfig,
  initialQuery = '',
  initialCategory = '*',
  initialTech = '*',
  initialSort = 'default',
  initialView,
}: ProjectsArchiveProps) {
  const effectiveHeader = headerConfig ?? DEFAULT_HEADER_STUDIO.projectsArchive

  const validInitialCategory: CategoryFilter =
    initialCategory === 'front-end' ||
    initialCategory === 'back-end' ||
    initialCategory === 'cms-crm' ||
    initialCategory === 'case-study'
      ? initialCategory
      : '*'

  const validInitialSort: ProjectSortMode =
    initialSort === 'case-studies' || initialSort === 'year-desc' || initialSort === 'title'
      ? initialSort
      : 'default'

  const resolvedDefaultView: ProjectsArchiveLayoutMode =
    initialView ?? (headerConfig ? headerConfig.defaultLayout : 'grid')

  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<CategoryFilter>(validInitialCategory)
  const [tech, setTech] = useState<string>(initialTech || '*')
  const [sortBy, setSortBy] = useState<ProjectSortMode>(validInitialSort)
  const [viewMode, setViewMode] = useState<ProjectsArchiveLayoutMode>(resolvedDefaultView)

  // Keep URL query parameters synced for deep-linking (e.g. /projects?tech=Payload+CMS)
  useEffect(() => {
    if (typeof window === 'undefined' || !headerConfig) return
    const params = new URLSearchParams(window.location.search)
    if (query.trim()) params.set('q', query.trim())
    else params.delete('q')

    if (category !== '*') params.set('category', category)
    else params.delete('category')

    if (tech && tech !== '*') params.set('tech', tech)
    else params.delete('tech')

    if (sortBy !== 'default') params.set('sort', sortBy)
    else params.delete('sort')

    if (viewMode !== effectiveHeader.defaultLayout) params.set('view', viewMode)
    else params.delete('view')

    const qs = params.toString()
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [category, effectiveHeader.defaultLayout, headerConfig, query, sortBy, tech, viewMode])

  const categoryOptions: Array<{ label: string; value: CategoryFilter }> = useMemo(
    () => [
      { label: labels.allFilterLabel || 'All Projects', value: '*' },
      { label: 'Front-End', value: 'front-end' },
      { label: 'Back-End', value: 'back-end' },
      { label: 'CMS-CRM', value: 'cms-crm' },
      { label: 'Case studies', value: 'case-study' },
    ],
    [labels.allFilterLabel],
  )

  const availableTech = useMemo(() => {
    const seen = new Map<string, string>()
    for (const project of projects) {
      for (const item of project.techStack ?? []) {
        const clean = item.trim()
        const key = clean.toLowerCase()
        if (clean && !seen.has(key)) {
          seen.set(key, clean)
        }
      }
    }
    return Array.from(seen.values())
  }, [projects])

  const caseStudyCount = useMemo(
    () => projects.filter((p) => Boolean(p.pagePath)).length,
    [projects],
  )

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const normalizedTech = tech === '*' ? '' : tech.trim().toLowerCase()

    const matches = projects.filter((project) => {
      if (category === 'case-study') {
        if (!project.pagePath) return false
      } else if (category !== '*' && !project.categories.includes(category)) {
        return false
      }

      if (normalizedTech) {
        const projectTechs = (project.techStack ?? []).map((t) => t.toLowerCase())
        if (!projectTechs.includes(normalizedTech)) return false
      }

      if (!normalizedQuery) return true

      const haystack = [
        project.title,
        project.excerpt ?? '',
        project.role ?? '',
        project.year ?? '',
        ...project.categories.map((cat) => CATEGORY_LABELS[cat] ?? cat),
        ...(project.techStack ?? []),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })

    const copy = [...matches]
    if (sortBy === 'case-studies') {
      copy.sort((a, b) => Number(Boolean(b.pagePath)) - Number(Boolean(a.pagePath)))
    } else if (sortBy === 'year-desc') {
      copy.sort((a, b) => (b.year ?? '').localeCompare(a.year ?? ''))
    } else if (sortBy === 'title') {
      copy.sort((a, b) => a.title.localeCompare(b.title))
    }
    return copy
  }, [projects, category, tech, query, sortBy])

  const hasActiveFilters = Boolean(query.trim()) || category !== '*' || (tech !== '*' && Boolean(tech))
  const resetFilters = () => {
    setQuery('')
    setCategory('*')
    setTech('*')
    setSortBy('default')
  }

  const statusText = `Showing ${filtered.length} of ${projects.length} ${
    projects.length === 1 ? 'project' : 'projects'
  }`

  const resolvedHeading = effectiveHeader.headingOverride || labels.heading
  const resolvedSubtitle = effectiveHeader.subtitleOverride ?? labels.archiveDescription

  const showcaseCaseStudies = useMemo(
    () => (viewMode === 'showcase' ? filtered.filter((p) => Boolean(p.pagePath)) : []),
    [filtered, viewMode],
  )
  const showcaseBuilds = useMemo(
    () =>
      viewMode === 'showcase' && showcaseCaseStudies.length > 0
        ? filtered.filter((p) => !p.pagePath)
        : filtered,
    [filtered, showcaseCaseStudies.length, viewMode],
  )

  return (
    <div className="pocms-subpage-shell articles-hub projects-hub">
      <ArchiveHubHeader
        hubName="Projects"
        siblingLink={{ label: 'Articles', href: '/articles' }}
        eyebrow={effectiveHeader.eyebrow}
        heading={resolvedHeading}
        subtitle={resolvedSubtitle}
        backgroundPreset={effectiveHeader.backgroundPreset}
        accentTone={effectiveHeader.accentTone}
        showStatsBar={effectiveHeader.showStatsBar}
        stats={[
          { value: projects.length, label: projects.length === 1 ? 'Build' : 'Builds' },
          { value: caseStudyCount, label: caseStudyCount === 1 ? 'Case Study' : 'Case Studies' },
          ...(availableTech.length > 0
            ? [{ value: availableTech.length, label: 'Technologies' }]
            : []),
        ]}
        showSearch={effectiveHeader.showSearch}
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder={labels.searchPlaceholder}
        searchAriaLabel="Search projects"
        showCategoryFilters={effectiveHeader.showCategoryFilters}
        categoryOptions={categoryOptions}
        activeCategory={category}
        onCategoryChange={(val) => setCategory(val as CategoryFilter)}
        categoryGroupAriaLabel="Filter projects by category"
        showTechFilters={effectiveHeader.showTechFilters}
        techOptions={availableTech}
        activeTech={tech === '*' ? null : tech}
        onTechToggle={(techName) =>
          setTech((prev) => (prev.toLowerCase() === techName.toLowerCase() ? '*' : techName))
        }
        onTechClear={() => setTech('*')}
        sortValue={sortBy}
        onSortChange={(val) => setSortBy(val as ProjectSortMode)}
        sortOptions={SORT_OPTIONS}
        sortAriaLabel="Sort projects"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewOptions={VIEW_OPTIONS}
        statusText={statusText}
        hasActiveFilters={hasActiveFilters && filtered.length > 0}
        onResetFilters={resetFilters}
      />

      <div className="pocms-inner-main">
        <div className="pocms-hub-container">
          {filtered.length === 0 ? (
            <div className="service-item rounded-4 p-5 text-center">
              <p className="mb-3">No projects match your search or selected filters.</p>
              <button
                type="button"
                className="pocms-pill-btn is-active"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>
          ) : viewMode === 'showcase' ? (
            <div data-archive-view="showcase">
              {showcaseCaseStudies.length > 0 && (
                <section className="mb-5" aria-label="Featured engineering case studies">
                  <div className="pocms-section-kicker">
                    <p className="pocms-section-kicker__title">Engineering Case Studies</p>
                  </div>
                  <div className="row g-4 align-items-stretch">
                    {showcaseCaseStudies.map((project) => (
                      <div key={project.id} className="col-lg-6">
                        <ShowcaseCaseStudyCard
                          project={project}
                          caseStudyLabel={labels.caseStudyLabel}
                          liveProjectLabel={labels.liveProjectLabel}
                          onSelectTech={(selected) => setTech(selected)}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {showcaseBuilds.length > 0 && (
                <section aria-label="Portfolio builds">
                  {showcaseCaseStudies.length > 0 && (
                    <div className="pocms-section-kicker">
                      <p className="pocms-section-kicker__title">Selected Portfolio & Builds</p>
                    </div>
                  )}
                  <div className="row g-4 align-items-stretch">
                    {showcaseBuilds.map((project) => (
                      <ArchiveProjectCard
                        key={project.id}
                        project={project}
                        caseStudyLabel={labels.caseStudyLabel}
                        liveProjectLabel={labels.liveProjectLabel}
                        onSelectTech={(selected) => setTech(selected)}
                        panOnHover
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="pocms-index-table" data-archive-view="list">
              {filtered.map((project) => (
                <ArchitecturalIndexRow
                  key={project.id}
                  project={project}
                  caseStudyLabel={labels.caseStudyLabel}
                  liveProjectLabel={labels.liveProjectLabel}
                  onSelectTech={(selected) => setTech(selected)}
                />
              ))}
            </div>
          ) : (
            <div className="row g-4 align-items-stretch" data-archive-view="grid">
              {filtered.map((project) => (
                <ArchiveProjectCard
                  key={project.id}
                  project={project}
                  caseStudyLabel={labels.caseStudyLabel}
                  liveProjectLabel={labels.liveProjectLabel}
                  onSelectTech={(selected) => setTech(selected)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShowcaseCaseStudyCard({
  project,
  caseStudyLabel,
  liveProjectLabel,
  onSelectTech,
}: {
  project: ProjectItem
  caseStudyLabel: string
  liveProjectLabel: string
  onSelectTech: (tech: string) => void
}) {
  const hasExternalUrl =
    Boolean(project.url) && project.url !== '#' && !project.url.startsWith('/projects/')
  const primaryHref = project.pagePath ?? (project.url || '#')
  const isInternal = primaryHref.startsWith('/')
  const coverSrc = project.imageUrl || project.thumbnailUrl
  const hasMedia = project.mediaMode !== 'none' && Boolean(coverSrc)
  const metaParts = [
    project.role,
    project.year,
    project.readTime ? `${project.readTime} read` : null,
  ].filter((part): part is string => Boolean(part))

  return (
    <div className="pocms-showcase-card pocms-showcase-card--pan-preview" data-case-study="true">
      {hasMedia ? (
        <Link
          href={primaryHref}
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="pocms-showcase-card__media text-decoration-none position-relative"
        >
          <CoverImage
            src={coverSrc}
            alt={project.title}
            blurDataURL={project.blurDataURL}
            fallbackSrc="/placeholder.svg"
            sizes="(max-width: 992px) 100vw, 50vw"
            width={800}
            height={520}
            className="img-fluid"
          />
        </Link>
      ) : null}

      <div className="pocms-showcase-card__body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <span className="pocms-eyebrow">{caseStudyLabel}</span>
          {project.categories.map((cat) => (
            <span key={cat} className="pocms-badge-subtle">
              {CATEGORY_LABELS[cat] ?? cat}
            </span>
          ))}
        </div>

        <h2 className="pocms-card-title">
          <Link
            href={primaryHref}
            {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {project.title}
          </Link>
        </h2>

        {project.excerpt && (
          <p className="pocms-card-excerpt">{project.excerpt}</p>
        )}

        <div className="mt-auto pt-2">
          {project.techStack && project.techStack.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-3">
              {project.techStack.map((techName) => (
                <button
                  key={techName}
                  type="button"
                  className="pocms-tech-chip"
                  onClick={() => onSelectTech(techName)}
                  title={`Filter by ${techName}`}
                >
                  {techName}
                </button>
              ))}
            </div>
          )}

          <div className="pocms-card-footer mt-0">
            <span className="small text-white-50">{metaParts.join(' • ')}</span>
            <div className="d-flex flex-wrap gap-2">
              {project.pagePath && (
                <Link href={project.pagePath} className="pocms-btn-gold">
                  {caseStudyLabel} →
                </Link>
              )}
              {hasExternalUrl && (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pocms-btn-ghost"
                >
                  {liveProjectLabel} ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ArchitecturalIndexRow({
  project,
  caseStudyLabel,
  liveProjectLabel,
  onSelectTech,
}: {
  project: ProjectItem
  caseStudyLabel: string
  liveProjectLabel: string
  onSelectTech: (tech: string) => void
}) {
  const hasExternalUrl =
    Boolean(project.url) && project.url !== '#' && !project.url.startsWith('/projects/')
  const primaryHref = project.pagePath ?? (project.url || '#')
  const isInternal = primaryHref.startsWith('/')

  return (
    <div
      className="pocms-index-row"
      data-case-study={project.pagePath ? 'true' : undefined}
    >
      <div className="small fw-bold" style={{ color: 'var(--pocms-amber)' }}>
        {project.year || '—'}
      </div>

      <div>
        <Link
          href={primaryHref}
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="fw-bold text-white text-decoration-none d-inline-block"
        >
          {project.title}
        </Link>
        {project.excerpt && (
          <p className="small text-white-50 mb-0 mt-1">{project.excerpt}</p>
        )}
      </div>

      <div className="small text-white-50">
        {project.role && <div className="text-white">{project.role}</div>}
        <div>
          {project.categories.map((cat) => CATEGORY_LABELS[cat] ?? cat).join(' · ')}
        </div>
      </div>

      <div className="d-flex flex-wrap gap-1">
        {(project.techStack ?? []).slice(0, 4).map((techName) => (
          <button
            key={techName}
            type="button"
            className="pocms-tech-chip"
            onClick={() => onSelectTech(techName)}
          >
            {techName}
          </button>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2 justify-content-lg-end">
        {project.pagePath && (
          <Link href={project.pagePath} className="pocms-utility-btn">
            {caseStudyLabel} →
          </Link>
        )}
        {hasExternalUrl && (
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pocms-utility-btn"
          >
            {liveProjectLabel} ↗
          </a>
        )}
      </div>
    </div>
  )
}

function ArchiveProjectCard({
  project,
  caseStudyLabel,
  liveProjectLabel,
  onSelectTech,
  panOnHover = false,
}: {
  project: ProjectItem
  caseStudyLabel: string
  liveProjectLabel: string
  onSelectTech: (tech: string) => void
  panOnHover?: boolean
}) {
  const hasExternalUrl =
    Boolean(project.url) && project.url !== '#' && !project.url.startsWith('/projects/')
  const primaryHref = project.pagePath ?? (project.url || '#')
  const isInternal = primaryHref.startsWith('/')
  const coverSrc = panOnHover
    ? project.imageUrl || project.thumbnailUrl
    : project.thumbnailUrl || project.imageUrl
  const hasMedia = project.mediaMode !== 'none' && Boolean(coverSrc)
  const metaParts = [
    project.role,
    project.year,
    project.readTime ? `${project.readTime} read` : null,
  ].filter((part): part is string => Boolean(part))

  return (
    <article
      className="col-lg-4 col-md-6"
      data-case-study={project.pagePath ? 'true' : undefined}
    >
      <div
        className={`pocms-showcase-card pocms-showcase-card--grid${
          panOnHover ? ' pocms-showcase-card--pan-preview' : ''
        }`}
      >
        {hasMedia ? (
          <Link
            href={primaryHref}
            {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            className="pocms-showcase-card__media text-decoration-none position-relative"
          >
            <CoverImage
              src={coverSrc}
              alt={project.title}
              blurDataURL={project.blurDataURL}
              fallbackSrc="/placeholder.svg"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              width={560}
              height={350}
              className="img-fluid"
            />
          </Link>
        ) : null}

        <div className="pocms-showcase-card__body">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
            {project.pagePath ? (
              <span className="pocms-eyebrow">{caseStudyLabel}</span>
            ) : null}
            {project.categories.map((cat) => (
              <span key={cat} className="pocms-badge-subtle">
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
          </div>

          <h2 className="pocms-card-title">
            <Link
              href={primaryHref}
              {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            >
              {project.title}
            </Link>
          </h2>

          {project.excerpt ? <p className="pocms-card-excerpt">{project.excerpt}</p> : null}

          <div className="mt-auto pt-1">
            {project.techStack && project.techStack.length > 0 ? (
              <div className="d-flex flex-wrap gap-1 mb-3">
                {project.techStack.map((techName) => (
                  <button
                    key={techName}
                    type="button"
                    className="pocms-tech-chip"
                    onClick={() => onSelectTech(techName)}
                    title={`Filter by ${techName}`}
                  >
                    {techName}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="pocms-card-footer mt-0">
              {metaParts.length > 0 ? (
                <span className="small text-white-50">{metaParts.join(' • ')}</span>
              ) : (
                <span />
              )}

              <div className="d-flex flex-wrap gap-2">
                {project.pagePath ? (
                  <Link href={project.pagePath} className="pocms-btn-gold pocms-btn-sm">
                    {caseStudyLabel} →
                  </Link>
                ) : null}
                {hasExternalUrl ? (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pocms-btn-ghost pocms-btn-sm"
                  >
                    {liveProjectLabel} ↗
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
