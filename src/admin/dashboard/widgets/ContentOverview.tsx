import type { WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { canReadCollection } from '../../lib/permissions'
import '../dashboard-widgets.scss'

type CountTarget = {
  collection: 'articles' | 'certificates' | 'experiences' | 'media' | 'projects' | 'skills'
  label: string
}

/** Per-user widget settings from the widget's edit drawer (see `fields` on the widget config). */
type ContentOverviewData = {
  shown?: string[] | null
  title?: string | null
}

export const CONTENT_OVERVIEW_TARGETS: CountTarget[] = [
  { collection: 'articles', label: 'Articles' },
  { collection: 'projects', label: 'Projects' },
  { collection: 'media', label: 'Media' },
  { collection: 'certificates', label: 'Certificates' },
  { collection: 'experiences', label: 'Experience' },
  { collection: 'skills', label: 'Skills' },
]

export const CONTENT_OVERVIEW_DEFAULT_COLLECTIONS = CONTENT_OVERVIEW_TARGETS.map(
  (target) => target.collection,
)

/**
 * Dashboard widget: live document counts for the collections editors touch most.
 * Data is fetched server-side through the Local API, respecting the current user.
 * The `shown` collections and title are editable per user via the widget's settings drawer.
 */
export default async function ContentOverview({
  permissions,
  req,
  user,
  widgetData,
}: WidgetServerProps) {
  const data = (widgetData ?? {}) as ContentOverviewData

  const shown: string[] =
    data.shown && data.shown.length > 0 ? data.shown : CONTENT_OVERVIEW_DEFAULT_COLLECTIONS

  const title = data.title?.trim() || 'Content overview'

  const readable = CONTENT_OVERVIEW_TARGETS.filter(
    (target) =>
      shown.includes(target.collection) && canReadCollection(permissions, target.collection),
  )

  const counts = await Promise.all(
    readable.map(async (target) => {
      const { totalDocs } = await req.payload.count({
        collection: target.collection,
        overrideAccess: false,
        req,
        user,
      })
      return { ...target, totalDocs }
    }),
  )

  return (
    <div className="pocms-widget">
      <div className="pocms-widget__header">
        <h3 className="pocms-widget__title">{title}</h3>
        <span className="pocms-widget__hint">Live counts</span>
      </div>
      {counts.length === 0 ? (
        <p className="pocms-empty">No collections are available to your account.</p>
      ) : (
        <ul className="pocms-stats">
          {counts.map(({ collection, label, totalDocs }) => (
            <li key={collection} className="pocms-stats__item">
              <Link href={`/admin/collections/${collection}`} aria-label={`${label}: ${totalDocs}`}>
                <span className="pocms-stats__value">{totalDocs}</span>
                <span className="pocms-stats__label">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
