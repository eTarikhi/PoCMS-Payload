import type { CollectionSlug, WidgetServerProps } from 'payload'
import { ArrowUpRightIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { STAT_COLLECTIONS } from './config'
import { adminURL, collectionLabel, daysAgoISO } from './lib'

/** One collection's document count, with how many were added in the last 30 days. */
export async function StatWidget({ req, widgetData }: WidgetServerProps) {
  const requested = widgetData?.collection
  const slug = (STAT_COLLECTIONS.find(({ value }) => value === requested)?.value ??
    'articles') as CollectionSlug
  const since = daysAgoISO(30)

  const [total, recent] = await Promise.all([
    req.payload.count({ collection: slug, req, overrideAccess: false }),
    req.payload.count({
      collection: slug,
      req,
      overrideAccess: false,
      where: { createdAt: { greater_than_equal: since } },
    }),
  ])
  const label = collectionLabel(req, slug)

  return (
    <Link
      data-dashboard-widget=""
      href={adminURL(req, slug)}
      className="acn:group acn:flex acn:h-full acn:flex-col acn:justify-between acn:gap-3 acn:rounded-xl acn:bg-card acn:p-5 acn:text-card-foreground acn:no-underline acn:ring-1 acn:ring-border acn:transition-colors acn:hover:bg-muted/60 acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:focus-visible:outline-none"
    >
      <div className="acn:flex acn:items-center acn:justify-between acn:text-sm acn:text-muted-foreground">
        <span>{label}</span>
        <ArrowUpRightIcon
          aria-hidden
          className="acn:size-4 acn:opacity-60 acn:group-hover:opacity-100"
        />
      </div>
      <div className="acn:text-3xl acn:font-semibold acn:tracking-tight acn:tabular-nums">
        {total.totalDocs}
      </div>
      <div className="acn:text-xs acn:text-muted-foreground">
        {recent.totalDocs > 0
          ? `+${recent.totalDocs} in the last 30 days`
          : 'No additions in the last 30 days'}
      </div>
    </Link>
  )
}

export default StatWidget
