import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Sparkline } from '@/components/admin/elements/Sparkline'
import { relativeTime } from '@/components/admin/utilities/dates'
import type { PagespeedReport } from '@/payload-types'

import { PageSpeedRefresh } from './Refresh'

/**
 * The performance score of the stored Lighthouse runs (E4b), oldest to newest, with the last run's
 * date and the change over the window. The numbers are also written as text, so the sparkline can
 * stay decorative. "Run again" (Scheduled jobs capability) runs the report job, which stores a new
 * run and expires the page-speed cache.
 */
export async function StoredHistory({
  language,
  req,
  strategy,
  url,
}: {
  language: string
  req: PayloadRequest
  strategy: 'mobile' | 'desktop'
  /** The address the job stored: the site origin with a trailing slash. */
  url: string
}) {
  const { docs } = await req.payload.find({
    collection: 'pagespeed-reports',
    where: { and: [{ url: { equals: url } }, { strategy: { equals: strategy } }] },
    sort: '-fetchedAt',
    limit: 30,
    depth: 0,
    req,
    overrideAccess: false,
  })
  const reports = docs as PagespeedReport[]
  const canRun = hasCapability(req.user, 'manageJobs')

  if (reports.length === 0) {
    return (
      <section aria-label="Stored page speed runs" className="acn:flex acn:flex-col acn:gap-2">
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          No stored runs yet. The daily <strong>Page speed report</strong> job stores one for phones
          and desktops, so the dashboard can show a trend without asking Google on every visit.
        </p>
        {canRun ? <PageSpeedRefresh /> : null}
      </section>
    )
  }

  const scores = reports
    .map((report) => report.scores?.find((score) => score.key === 'performance')?.score)
    .filter((score): score is number => typeof score === 'number')
    .reverse() // oldest first for the chart
  const latest = reports[0]
  const newestScore = scores.at(-1)
  const oldestScore = scores.at(0)
  const change =
    scores.length > 1 && typeof newestScore === 'number' && typeof oldestScore === 'number'
      ? newestScore - oldestScore
      : null
  const best = scores.length > 0 ? Math.max(...scores) : null
  const worst = scores.length > 0 ? Math.min(...scores) : null

  return (
    <section aria-label="Stored page speed runs" className="acn:flex acn:flex-col acn:gap-2">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-x-3 acn:gap-y-1">
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          <span className="acn:font-medium acn:text-foreground">Performance over time</span> ·{' '}
          {scores.length} stored {scores.length === 1 ? 'run' : 'runs'} · last{' '}
          {relativeTime(latest.fetchedAt, language)}
        </p>
        {scores.length > 1 ? <Sparkline values={scores} /> : null}
      </div>
      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
        {typeof newestScore === 'number' ? `Now ${newestScore}` : 'No performance score'}
        {change !== null && change !== 0
          ? ` (${change > 0 ? '+' : ''}${change} over the window)`
          : ''}
        {best !== null && worst !== null && scores.length > 1
          ? `, best ${best}, worst ${worst}`
          : ''}
        {latest.lighthouseVersion ? `, Lighthouse ${latest.lighthouseVersion}` : ''}.
      </p>
      {canRun ? <PageSpeedRefresh /> : null}
    </section>
  )
}
