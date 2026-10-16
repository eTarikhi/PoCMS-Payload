import type { WidgetServerProps } from 'payload'
import React from 'react'

import { PublishingChart, type PublishingPoint } from './PublishingChart'
import { WidgetCard } from './WidgetCard'

const MONTHS = 24

/** Articles per publish month over the last two years (bars rendered by a lazy Recharts island). */
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
        <PublishingChart data={points} />
      )}
    </WidgetCard>
  )
}

export default PublishingWidget
