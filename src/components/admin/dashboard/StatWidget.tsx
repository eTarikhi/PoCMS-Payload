import type { CollectionSlug, WidgetServerProps } from 'payload'
import { ArrowUpRightIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { STAT_COLLECTIONS } from './config'
import { adminURL, collectionLabel, daysAgoISO } from './lib'

/**
 * One collection's document count, how many were added in the last 30 days, and a sparkline of
 * additions per month over the last year.
 */
export async function StatWidget({ req, widgetData }: WidgetServerProps) {
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

export default StatWidget

const TREND_MONTHS = 12

/**
 * Additions per month as a small server-rendered SVG line (no client JavaScript). Decorative: the
 * numbers next to it say the same, and the widget links to the full list.
 */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const width = 96
  const height = 28
  const step = width / (values.length - 1)
  const points = values.map((value, i) => [i * step, height - 2 - (value / max) * (height - 4)])
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return (
    <svg
      aria-hidden
      data-slot="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      className="acn:h-7 acn:w-24 acn:shrink-0 acn:overflow-visible"
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="var(--chart-1)" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
