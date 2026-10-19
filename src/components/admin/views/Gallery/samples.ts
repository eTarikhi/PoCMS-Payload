import type { FieldReport } from '@/integrations/google'
import type { TrafficReport } from '@/integrations/vercel'

/**
 * Sample data for the integration widgets in the gallery, so their filled-in layout can be
 * reviewed without tokens (the live specimens next to them show the real state).
 */
const day = (offset: number) =>
  new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

export const SAMPLE_TRAFFIC: TrafficReport = {
  days: 7,
  since: day(6),
  until: day(0),
  totals: { pageviews: 1_284, visitors: 642 },
  daily: [140, 162, 151, 188, 240, 205, 198].map((pageviews, i) => ({
    date: day(6 - i),
    pageviews,
    visitors: Math.round(pageviews / 2),
  })),
  topPages: [
    { path: '/', pageviews: 610, visitors: 402 },
    { path: '/articles/sample-article', pageviews: 214, visitors: 166 },
    { path: '/articles', pageviews: 120, visitors: 98 },
  ],
  topReferrers: [
    { host: 'github.com', pageviews: 182, visitors: 140 },
    { host: 'linkedin.com', pageviews: 96, visitors: 77 },
  ],
}

const trend = (base: number, spread: number) =>
  Array.from({ length: 25 }, (_, i) => Math.round(base + Math.sin(i / 3) * spread))

export const SAMPLE_FIELD: FieldReport = {
  origin: 'https://example.com',
  formFactor: 'PHONE',
  period: { first: day(28), last: day(1) },
  metrics: [
    {
      key: 'largest_contentful_paint',
      name: 'LCP',
      label: 'Largest Contentful Paint',
      unit: 'ms',
      p75: 2140,
      rating: 'good',
      distribution: [0.82, 0.12, 0.06],
      trend: trend(2200, 180),
    },
    {
      key: 'interaction_to_next_paint',
      name: 'INP',
      label: 'Interaction to Next Paint',
      unit: 'ms',
      p75: 236,
      rating: 'average',
      distribution: [0.71, 0.22, 0.07],
      trend: trend(240, 30),
    },
    {
      key: 'cumulative_layout_shift',
      name: 'CLS',
      label: 'Cumulative Layout Shift',
      unit: '',
      p75: 0.04,
      rating: 'good',
      distribution: [0.93, 0.05, 0.02],
      trend: trend(4, 1).map((v) => v / 100),
    },
    {
      key: 'first_contentful_paint',
      name: 'FCP',
      label: 'First Contentful Paint',
      unit: 'ms',
      p75: 1650,
      rating: 'good',
      distribution: [0.79, 0.15, 0.06],
      trend: trend(1700, 120),
    },
    {
      key: 'experimental_time_to_first_byte',
      name: 'TTFB',
      label: 'Time to First Byte',
      unit: 'ms',
      p75: 1920,
      rating: 'poor',
      distribution: [0.41, 0.33, 0.26],
      trend: trend(1800, 200),
    },
  ],
}
