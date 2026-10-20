import type { CollectionSlug, WidgetServerProps } from 'payload'
import { ArrowUpRightIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { Sparkline } from '@/components/admin/elements/Sparkline'
import { adminURL, collectionLabel } from '@/components/admin/utilities/collections'
import { daysAgoISO } from '@/components/admin/utilities/dates'
import { STAT_COLLECTIONS } from '@/components/admin/widgets/config'

/**
 * One collection's document count, how many were added in the last 30 days, and a sparkline of
 * additions per month over the last year.
 */
export async function ContentCountWidget({ req, widgetData }: WidgetServerProps) {
  const requested = widgetData?.collection
  const slug = (STAT_COLLECTIONS.find(({ value }) => value === requested)?.value ??
    'articles') as CollectionSlug
  const since = daysAgoISO(30)

  const now = new Date()
  const yearStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1),
  )
  const [total, recent, created] = await Promise.all([
    req.payload.count({ collection: slug, req, overrideAccess: false }),
    req.payload.count({
      collection: slug,
      req,
      overrideAccess: false,
      where: { createdAt: { greater_than_equal: since } },
    }),
    req.payload.find({
      collection: slug,
      req,
      overrideAccess: false,
      depth: 0,
      pagination: false,
      where: { createdAt: { greater_than_equal: yearStart.toISOString() } },
      select: { createdAt: true } as never,
    }),
  ])
  // Additions per month over the last year, oldest first.
  const perMonth = Array.from({ length: TREND_MONTHS }, (_, i) =>
    new Date(Date.UTC(yearStart.getUTCFullYear(), yearStart.getUTCMonth() + i, 1))
      .toISOString()
      .slice(0, 7),
  ).map(
    (month) =>
      created.docs.filter((doc) =>
        String((doc as { createdAt?: string }).createdAt).startsWith(month),
      ).length,
  )
  const label = collectionLabel(req, slug)

  return (
    <Link
      data-dashboard-widget=""
      data-stat-widget=""
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
      <div className="acn:flex acn:items-end acn:justify-between acn:gap-3">
        <div className="acn:text-3xl acn:font-semibold acn:tracking-tight acn:tabular-nums">
          {total.totalDocs}
        </div>
        <Sparkline values={perMonth} />
      </div>
      <div className="acn:text-xs acn:text-muted-foreground">
        {recent.totalDocs > 0
          ? `+${recent.totalDocs} in the last 30 days`
          : 'No additions in the last 30 days'}
      </div>
    </Link>
  )
}

export default ContentCountWidget

const TREND_MONTHS = 12
