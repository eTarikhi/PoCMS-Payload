import type { SanitizedPermissions, WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import '../dashboard-widgets.scss'

type CountTarget = {
  collection: 'articles' | 'certificates' | 'experiences' | 'media' | 'projects' | 'skills'
  label: string
}

const TARGETS: CountTarget[] = [
  { collection: 'articles', label: 'Articles' },
  { collection: 'projects', label: 'Projects' },
  { collection: 'media', label: 'Media' },
  { collection: 'certificates', label: 'Certificates' },
  { collection: 'experiences', label: 'Experience' },
  { collection: 'skills', label: 'Skills' },
]

export function canRead(
  permissions: SanitizedPermissions | undefined,
  collection: string,
): boolean {
  return Boolean(permissions?.collections?.[collection]?.read)
}

/**
 * Dashboard widget: live document counts for the collections editors touch most.
 * Data is fetched server-side through the Local API, respecting the current user.
 */
export default async function ContentOverview({ permissions, req, user }: WidgetServerProps) {
  const readable = TARGETS.filter((target) => canRead(permissions, target.collection))

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
        <h3 className="pocms-widget__title">Content overview</h3>
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
