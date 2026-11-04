'use client'

import Link from 'next/link'
import { useRef, useState, type PointerEvent } from 'react'

import type { TocItem } from '@/app/(frontend)/lib/lexical'
import type { HeaderAccentTone, HeaderBackgroundPreset } from '@/app/(frontend)/lib/types'

import { HeaderBackground } from './HeaderBackground'

type ArticleDockProps = {
  variant: 'article'
  ownerName?: string
  publishedAt: string | null
  publishedDisplay: string
  readTimeDisplay: string
  externalUrl?: string | null
  externalLabel?: string
  showSectionJumpDock?: boolean
  toc?: TocItem[]
}

type ProjectDockProps = {
  variant: 'project'
  role: string | null
  client: string | null
  year: string | null
  readTimeDisplay: string
  techStack: string[]
  showSpecDock?: boolean
  showTechLinks?: boolean
  liveUrl?: string | null
  liveLabel?: string
  secondaryUrl?: string | null
  secondaryLabel?: string
}

export type DetailPageHeaderProps = {
  eyebrow: string
  badges?: string[]
  title: string
  excerpt?: string | null
  coverUrl?: string | null
  backgroundPreset: HeaderBackgroundPreset
  accentTone: HeaderAccentTone
  showBreadcrumbs?: boolean
  showShareActions?: boolean
  hubLabel: string
  hubHref: string
  backLabel: string
} & (ArticleDockProps | ProjectDockProps)

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'AT'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function DetailPageHeader(props: DetailPageHeaderProps) {
  const {
    eyebrow,
    badges = [],
    title,
    excerpt,
    coverUrl,
    backgroundPreset,
    accentTone,
    showBreadcrumbs = true,
    showShareActions = true,
    hubLabel,
    hubHref,
    backLabel,
  } = props

  const stageRef = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)

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

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2200)
      }
    } catch {
      // Ignore clipboard permission errors cleanly
    }
  }

  const h2Jumps =
    props.variant === 'article' && props.showSectionJumpDock !== false
      ? (props.toc ?? []).filter((item) => item.level === 2).slice(0, 6)
      : []

  return (
    <header
      ref={stageRef}
      className="pocms-header-stage"
      data-header-type="detail"
      data-detail-variant={props.variant}
      data-accent-tone={accentTone}
      onPointerMove={handlePointerMove}
    >
      <HeaderBackground preset={backgroundPreset} coverUrl={coverUrl} />

      <div className="container-xxl px-4 px-lg-5 pocms-header-stage__inner">
        {(showBreadcrumbs || showShareActions) && (
          <div className="pocms-topbar">
            {showBreadcrumbs ? (
              <nav aria-label="Breadcrumb">
                <ol className="pocms-breadcrumbs">
                  <li>
                    <Link href="/">Home</Link>
                  </li>
                  <li className="pocms-breadcrumbs__sep" aria-hidden="true">
                    /
                  </li>
                  <li>
                    <Link href={hubHref}>{hubLabel}</Link>
                  </li>
                  <li className="pocms-breadcrumbs__sep" aria-hidden="true">
                    /
                  </li>
                  <li className="pocms-breadcrumbs__current" aria-current="page">
                    {title}
                  </li>
                </ol>
              </nav>
            ) : (
              <div />
            )}

            <div className="pocms-topbar__actions">
              <Link href={hubHref} className="pocms-utility-btn">
                {backLabel}
              </Link>
              {showShareActions && (
                <button
                  type="button"
                  className={`pocms-utility-btn${copied ? ' pocms-utility-btn--copied' : ''}`}
                  onClick={handleCopyLink}
                >
                  {copied ? '✓ Link copied' : 'Copy link'}
                </button>
              )}
              {props.variant === 'article' && props.externalUrl && showShareActions && (
                <a
                  href={props.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pocms-utility-btn"
                >
                  {props.externalLabel ?? 'External post'} ↗
                </a>
              )}
            </div>
          </div>
        )}

        <div className="pocms-stage-copy">
          <div className="pocms-eyebrow-row">
            {eyebrow && <span className="pocms-eyebrow">{eyebrow}</span>}
            {badges.map((badge) => (
              <span key={badge} className="pocms-badge-subtle">
                {badge}
              </span>
            ))}
          </div>

          <h1 className="pocms-stage-title">{title}</h1>
          {excerpt && <p className="pocms-stage-subtitle">{excerpt}</p>}
        </div>

        {props.variant === 'article' ? (
          <div className="pocms-detail-dock">
            <div className="pocms-article-meta-bar">
              <div className="pocms-author-cluster">
                {props.ownerName && (
                  <>
                    <span className="pocms-author-avatar" aria-hidden="true">
                      {computeInitials(props.ownerName)}
                    </span>
                    <strong className="text-white">{props.ownerName}</strong>
                    <span className="pocms-meta-dot" aria-hidden="true">
                      ·
                    </span>
                  </>
                )}
                {props.publishedDisplay && (
                  <>
                    {props.publishedAt ? (
                      <time dateTime={props.publishedAt}>{props.publishedDisplay}</time>
                    ) : (
                      <span>{props.publishedDisplay}</span>
                    )}
                    {props.readTimeDisplay && (
                      <span className="pocms-meta-dot" aria-hidden="true">
                        ·
                      </span>
                    )}
                  </>
                )}
                {props.readTimeDisplay && <span>{props.readTimeDisplay} read</span>}
              </div>

              {props.toc && props.toc.length > 0 && (
                <span className="pocms-telemetry-pill">
                  <strong>{props.toc.length}</strong> Sections
                </span>
              )}
            </div>

            {h2Jumps.length > 0 && (
              <div className="pocms-section-jumps" aria-label="Jump to article section">
                <span className="pocms-section-jumps__label">Jump to:</span>
                {h2Jumps.map((item) => (
                  <a key={item.id} href={`#${item.id}`} className="pocms-jump-chip">
                    <span aria-hidden="true">#</span>
                    {item.text}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          (props.showSpecDock !== false ||
            props.techStack.length > 0 ||
            Boolean(props.liveUrl) ||
            Boolean(props.secondaryUrl)) && (
            <div className="pocms-detail-dock">
              {props.showSpecDock !== false &&
                (props.role || props.client || props.year || props.readTimeDisplay) && (
                  <dl className="pocms-spec-grid mb-0">
                    {props.role && (
                      <div>
                        <dt className="pocms-spec-cell__label">Role</dt>
                        <dd className="pocms-spec-cell__value">{props.role}</dd>
                      </div>
                    )}
                    {props.client && (
                      <div>
                        <dt className="pocms-spec-cell__label">Client</dt>
                        <dd className="pocms-spec-cell__value">{props.client}</dd>
                      </div>
                    )}
                    {props.year && (
                      <div>
                        <dt className="pocms-spec-cell__label">Year</dt>
                        <dd className="pocms-spec-cell__value">{props.year}</dd>
                      </div>
                    )}
                    {props.readTimeDisplay && (
                      <div>
                        <dt className="pocms-spec-cell__label">Reading time</dt>
                        <dd className="pocms-spec-cell__value">{props.readTimeDisplay} read</dd>
                      </div>
                    )}
                  </dl>
                )}

              {(props.techStack.length > 0 || props.liveUrl || props.secondaryUrl) && (
                <div className="pocms-project-dock-footer">
                  {props.techStack.length > 0 ? (
                    <div className="pocms-tech-strip" aria-label="Technologies used">
                      {props.techStack.map((tech) =>
                        props.showTechLinks !== false ? (
                          <Link
                            key={tech}
                            href={`/projects?tech=${encodeURIComponent(tech)}`}
                            className="pocms-tech-chip"
                            title={`Filter projects using ${tech}`}
                          >
                            {tech}
                          </Link>
                        ) : (
                          <span key={tech} className="pocms-tech-chip">
                            {tech}
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <div />
                  )}

                  {(props.liveUrl || props.secondaryUrl) && (
                    <div className="pocms-cta-cluster">
                      {props.liveUrl && (
                        <a
                          href={props.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pocms-btn-gold"
                        >
                          {props.liveLabel ?? 'Visit live project'} ↗
                        </a>
                      )}
                      {props.secondaryUrl && (
                        <a
                          href={props.secondaryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pocms-btn-ghost"
                        >
                          {props.secondaryLabel ?? 'External details'} ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </header>
  )
}
