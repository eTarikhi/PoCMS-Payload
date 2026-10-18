import type { WidgetServerProps } from 'payload'
import React from 'react'

import {
  DEFAULT_RANGE,
  monthListURL,
  PUBLISHING_MONTHS,
  PUBLISHING_SERIES,
  SERIES_KEYS,
  type PublishingPoint,
} from './publishing'
import { PublishingChartLazy } from './PublishingChartLazy'
import { WidgetCard } from './WidgetCard'

/**
 * Articles published and projects added per month. The server counts the last 24 months; the
 * interactive chart (range, series, tooltips, month drill-down) is a client island loaded only
 * here. Until it loads, the same numbers show as plain server-rendered bars, and a visually hidden
 * table with links carries them for screen readers.
 */
export async function PublishingWidget({ req }: WidgetServerProps) {
  const now = new Date()
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (PUBLISHING_MONTHS - 1), 1),
  ).toISOString()
  const [articles, projects] = await Promise.all([
    req.payload.find({
      collection: 'articles',
      req,
      overrideAccess: false,
      depth: 0,
      pagination: false,
      where: { publishedAt: { greater_than_equal: start } },
      select: { publishedAt: true },
    }),
    req.payload.find({
      collection: 'projects',
      req,
      overrideAccess: false,
      depth: 0,
      pagination: false,
      where: { createdAt: { greater_than_equal: start } },
      select: { createdAt: true },
    }),
  ])

  const language = req.i18n.language || 'en'
  const short = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const first = new Date(start)
  const points: PublishingPoint[] = Array.from({ length: PUBLISHING_MONTHS }, (_, i) => {
    const month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1))
    return {
      key: month.toISOString().slice(0, 7),
      month: short.format(month),
      label: long.format(month),
      articles: 0,
      projects: 0,
    }
  })
  const bucket = (date: string | null | undefined, series: 'articles' | 'projects') => {
    const point = points.find((p) => p.key === date?.slice(0, 7))
    if (point) point[series] += 1
  }
  articles.docs.forEach((doc) => bucket(doc.publishedAt, 'articles'))
  projects.docs.forEach((doc) => bucket(doc.createdAt, 'projects'))
  const total = points.reduce((sum, p) => sum + p.articles + p.projects, 0)
  const adminRoute = req.payload.config.routes.admin

  return (
    <WidgetCard
      title="Publishing activity"
      description="Articles published and projects added per month."
    >
      {total === 0 ? (
        <p className="acn:text-sm acn:text-muted-foreground">
          No articles or projects in the last {PUBLISHING_MONTHS} months.
        </p>
      ) : (
        <>
          <PublishingChartLazy points={points} adminRoute={adminRoute}>
            <PublishingBars points={points.slice(-DEFAULT_RANGE)} />
          </PublishingChartLazy>
          <PublishingTable points={points} adminRoute={adminRoute} />
        </>
      )}
    </WidgetCard>
  )
}

export default PublishingWidget

/** Static stand-in for the chart while it loads: articles per month, plain HTML. */
function PublishingBars({ points }: { points: PublishingPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.articles))
  return (
    <figure aria-hidden className="acn:m-0">
      <div aria-hidden className="acn:flex acn:gap-2">
        <div className="acn:flex acn:h-40 acn:flex-col acn:justify-between acn:text-right acn:text-xs acn:text-muted-foreground acn:tabular-nums">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="acn:flex acn:h-40 acn:flex-1 acn:items-end acn:gap-1 acn:border-b acn:border-border">
          {points.map((point) => (
            <div
              key={point.key}
              title={`${point.label}: ${point.articles}`}
              className="acn:flex acn:h-full acn:flex-1 acn:items-end"
            >
              <div
                className="acn:w-full acn:rounded-t-sm"
                style={{
                  height: `${(point.articles / max) * 100}%`,
                  minHeight: point.articles > 0 ? 2 : 0,
                  backgroundColor: 'var(--chart-1)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden
        className="acn:mt-1 acn:flex acn:gap-1 acn:pl-6 acn:text-xs acn:text-muted-foreground"
      >
        {points.map((point, i) => (
          <span key={point.key} className="acn:flex-1 acn:text-center">
            {i % 3 === 0 ? point.month : ''}
          </span>
        ))}
      </div>
    </figure>
  )
}

/**
 * The same numbers for screen readers, with links to each month's documents. The wrapper is the
 * visually hidden box: a table ignores the 1px size of sr-only and lays out at full size.
 */
function PublishingTable({
  points,
  adminRoute,
}: {
  points: PublishingPoint[]
  adminRoute: string
}) {
  return (
    <div className="acn:sr-only">
      <table>
        <caption>Articles published and projects added per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {SERIES_KEYS.map((series) => (
              <th key={series} scope="col">
                {PUBLISHING_SERIES[series].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              {SERIES_KEYS.map((series) => (
                <td key={series}>
                  {point[series] > 0 ? (
                    <a href={monthListURL(adminRoute, series, point.key)}>{point[series]}</a>
                  ) : (
                    0
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
