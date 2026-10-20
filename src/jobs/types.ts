/**
 * Scheduled maintenance jobs (CR-12 item E4): the task registry, the queue in the `jobs` collection
 * and the runner both the admin page and Vercel Cron call.
 *
 * A task is a plain async function with a schedule; the runner records every attempt as a `jobs`
 * document (status, duration, summary, log) so the admin can show what ran and what failed. There is
 * no separate worker: the HTTP request that triggers a batch (the daily cron call or "Run now")
 * executes the queue and the function's own time limit bounds a run (`docs/deployment.md`).
 */
import type { Payload } from 'payload'

export type JobTrigger = 'manual' | 'cron'

/** Collects the lines the job page shows under the run. */
export type JobLogger = (line: string) => void

export type JobContext = {
  payload: Payload
  log: JobLogger
  /** Public site origin (NEXT_PUBLIC_SITE_URL or Vercel's production domain), null when local. */
  siteURL: string | null
}

export type JobOutcome = {
  /** One sentence for the runs table. */
  summary: string
  /** Task-specific numbers (counts, broken links) for the run's detail view. */
  details?: Record<string, unknown>
}

export type JobTask = {
  slug: string
  label: string
  description: string
  /** `daily` runs on every cron call; `weekly` only on its weekday (UTC). */
  schedule: 'daily' | 'weekly'
  /** ISO weekday for weekly tasks: 1 Monday … 7 Sunday (0 also means Sunday). */
  weekday?: number
  /** Environment variables without which the task cannot do its work (shown on the job page). */
  needs?: readonly string[]
  /** How long a run usually takes, for the job page. */
  estimate: string
  run: (context: JobContext) => Promise<JobOutcome>
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

/** A run is stale when nothing has updated it for this long (a killed function, a redeploy). */
export const STALE_RUN_MS = 15 * 60 * 1000
