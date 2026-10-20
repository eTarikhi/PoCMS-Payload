import type { CIReport } from '@/integrations/github'
import type { FieldReport, LabRun } from '@/integrations/google'
import type { Deployment, TrafficReport } from '@/integrations/vercel'

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

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const SAMPLE_LAB: LabRun = {
  url: 'https://example.com/',
  strategy: 'mobile',
  fetchedAt: ago(180),
  scores: [
    { key: 'performance', label: 'Performance', score: 84, rating: 'average' },
    { key: 'accessibility', label: 'Accessibility', score: 98, rating: 'good' },
    { key: 'best-practices', label: 'Best practices', score: 100, rating: 'good' },
    { key: 'seo', label: 'SEO', score: 42, rating: 'poor' },
  ],
  metrics: [
    {
      key: 'first-contentful-paint',
      name: 'FCP',
      label: 'First Contentful Paint',
      display: '1.4 s',
      value: 1420,
      rating: 'good',
    },
    {
      key: 'largest-contentful-paint',
      name: 'LCP',
      label: 'Largest Contentful Paint',
      display: '3.1 s',
      value: 3080,
      rating: 'average',
    },
    {
      key: 'total-blocking-time',
      name: 'TBT',
      label: 'Total Blocking Time',
      display: '120 ms',
      value: 120,
      rating: 'good',
    },
    {
      key: 'cumulative-layout-shift',
      name: 'CLS',
      label: 'Cumulative Layout Shift',
      display: '0.31',
      value: 0.31,
      rating: 'poor',
    },
    {
      key: 'speed-index',
      name: 'SI',
      label: 'Speed Index',
      display: '2.9 s',
      value: 2900,
      rating: 'good',
    },
  ],
  lighthouseVersion: '13.0.1',
}

export const SAMPLE_DEPLOYMENTS: Deployment[] = [
  {
    id: 'dpl_1',
    url: 'https://example.vercel.app',
    state: 'BUILDING',
    target: 'preview',
    createdAt: ago(2),
    buildSeconds: null,
    inspectorUrl: '#',
    branch: 'feature/roles',
    commitMessage: 'feat: roles and permissions',
    commitSha: 'a1b2c3d4',
    author: 'etarikhi',
  },
  {
    id: 'dpl_2',
    url: 'https://example.com',
    state: 'READY',
    target: 'production',
    createdAt: ago(90),
    buildSeconds: 94,
    inspectorUrl: '#',
    branch: 'main',
    commitMessage: 'fix: footer links',
    commitSha: 'e5f6a7b8',
    author: 'etarikhi',
  },
  {
    id: 'dpl_3',
    url: 'https://example-git-x.vercel.app',
    state: 'ERROR',
    target: 'preview',
    createdAt: ago(300),
    buildSeconds: 41,
    inspectorUrl: '#',
    branch: 'experiment',
    commitMessage: 'chore: try a new build step',
    commitSha: 'c9d0e1f2',
    author: 'etarikhi',
  },
]

export const SAMPLE_CI: CIReport = {
  repository: 'owner/repository',
  runs: [
    {
      id: 1,
      workflow: 'CI',
      title: 'feat: roles and permissions',
      branch: 'feature/roles',
      commitSha: 'a1b2c3d4',
      status: 'in_progress',
      conclusion: null,
      url: '#',
      event: 'push',
      actor: 'etarikhi',
      createdAt: ago(3),
      durationSeconds: null,
    },
    {
      id: 2,
      workflow: 'CI',
      title: 'fix: footer links',
      branch: 'main',
      commitSha: 'e5f6a7b8',
      status: 'completed',
      conclusion: 'success',
      url: '#',
      event: 'push',
      actor: 'etarikhi',
      createdAt: ago(95),
      durationSeconds: 312,
    },
    {
      id: 3,
      workflow: 'CI',
      title: 'chore: try a new build step',
      branch: 'experiment',
      commitSha: 'c9d0e1f2',
      status: 'completed',
      conclusion: 'failure',
      url: '#',
      event: 'push',
      actor: 'etarikhi',
      createdAt: ago(305),
      durationSeconds: 188,
    },
  ],
}
