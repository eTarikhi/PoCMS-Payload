import { formatDistanceToNow } from 'date-fns'
import type { SanitizedPermissions, WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import '../dashboard-widgets.scss'

type ActivityCollection = 'articles' | 'certificates' | 'projects'

const COLLECTION_LABELS: Record<ActivityCollection, string> = {
  articles: 'Article',
  certificates: 'Certificate',
  projects: 'Project',
}

type ActivityItem = {
  collection: ActivityCollection
  date: Date
  id: number | string
  title: string
}

function canRead(permissions: SanitizedPermissions | undefined, collection: string): boolean {
  return Boolean(permissions?.collections?.[collection]?.read)
}

/**
 * Dashboard widget: the most recently updated documents across key collections.
 * Fetched server-side with the Local API and scoped to the current user's access.
 */
export default async function RecentActivity({ permissions, req, user }: WidgetServerProps) {
  const collections = (Object.keys(COLLECTION_LABELS) as ActivityCollection[]).filter((slug) =>
    canRead(permissions, slug),
  )

  const perCollection = await Promise.all(
    collections.map(async (collection) => {
      const { docs } = await req.payload.find({
        collection,
        depth: 0,
        limit: 4,
        overrideAccess: false,
        req,
        sort: '-updatedAt',
        user,
      })
      return docs.map((doc) => {
        const record = doc as {
          id: number | string
          title?: string | null
          updatedAt: string
        }
        return {
          collection,
          date: new Date(record.updatedAt),
          id: record.id,
          title: record.title?.trim() || `Untitled ${COLLECTION_LABELS[collection].toLowerCase()}`,
        } satisfies ActivityItem
      })
    }),
  )

  const items = perCollection
    .flat()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8)

  return (
    <div className="pocms-widget">
      <div className="pocms-widget__header">
        <h3 className="pocms-widget__title">Recent activity</h3>
        <span className="pocms-widget__hint">Last updated</span>
      </div>
      {items.length === 0 ? (
        <p className="pocms-empty">
          Nothing here yet. Content you create will show up in this feed.
        </p>
      ) : (
        <ul className="pocms-activity">
          {items.map((item) => (
            <li key={`${item.collection}-${item.id}`} className="pocms-activity__item">
              <span className="pocms-activity__title">
                <span className="pocms-activity__badge">{COLLECTION_LABELS[item.collection]}</span>
                <Link href={`/admin/collections/${item.collection}/${item.id}`}>{item.title}</Link>
              </span>
              <span className="pocms-activity__date">
                {formatDistanceToNow(item.date, { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="pocms-widget__foot">
        <Link href="/admin/collections/articles">Browse all articles →</Link>
      </div>
    </div>
  )
}
