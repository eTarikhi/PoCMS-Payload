'use client'

import { useRef } from 'react'
import type { ProjectsContent } from '../../lib/types'
import { WorkGrid } from './WorkGrid'
import { useArchiveQuery } from './useArchiveQuery'

export function ProjectsIndex({ projects }: { projects: ProjectsContent }) {
  const { query, setQuery, category, setCategory, resetFilters } = useArchiveQuery()
  const filter = projects.filters.some((item) => item.value === category) ? category : '*'
  const inputRef = useRef<HTMLInputElement>(null)
  const search = query.trim().toLocaleLowerCase()
  const matches = projects.items.filter((item) =>
    `${item.title} ${item.categories.map((category) => projects.filters.find((filter) => filter.value === category)?.label || category).join(' ')}`
      .toLocaleLowerCase()
      .includes(search),
  )
  return (
    <>
      <div className="studio-search">
        <label htmlFor="project-search">Search projects</label>
        <div>
          <input
            id="project-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects or capabilities…"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
            >
              Clear search
            </button>
          ) : null}
        </div>
      </div>
      {query || filter !== '*' ? (
        <button
          type="button"
          className="studio-reset-filters"
          onClick={() => {
            resetFilters()
            inputRef.current?.focus()
          }}
        >
          Reset all filters
        </button>
      ) : null}
      <WorkGrid
        projects={{ ...projects, items: matches }}
        initialLimit={null}
        filter={filter}
        onFilterChange={setCategory}
        emptyMessage={
          search
            ? 'No projects match this search and category. Try another search or clear your filters.'
            : 'No projects in this category yet. Try another filter.'
        }
      />
    </>
  )
}
