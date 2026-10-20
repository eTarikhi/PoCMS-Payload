import { googleFailure, runPageSpeed, type LabRun } from '@/integrations/google'

import type { JobTask } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
/** Reports kept: a quarter of daily runs, so the trend has history without growing forever. */
const KEEP_DAYS = 90

/** Type keys of the report's arrays, for `pnpm generate:types` and the widget. */
export type StoredScore = {
  key: string
  label: string
  score: number | null
  rating: string | null
}
export type StoredMetric = {
  name: string
  label: string
  display: string
  value: number | null
  rating: string | null
}

const performance = (run: LabRun) => run.scores.find((score) => score.key === 'performance')

/**
 * Runs Lighthouse through PageSpeed Insights for phones and desktops in parallel (~20–50 s
 * together) and stores both runs in `pagespeed-reports`. The Page speed widget reads the newest
 * report and its history (`E4b`), so the dashboard keeps a trend with no call to Google.
 *
 * Needs GOOGLE_API_KEY with the PageSpeed Insights API enabled, and a public site address (a local
 * one can't be reached from Google's servers).
 */
export const pagespeedReport: JobTask = {
  slug: 'pagespeed-report',
  label: 'Page speed report',
  description:
    'Runs Lighthouse for phones and desktops on the public site and stores the scores, for the Page speed widget and its history.',
  schedule: 'daily',
  needs: ['GOOGLE_API_KEY'],
  estimate: '20–50 s',
  async run({ payload, log, siteURL }) {
    if (!siteURL)
      throw new Error(
        'No public site address: set NEXT_PUBLIC_SITE_URL (a localhost address cannot be tested).',
      )
    log(`Testing ${siteURL} with Lighthouse (phones and desktops, in parallel).`)
    const started = Date.now()
    let runs: LabRun[]
    try {
      runs = await Promise.all([runPageSpeed(siteURL, 'mobile'), runPageSpeed(siteURL, 'desktop')])
    } catch (error) {
      const failure = googleFailure(error, 'pagespeed', siteURL)
      throw new Error(failure.message)
    }
    for (const run of runs) {
      const score = performance(run)
      log(
        `${run.strategy}: performance ${score?.score ?? '–'}, ${run.metrics
          .slice(0, 2)
          .map((metric) => `${metric.name} ${metric.display}`)
          .join(', ')}`,
      )
      await payload.create({
        collection: 'pagespeed-reports',
        overrideAccess: true,
        data: {
          url: run.url,
          strategy: run.strategy,
          fetchedAt: run.fetchedAt,
          lighthouseVersion: run.lighthouseVersion ?? undefined,
          scores: run.scores.map((item) => ({
            key: item.key,
            label: item.label,
            score: item.score,
            rating: item.rating,
          })),
          metrics: run.metrics.map((item) => ({
            name: item.name,
            label: item.label,
            display: item.display,
            value: item.value,
            rating: item.rating,
          })),
        },
      })
    }

    // Prune old reports, keeping the history bounded.
    const cutoff = new Date(Date.now() - KEEP_DAYS * DAY_MS).toISOString()
    const pruned = await payload.delete({
      collection: 'pagespeed-reports',
      where: { createdAt: { less_than: cutoff } },
      overrideAccess: true,
    })
    if (pruned.docs.length > 0)
      log(`Removed ${pruned.docs.length} report(s) older than ${KEEP_DAYS} days.`)

    const mobile = performance(runs[0])
    const desktop = performance(runs[1])
    return {
      summary: `Performance ${mobile?.score ?? '–'} on phones and ${desktop?.score ?? '–'} on desktops (${Math.round((Date.now() - started) / 1000)} s).`,
      details: {
        url: siteURL,
        lighthouseVersion: runs[0]?.lighthouseVersion ?? null,
        runs: runs.map((run) => ({
          strategy: run.strategy,
          performance: performance(run)?.score ?? null,
          scores: run.scores,
          metrics: run.metrics.map((metric) => ({ name: metric.name, display: metric.display })),
        })),
      },
    }
  },
}
