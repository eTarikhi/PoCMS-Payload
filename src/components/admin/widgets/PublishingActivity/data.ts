import type { CollectionSlug } from 'payload'

/** One month of the publishing chart. `key` is `YYYY-MM` (UTC). */
export type PublishingPoint = {
  key: string
  month: string
  label: string
  articles: number
  projects: number
}

/** The chart's series: which collection, and which date field puts a document in a month. */
export const PUBLISHING_SERIES = {
  articles: {
    label: 'Articles',
    collection: 'articles',
    field: 'publishedAt',
    color: 'var(--chart-1)',
  },
  projects: {
    label: 'Projects',
    collection: 'projects',
    field: 'createdAt',
    color: 'var(--chart-3)',
  },
} as const satisfies Record<
  string,
  { label: string; collection: CollectionSlug; field: string; color: string }
>

export type PublishingSeries = keyof typeof PUBLISHING_SERIES
export const SERIES_KEYS = Object.keys(PUBLISHING_SERIES) as PublishingSeries[]

/** Months of data the server sends; the chart shows the last 6, 12 or 24 of them. */
export const PUBLISHING_MONTHS = 24
export const DEFAULT_RANGE = 12

/** The admin list of a series, filtered to one month (UTC) of its date field. */
export function monthListURL(adminRoute: string, series: PublishingSeries, key: string): string {
  const [year, month] = key.split('-').map(Number)
  const { collection, field } = PUBLISHING_SERIES[series]
  const params = new URLSearchParams({
    [`where[and][0][${field}][greater_than_equal]`]: new Date(
      Date.UTC(year, month - 1, 1),
    ).toISOString(),
    [`where[and][1][${field}][less_than]`]: new Date(Date.UTC(year, month, 1)).toISOString(),
  })
  return `${adminRoute}/collections/${collection}?${params}`
}
