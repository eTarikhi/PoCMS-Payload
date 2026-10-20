import { fetchJSON, type IntegrationResult, missingEnv, settle } from './result'

/**
 * Vercel REST API: Web Analytics (visits) and deployments.
 * Needs VERCEL_TOKEN and VERCEL_PROJECT_ID; VERCEL_TEAM_ID (or VERCEL_TEAM_SLUG) for team projects.
 * Docs: https://vercel.com/docs/analytics/web-analytics-api, https://vercel.com/docs/rest-api
 */
const API = 'https://api.vercel.com'

export const VERCEL_ENV = ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'] as const

function scope(): Record<string, string> {
  const teamId = process.env.VERCEL_TEAM_ID?.trim()
  const slug = process.env.VERCEL_TEAM_SLUG?.trim()
  return teamId ? { teamId } : slug ? { slug } : {}
}

async function vercelGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  revalidate = 600,
) {
  const query = new URLSearchParams({ ...scope() })
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return fetchJSON<T>(`${API}${path}?${query}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    revalidate,
  })
}

/* ------------------------------------------------------------------------------------------ */
/* Web Analytics                                                                               */
/* ------------------------------------------------------------------------------------------ */

type VisitsCount = { data: { pageviews: number; visitors: number } }
type VisitsRows<K extends string> = {
  data: ({ pageviews: number; visitors: number } & Record<K, string>)[]
}

export type TrafficReport = {
  days: number
  since: string
  until: string
  totals: { pageviews: number; visitors: number }
  /** One row per day, oldest first (days without visits are filled with zeros). */
  daily: { date: string; pageviews: number; visitors: number }[]
  topPages: { path: string; pageviews: number; visitors: number }[]
  topReferrers: { host: string; pageviews: number; visitors: number }[]
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

/** Visits for the last `days` days (UTC dates, today included), from Vercel Web Analytics. */
export async function siteTraffic(days: number): Promise<IntegrationResult<TrafficReport>> {
  const missing = missingEnv(...VERCEL_ENV)
  if (missing.length > 0) return { status: 'not-configured', missing }
  const projectId = process.env.VERCEL_PROJECT_ID
  const until = new Date()
  const since = new Date(until.getTime() - (days - 1) * 86_400_000)
  const range = { projectId, since: isoDate(since), until: isoDate(until) }

  return settle(async () => {
    const [count, perDay, pages, referrers] = await Promise.all([
      vercelGet<VisitsCount>('/v1/query/web-analytics/visits/count', range),
      vercelGet<VisitsRows<'timestamp'>>('/v1/query/web-analytics/visits/aggregate', {
        ...range,
        by: 'day',
      }),
      vercelGet<VisitsRows<'requestPath'>>('/v1/query/web-analytics/visits/aggregate', {
        ...range,
        by: 'requestPath',
        limit: 8,
      }),
      vercelGet<VisitsRows<'referrerHostname'>>('/v1/query/web-analytics/visits/aggregate', {
        ...range,
        by: 'referrerHostname',
        limit: 5,
      }),
    ])
    const byDate = new Map(perDay.data.map((row) => [String(row.timestamp).slice(0, 10), row]))
    const daily = Array.from({ length: days }, (_, i) => {
      const date = isoDate(new Date(since.getTime() + i * 86_400_000))
      const row = byDate.get(date)
      return { date, pageviews: row?.pageviews ?? 0, visitors: row?.visitors ?? 0 }
    })
    // "Others" sums everything past the limit; it is not a page or a referrer.
    const named = <K extends string>(rows: VisitsRows<K>['data'], key: K) =>
      rows.filter((row) => row[key] && row[key] !== 'Others')
    return {
      days,
      since: range.since,
      until: range.until,
      totals: { pageviews: count.data.pageviews ?? 0, visitors: count.data.visitors ?? 0 },
      daily,
      topPages: named(pages.data, 'requestPath').map((row) => ({
        path: row.requestPath,
        pageviews: row.pageviews,
        visitors: row.visitors,
      })),
      topReferrers: named(referrers.data, 'referrerHostname').map((row) => ({
        host: row.referrerHostname,
        pageviews: row.pageviews,
        visitors: row.visitors,
      })),
    }
  })
}

/* ------------------------------------------------------------------------------------------ */
/* Deployments                                                                                 */
/* ------------------------------------------------------------------------------------------ */

type ApiDeployment = {
  uid: string
  url?: string
  state?: string
  readyState?: string
  target?: string | null
  created?: number
  createdAt?: number
  ready?: number
  inspectorUrl?: string
  meta?: Record<string, string | undefined>
  creator?: { username?: string }
}

export type Deployment = {
  id: string
  url: string | null
  state: string
  target: 'production' | 'preview'
  createdAt: string
  /** Build time in seconds, when finished. */
  buildSeconds: number | null
  inspectorUrl: string | null
  branch: string | null
  commitMessage: string | null
  commitSha: string | null
  author: string | null
}

/** The latest deployments of the project (newest first). */
export async function latestDeployments(limit = 6): Promise<IntegrationResult<Deployment[]>> {
  const missing = missingEnv(...VERCEL_ENV)
  if (missing.length > 0) return { status: 'not-configured', missing }
  return settle(async () => {
    const { deployments } = await vercelGet<{ deployments: ApiDeployment[] }>(
      '/v6/deployments',
      { projectId: process.env.VERCEL_PROJECT_ID, limit },
      60,
    )
    return deployments.map((deployment) => {
      const created = deployment.createdAt ?? deployment.created ?? 0
      const meta = deployment.meta ?? {}
      return {
        id: deployment.uid,
        url: deployment.url ? `https://${deployment.url}` : null,
        state: (deployment.readyState ?? deployment.state ?? 'UNKNOWN').toUpperCase(),
        target: deployment.target === 'production' ? 'production' : 'preview',
        createdAt: new Date(created).toISOString(),
        buildSeconds:
          deployment.ready && created ? Math.round((deployment.ready - created) / 1000) : null,
        inspectorUrl: deployment.inspectorUrl ?? null,
        branch: meta.githubCommitRef ?? meta.gitlabCommitRef ?? meta.bitbucketCommitRef ?? null,
        commitMessage:
          meta.githubCommitMessage ??
          meta.gitlabCommitMessage ??
          meta.bitbucketCommitMessage ??
          null,
        commitSha: meta.githubCommitSha ?? meta.gitlabCommitSha ?? meta.bitbucketCommitSha ?? null,
        author: meta.githubCommitAuthorLogin ?? deployment.creator?.username ?? null,
      }
    })
  })
}
