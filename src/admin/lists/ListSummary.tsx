import { formatDistanceToNow } from 'date-fns'
import type { BeforeListServerProps, CollectionSlug } from 'payload'
import Link from 'next/link'
import React from 'react'

import '../dashboard/dashboard-widgets.scss'

const RECENT_WINDOW_DAYS = 30

type Fact = {
  key: string
  value: React.ReactNode
}

/**
 * Slim decoration injected above Payload's default list views (`beforeList`)
 * for high-value collections. It summarises the collection without touching
 * Payload's filters, pagination, columns, or bulk actions.
 */
export default async function ListSummary({
  collectionSlug,
  hasCreatePermission,
  newDocumentURL,
  payload,
  user,
}: BeforeListServerProps) {
  const collection = collectionSlug as CollectionSlug

  const { totalDocs } = await payload.count({
    collection,
    overrideAccess: false,
    user,
  })

  const since = new Date()
  since.setDate(since.getDate() - RECENT_WINDOW_DAYS)

  const { totalDocs: recentDocs } = await payload.count({
    collection,
    overrideAccess: false,
    user,
    where: { updatedAt: { greater_than_equal: since.toISOString() } },
  })

  const { docs: latest } = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: false,
    sort: '-updatedAt',
    user,
  })

  const lastUpdated: string | undefined = (latest[0] as { updatedAt?: string } | undefined)?.updatedAt

  const facts: Fact[] = [
    {
      key: 'total',
      value: (
        <>
          <strong>{totalDocs}</strong> total
        </>
      ),
    },
    {
      key: 'recent',
      value: (
        <>
          <strong>{recentDocs}</strong> updated in the last {RECENT_WINDOW_DAYS} days
        </>
      ),
    },
  ]

  if (lastUpdated) {
    facts.push({
      key: 'last',
      value: (
        <>
          Last edit {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
        </>
      ),
    })
  }

  return (
    <aside className="pocms-list-summary" aria-label="Collection summary">
      <ul className="pocms-list-summary__facts">
        {facts.map((fact) => (
          <li key={fact.key}>{fact.value}</li>
        ))}
      </ul>
      {hasCreatePermission && (
        <div className="pocms-list-summary__actions">
          <Link className="btn btn--style-primary" href={newDocumentURL}>
            Create new
          </Link>
        </div>
      )}
    </aside>
  )
}
