'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ProjectItem, SiteSettingsContent } from '@/app/(frontend)/lib/types'
import { CoverImage } from '../ui/CoverImage'

type CategoryFilter = '*' | 'front-end' | 'back-end' | 'cms-crm' | 'case-study'

const CATEGORY_LABELS: Record<string, string> = {
  'front-end': 'Front-End',
  'back-end': 'Back-End',
  'cms-crm': 'CMS-CRM',
}

export type ProjectsArchiveProps = {
  projects: ProjectItem[]
  labels?: SiteSettingsContent['projectsSection']
  initialQuery?: string
  initialCategory?: string
  initialTech?: string
}

export function ProjectsArchive({
  projects,
  labels = DEFAULT_SITE_SETTINGS.projectsSection,
  initialQuery = '',
  initialCategory = '*',
  initialTech = '*',
}: ProjectsArchiveProps) {
  const validInitialCategory: CategoryFilter =
    initialCategory === 'front-end' ||
    initialCategory === 'back-end' ||
    initialCategory === 'cms-crm' ||
    initialCategory === 'case-study'
      ? initialCategory
      : '*'

  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<CategoryFilter>(validInitialCategory)
  const [tech, setTech] = useState<string>(initialTech || '*')

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

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const normalizedTech = tech === '*' ? '' : tech.trim().toLowerCase()

    return projects.filter((project) => {
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
  }, [projects, category, tech, query])

  return (
    <div className="articles-hub projects-hub">
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
          aria-label="Search projects"
        />
        <div
          className="articles-hub-filters"
          role="group"
          aria-label="Filter projects by category"
        >
          {categoryOptions.map((option) => (
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

      {availableTech.length > 0 ? (
        <div
          className="projects-tech-filter-row"
          role="group"
          aria-label="Filter projects by technology"
        >
          <span className="projects-tech-filter-label">Tech:</span>
          <button
            type="button"
            className={`articles-filter-btn ${tech === '*' ? 'active' : ''}`}
            aria-pressed={tech === '*'}
            onClick={() => setTech('*')}
          >
            All tech
          </button>
          {availableTech.map((techName) => {
            const active = tech.toLowerCase() === techName.toLowerCase()
            return (
              <button
                key={techName}
                type="button"
                className={`articles-filter-btn ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => setTech(active ? '*' : techName)}
              >
                {techName}
              </button>
            )
          })}
        </div>
      ) : null}

      <p className="articles-hub-count" aria-live="polite">
        Showing {filtered.length} of {projects.length}{' '}
        {projects.length === 1 ? 'project' : 'projects'}
      </p>

      {filtered.length === 0 ? (
        <div className="service-item rounded p-4 text-center">
          <p className="mb-3">No projects match your search or selected filters.</p>
          <button
            type="button"
            className="articles-filter-btn active"
            onClick={() => {
              setQuery('')
              setCategory('*')
              setTech('*')
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="row gy-1 gx-4 align-items-stretch">
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
  )
}

function ArchiveProjectCard({
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
  const coverSrc = project.thumbnailUrl || project.imageUrl
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
      <div className="service-item rounded h-100 p-1 my-2 d-flex flex-column">
        <Link
          href={primaryHref}
          {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="text-decoration-none"
        >
          <div className="rounded overflow-hidden">
            <CoverImage
              src={coverSrc}
              alt={project.title}
              fallbackSrc="/placeholder.svg"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              width={400}
              height={255}
              className="img-fluid"
            />
          </div>
          <div className="p-2">
            <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
              {project.pagePath ? (
                <span className="featured-badge">{caseStudyLabel}</span>
              ) : null}
              {project.categories.map((cat) => (
                <span key={cat} className="project-tech-pill">
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
            <h2 className="h5 my-2 article-title text-white">{project.title}</h2>
            {project.excerpt ? <p className="article-text">{project.excerpt}</p> : null}
          </div>
        </Link>

        <div className="px-4 pb-4 mt-auto">
          {project.techStack && project.techStack.length > 0 ? (
            <div className="d-flex flex-wrap gap-1 mb-2">
              {project.techStack.map((techName) => (
                <button
                  key={techName}
                  type="button"
                  className="project-tech-pill border-0 bg-transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectTech(techName)}
                  title={`Filter by ${techName}`}
                >
                  {techName}
                </button>
              ))}
            </div>
          ) : null}

          {metaParts.length > 0 ? (
            <p className="text-xs text-muted-foreground mb-1">{metaParts.join(' • ')}</p>
          ) : null}

          <div className="d-flex flex-wrap gap-3">
            {project.pagePath ? (
              <Link href={project.pagePath} className="small">
                {caseStudyLabel} →
              </Link>
            ) : null}
            {hasExternalUrl ? (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="small"
              >
                {liveProjectLabel} ↗
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
