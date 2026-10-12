import type { AdminViewServerProps } from 'payload'
import { Gutter } from '@payloadcms/ui'
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Wrench,
} from 'lucide-react'
import React from 'react'
import { notFound, redirect } from 'next/navigation.js'
import { contentTypes, loadOverview, type ContentSlug } from './dashboard-data'

// The compact card / activity layout is informed by AdminCN Free and satnaing/shadcn-admin.
// Use Payload's existing admin shell, authentication and editors rather than their demo apps.
const icons = { projects: FolderKanban, articles: FileText, media: ImageIcon, services: Wrench }

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Recently updated'
    : new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        date,
      )
}

export default async function Dashboard({ initPageResult, user }: AdminViewServerProps) {
  const { permissions, req, visibleEntities } = initPageResult

  const adminRoute = req.payload.config.routes.admin
  // Custom admin views can be publicly accessible; never render content without a principal.
  if (!req.user) redirect(`${adminRoute}/login`)
  if (!permissions.canAccessAdmin) notFound()

  const readableSlugs = contentTypes
    .filter(
      ({ slug }) =>
        visibleEntities.collections.includes(slug) && permissions.collections?.[slug]?.read,
    )
    .map(({ slug }) => slug)
  const { overview, recent } = await loadOverview(req.payload, req.user, readableSlugs)
  const canCreate = (slug: 'projects' | 'articles') =>
    Boolean(permissions.collections?.[slug]?.create)
  const canView = (slug: ContentSlug) => readableSlugs.includes(slug)

  const otherCollections = (
    [
      { slug: 'about', label: 'About' },
      { slug: 'header', label: 'Homepage header' },
      { slug: 'skills', label: 'Skills' },
      { slug: 'experiences', label: 'Experience' },
      { slug: 'educations', label: 'Education' },
      { slug: 'certificates', label: 'Certificates' },
    ] as const
  ).filter(
    ({ slug }) =>
      visibleEntities.collections.includes(slug) && permissions.collections?.[slug]?.read,
  )

  return (
    <Gutter className="pocms-dashboard">
      <div className="pocms-dashboard__intro">
        <div>
          <span className="pocms-dashboard__eyebrow">
            <Sparkles size={14} aria-hidden="true" /> PoCMS / Overview
          </span>
          <h1>Content workspace</h1>
          <p>Everything you need to keep your portfolio up to date, in one place.</p>
          {user?.email && <p className="pocms-dashboard__identity">Signed in as {user.email}</p>}
        </div>
        <a
          className="pocms-dashboard__site-link"
          href="/"
          target="_blank"
          rel="noopener noreferrer"
        >
          View website <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>

      <section className="pocms-dashboard__section" aria-labelledby="content-heading">
        <div className="pocms-dashboard__section-heading">
          <div>
            <span className="pocms-dashboard__kicker">YOUR CONTENT</span>
            <h2 id="content-heading">At a glance</h2>
          </div>
          <span className="pocms-dashboard__section-hint">Live from your CMS</span>
        </div>
        {overview.length ? (
          <div className="pocms-dashboard__stats">
            {overview.map(({ slug, count }) => {
              const { label, description } = contentTypes.find((type) => type.slug === slug)!
              const Icon = icons[slug]
              return (
                <a
                  className="pocms-dashboard__stat"
                  key={slug}
                  href={`${adminRoute}/collections/${slug}`}
                >
                  <span className="pocms-dashboard__stat-icon">
                    <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="pocms-dashboard__stat-count">
                    {count === null ? '—' : count.toLocaleString('en')}
                  </span>
                  <span className="pocms-dashboard__stat-label">
                    {label} <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                  <span className="pocms-dashboard__stat-description">
                    {count === null ? 'Temporarily unavailable' : description}
                  </span>
                </a>
              )
            })}
          </div>
        ) : (
          <p className="pocms-dashboard__empty">
            No content collections are available to this account.
          </p>
        )}
      </section>

      <div className="pocms-dashboard__columns">
        <section className="pocms-dashboard__panel" aria-labelledby="recent-heading">
          <div className="pocms-dashboard__panel-heading">
            <div>
              <span className="pocms-dashboard__kicker">LATEST UPDATES</span>
              <h2 id="recent-heading">Recently edited</h2>
            </div>
          </div>
          {recent.length ? (
            <ul className="pocms-dashboard__recent">
              {recent.map((item) => (
                <li key={`${item.slug}-${item.id}`}>
                  <a href={`${adminRoute}/collections/${item.slug}/${item.id}`}>
                    <span className="pocms-dashboard__recent-icon">
                      {item.slug === 'projects' ? (
                        <FolderKanban size={18} aria-hidden="true" />
                      ) : (
                        <FileText size={18} aria-hidden="true" />
                      )}
                    </span>
                    <span className="pocms-dashboard__recent-text">
                      <strong>{item.label}</strong>
                      <small>
                        {item.slug === 'projects' ? 'Project' : 'Article'} ·{' '}
                        {formatDate(item.updatedAt)}
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pocms-dashboard__empty">
              Your latest projects and articles will appear here.
            </p>
          )}
        </section>

        <section className="pocms-dashboard__panel" aria-labelledby="quick-heading">
          <div className="pocms-dashboard__panel-heading">
            <div>
              <span className="pocms-dashboard__kicker">SHORTCUTS</span>
              <h2 id="quick-heading">Quick access</h2>
            </div>
          </div>
          <div className="pocms-dashboard__shortcuts">
            {canCreate('projects') && canView('projects') && (
              <a
                className="pocms-dashboard__shortcut"
                href={`${adminRoute}/collections/projects/create`}
              >
                <span className="pocms-dashboard__shortcut-icon">
                  <Plus size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>New project</strong>
                  <small>Add work to your portfolio</small>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
            {canCreate('articles') && canView('articles') && (
              <a
                className="pocms-dashboard__shortcut"
                href={`${adminRoute}/collections/articles/create`}
              >
                <span className="pocms-dashboard__shortcut-icon">
                  <Plus size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>New article</strong>
                  <small>Share an update or insight</small>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
            {visibleEntities.globals.includes('footer') && permissions.globals?.footer?.read && (
              <a className="pocms-dashboard__shortcut" href={`${adminRoute}/globals/footer`}>
                <span className="pocms-dashboard__shortcut-icon">
                  <Wrench size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>Footer settings</strong>
                  <small>Contact and social links</small>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
            {otherCollections.length > 0 && (
              <div className="pocms-dashboard__more-links">
                <span>More content</span>
                <div>
                  {otherCollections.map(({ slug, label }) => (
                    <a href={`${adminRoute}/collections/${slug}`} key={slug}>
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </Gutter>
  )
}
