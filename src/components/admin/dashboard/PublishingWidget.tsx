import type { WidgetServerProps } from 'payload'
import React from 'react'

import { WidgetCard } from './WidgetCard'

type PublishingPoint = { key: string; month: string; label: string; articles: number }

const MONTHS = 24

/**
 * Articles per publish month over the last two years. The bars are plain server-rendered HTML (no
 * chart library, no client JS); a visually hidden table carries the same numbers for screen readers.
 */
export async function PublishingWidget({ req }: WidgetServerProps) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1))
  const { docs } = await req.payload.find({
    collection: 'articles',
    req,
    overrideAccess: false,
    depth: 0,
    pagination: false,
    where: { publishedAt: { greater_than_equal: start.toISOString() } },
    select: { publishedAt: true },
  })

  const language = req.i18n.language || 'en'
  const short = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const points: PublishingPoint[] = Array.from({ length: MONTHS }, (_, i) => {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    return {
      key: month.toISOString().slice(0, 7),
      month: short.format(month),
      label: long.format(month),
      articles: 0,
    }
  })
  for (const doc of docs) {
    const key = doc.publishedAt?.slice(0, 7)
    const point = points.find((p) => p.key === key)
    if (point) point.articles += 1
  }
  const total = points.reduce((sum, p) => sum + p.articles, 0)

  return (
    <WidgetCard
      title="Publishing activity"
      description={`Articles by publish month, last ${MONTHS} months: ${total} in total.`}
    >
      {total === 0 ? (
        <p className="acn:text-sm acn:text-muted-foreground">
          No articles were published in this period.
        </p>
      ) : (
        <PublishingBars points={points} />
      )}
    </WidgetCard>
  )
}

export default PublishingWidget

function PublishingBars({ points }: { points: PublishingPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.articles))
  return (
    <figure className="acn:m-0">
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
      <table className="acn:sr-only">
        <caption>Articles published per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Articles</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              <td>{point.articles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
