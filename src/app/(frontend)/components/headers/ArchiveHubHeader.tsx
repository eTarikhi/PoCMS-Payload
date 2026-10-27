'use client'

import Link from 'next/link'
import { useEffect, useRef, type PointerEvent } from 'react'

import type { HeaderAccentTone, HeaderBackgroundPreset } from '@/app/(frontend)/lib/types'

import { HeaderBackground } from './HeaderBackground'

export type HubFilterOption = {
  value: string
  label: string
}

export type HubStatPill = {
  value: number | string
  label: string
}

export type HubViewOption<T extends string = string> = {
  value: T
  label: string
}

export type ArchiveHubHeaderProps<TView extends string = string> = {
  hubName: string
  siblingLink?: { label: string; href: string }
  eyebrow: string
  heading: string
  subtitle?: string | null
  backgroundPreset: HeaderBackgroundPreset
  accentTone: HeaderAccentTone
  showStatsBar?: boolean
  stats?: HubStatPill[]
  showRssLink?: boolean
  showSearch?: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  searchAriaLabel: string
  showCategoryFilters?: boolean
  categoryOptions?: HubFilterOption[]
  activeCategory?: string
  onCategoryChange?: (value: string) => void
  categoryGroupAriaLabel?: string
  showTechFilters?: boolean
  techOptions?: string[]
  activeTech?: string | null
  onTechToggle?: (tech: string) => void
  onTechClear?: () => void
  sortValue?: string
  onSortChange?: (value: string) => void
  sortOptions?: HubFilterOption[]
  sortAriaLabel?: string
  viewMode: TView
  onViewModeChange: (view: TView) => void
  viewOptions: HubViewOption<TView>[]
  statusText: string
  hasActiveFilters: boolean
  onResetFilters: () => void
  backToHomeLabel?: string
}

export function ArchiveHubHeader<TView extends string = string>({
  hubName,
  siblingLink,
  eyebrow,
  heading,
  subtitle,
  backgroundPreset,
  accentTone,
  showStatsBar = true,
  stats = [],
  showRssLink = false,
  showSearch = true,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  showCategoryFilters = true,
  categoryOptions = [],
  activeCategory,
  onCategoryChange,
  categoryGroupAriaLabel = 'Filter items',
  showTechFilters = false,
  techOptions = [],
  activeTech = null,
  onTechToggle,
  onTechClear,
  sortValue,
  onSortChange,
  sortOptions = [],
  sortAriaLabel = 'Sort items',
  viewMode,
  onViewModeChange,
  viewOptions,
  statusText,
  hasActiveFilters,
  onResetFilters,
  backToHomeLabel = 'Home',
}: ArchiveHubHeaderProps<TView>) {
  const stageRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!showSearch) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return
      }
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSearch])

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 100)
    el.style.setProperty('--spot-x', `${x}%`)
    el.style.setProperty('--spot-y', `${y}%`)
  }

  return (
    <header
      ref={stageRef}
      className="pocms-header-stage"
      data-header-type="archive"
      data-accent-tone={accentTone}
      onPointerMove={handlePointerMove}
    >
      <HeaderBackground preset={backgroundPreset} />

      <div className="container-xxl px-4 px-lg-5 pocms-header-stage__inner">
        <div className="pocms-topbar">
          <nav aria-label="Breadcrumb">
            <ol className="pocms-breadcrumbs">
              <li>
                <Link href="/">← {backToHomeLabel}</Link>
              </li>
              <li className="pocms-breadcrumbs__sep" aria-hidden="true">
                /
              </li>
              <li className="pocms-breadcrumbs__current" aria-current="page">
                {hubName}
              </li>
            </ol>
          </nav>

          <div className="pocms-topbar__actions">
            {showStatsBar &&
              stats.map((stat) => (
                <span key={stat.label} className="pocms-telemetry-pill">
                  <strong>{stat.value}</strong> {stat.label}
                </span>
              ))}
            {showRssLink && (
              <a
                href="/feed.xml"
                className="pocms-telemetry-pill"
                title="RSS 2.0 Syndication Feed"
              >
                <span aria-hidden="true">◉</span> RSS
              </a>
            )}
            {siblingLink && (
              <Link href={siblingLink.href} className="pocms-utility-btn">
                {siblingLink.label} →
              </Link>
            )}
          </div>
        </div>

        <div className="pocms-stage-copy">
          {eyebrow && (
            <div className="pocms-eyebrow-row">
              <span className="pocms-eyebrow">{eyebrow}</span>
            </div>
          )}
          <h1 className="pocms-stage-title">{heading}</h1>
          {subtitle && <p className="pocms-stage-subtitle">{subtitle}</p>}
        </div>

        <div className="pocms-discovery-dock">
          <div className="pocms-discovery-dock__primary">
            {showSearch && (
              <div className="pocms-search-field">
                <span className="pocms-search-field__icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  ref={searchInputRef}
                  type="search"
                  className="pocms-search-field__input"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchAriaLabel}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="pocms-search-field__clear"
                    onClick={() => onSearchChange('')}
                    aria-label="Clear search query"
                  >
                    ×
                  </button>
                ) : (
                  <kbd className="pocms-search-field__kbd" aria-hidden="true">
                    /
                  </kbd>
                )}
              </div>
            )}

            {showCategoryFilters && categoryOptions.length > 0 && onCategoryChange && (
              <div
                className="pocms-filter-pills"
                role="group"
                aria-label={categoryGroupAriaLabel}
              >
                {categoryOptions.map((opt) => {
                  const active = activeCategory === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`pocms-pill-btn${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => onCategoryChange(opt.value)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="pocms-dock-controls">
              {sortOptions.length > 0 && onSortChange && (
                <select
                  className="pocms-sort-select"
                  value={sortValue}
                  onChange={(e) => onSortChange(e.target.value)}
                  aria-label={sortAriaLabel}
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {viewOptions.length > 1 && (
                <div className="pocms-view-switcher" role="group" aria-label="Layout view">
                  {viewOptions.map((opt) => {
                    const active = viewMode === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`pocms-view-switcher__btn${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => onViewModeChange(opt.value)}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="pocms-discovery-dock__secondary">
            {showTechFilters && techOptions.length > 0 && onTechToggle ? (
              <div
                className="pocms-tech-strip"
                role="group"
                aria-label="Filter projects by technology"
              >
                {onTechClear && (
                  <button
                    type="button"
                    className={`pocms-tech-chip${!activeTech ? ' is-active' : ''}`}
                    aria-pressed={!activeTech}
                    onClick={onTechClear}
                  >
                    All tech
                  </button>
                )}
                {techOptions.map((tech) => {
                  const active =
                    Boolean(activeTech) &&
                    activeTech!.toLowerCase() === tech.toLowerCase()
                  return (
                    <button
                      key={tech}
                      type="button"
                      className={`pocms-tech-chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => onTechToggle(tech)}
                    >
                      {tech}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div />
            )}

            <div className="pocms-results-status">
              <span>{statusText}</span>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="pocms-utility-btn"
                  onClick={onResetFilters}
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
