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
