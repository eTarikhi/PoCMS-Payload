'use client'

import { useId, useState } from 'react'
import type { ProjectItem, ProjectsContent } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'
import { ProjectViewer } from './ProjectViewer'

export function WorkGrid({
  projects,
  initialLimit = 6,
  filter: controlledFilter,
  onFilterChange,
  emptyMessage = 'No projects in this category yet. Try another filter.',
}: {
  projects: ProjectsContent
  initialLimit?: number | null
  filter?: string
  onFilterChange?: (value: string) => void
  emptyMessage?: string
}) {
  const gridId = useId()
  const [selected, setSelected] = useState<ProjectItem | null>(null)
  const [localFilter, setFilter] = useState('*')
  const filter = controlledFilter ?? localFilter
  const [expanded, setExpanded] = useState(false)
  const items = projects.items.filter((item) => filter === '*' || item.categories.includes(filter))
  const visible = expanded || initialLimit === null ? items : items.slice(0, initialLimit)
  return (
    <>
      <div className="studio-filters" role="group" aria-label="Filter projects">
        {projects.filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            aria-controls={gridId}
            onClick={() => {
              if (onFilterChange) onFilterChange(item.value)
              else setFilter(item.value)
              setExpanded(false)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className={initialLimit === null ? 'studio-results-count' : 'studio-sr'} role="status">
        {visible.length} projects shown
      </p>
      <div className="studio-work-grid" id={gridId}>
        {visible.map((item, index) => (
          <article className="studio-project" key={item.id}>
            <button
              type="button"
              className="studio-project-image"
              aria-label={`Preview screenshot of ${item.title}`}
              aria-haspopup="dialog"
              onClick={() => setSelected(item)}
            >
              <CoverImage
                src={item.thumbnailUrl || item.imageUrl}
                fallbackSrc="/placeholder.svg"
                alt={item.title}
                width={1000}
                height={700}
                sizes="(max-width: 700px) 100vw, 50vw"
              />
              <span className="studio-preview-hint" aria-hidden="true">
                Preview screenshot ⤢
              </span>
            </button>
            <div className="studio-project-meta">
              <span>
                {String(index + 1).padStart(2, '0')} /{' '}
                {item.categories
                  .map(
                    (category) =>
                      projects.filters.find((entry) => entry.value === category)?.label ?? category,
                  )
                  .join(' · ')}
              </span>
              <span aria-hidden="true">↗</span>
            </div>
            <h3>
              {item.url && item.url !== '#' ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                  <span className="studio-sr"> (opens in a new tab)</span>
                </a>
              ) : (
                item.title
              )}
            </h3>
            {item.readMoreUrl ? (
              <a className="studio-text-link" href={item.readMoreUrl}>
                Explore project ↗
              </a>
            ) : null}
          </article>
        ))}
      </div>
      {initialLimit !== null && items.length > initialLimit ? (
        <button
          className="studio-show-work"
          type="button"
          aria-expanded={expanded}
          aria-controls={gridId}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show selected work' : `View all ${items.length} projects`}{' '}
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      ) : null}
      {selected ? <ProjectViewer project={selected} onClose={() => setSelected(null)} /> : null}
      {!items.length ? <p className="studio-empty">{emptyMessage}</p> : null}
    </>
  )
}
