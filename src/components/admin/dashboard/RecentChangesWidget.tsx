import type { CollectionSlug, WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { Badge } from '../ui/badge'
import { adminURL, collectionLabel, relativeTime } from './lib'
import { WidgetCard } from './WidgetCard'

const COLLECTIONS: CollectionSlug[] = [
  'articles',
  'projects',
  'services',
  'media',
  'header',
  'about',
  'experiences',
  'educations',
  'skills',
  'certificates',
]
const LIMIT = 8

type Row = { id: number | string; slug: CollectionSlug; title: string; updatedAt: string }

/** The most recently edited documents across the content collections. */
export async function RecentChangesWidget({ req }: WidgetServerProps) {
  const results = await Promise.all(
    COLLECTIONS.map(async (slug): Promise<Row[]> => {
      const config = req.payload.collections[slug]?.config
      if (!config) return []
      const titleField = config.admin?.useAsTitle ?? 'id'
      const { docs } = await req.payload.find({
        collection: slug,
        req,
        overrideAccess: false,
        depth: 0,
        limit: LIMIT,
        sort: '-updatedAt',
        // Include-only select (mixing true and false switches Payload to exclude mode).
        select: {
          [titleField]: true,
          updatedAt: true,
          ...(config.upload ? { filename: true } : {}),
        } as never,
      })
      return docs.map((doc) => {
        const record = doc as unknown as Record<string, unknown> & {
          id: number | string
          updatedAt: string
        }
        const title = record[titleField] ?? record.filename ?? `#${record.id}`
        return { id: record.id, slug, title: String(title), updatedAt: record.updatedAt }
      })
    }),
  )
  const rows = results
    .flat()
    .filter((row) => typeof row.updatedAt === 'string')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LIMIT)
  const language = req.i18n.language || 'en'

  return (
    <WidgetCard
      title="Recent changes"
      description="The last documents edited by anyone on the team."
    >
      {rows.length === 0 ? (
        <p className="acn:text-sm acn:text-muted-foreground">Nothing has been edited yet.</p>
      ) : (
        <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:divide-y acn:divide-border acn:p-0">
          {rows.map((row) => (
            <li
              key={`${row.slug}-${row.id}`}
              className="acn:flex acn:items-center acn:gap-3 acn:py-2"
            >
              <Link
                href={adminURL(req, row.slug, row.id)}
                className="acn:min-w-0 acn:flex-1 acn:truncate acn:text-sm acn:font-medium acn:text-foreground acn:no-underline acn:hover:underline acn:pointer-coarse:-my-2 acn:pointer-coarse:py-2"
              >
                {row.title}
              </Link>
              <Badge variant="outline" className="acn:shrink-0">
                {collectionLabel(req, row.slug)}
              </Badge>
              <time
                dateTime={row.updatedAt}
                title={new Date(row.updatedAt).toLocaleString(language)}
                className="acn:w-24 acn:shrink-0 acn:text-right acn:text-xs acn:text-muted-foreground acn:tabular-nums"
              >
                {relativeTime(row.updatedAt, language)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export default RecentChangesWidget
