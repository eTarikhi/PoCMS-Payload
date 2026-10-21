import type { JobTask } from './types'
import { brokenLinks } from './tasks/brokenLinks'
import { pagespeedReport } from './tasks/pagespeedReport'
import { publishScheduled } from './tasks/publishScheduled'
import { trashCleanup } from './tasks/trashCleanup'

/**
 * Every maintenance task, in the order the cron runner executes them (cheap first). Adding a task
 * means adding a file in `tasks/` and an entry here; the jobs collection options, the admin page
 * and the cron endpoint all read this list.
 */
export const TASKS: readonly JobTask[] = [
  trashCleanup,
  pagespeedReport,
  publishScheduled,
  brokenLinks,
]

export const TASK_SLUGS = TASKS.map((task) => task.slug)

export const taskBySlug = (slug: string | null | undefined): JobTask | undefined =>
  TASKS.find((task) => task.slug === slug)

/** ISO weekday (1 Monday … 7 Sunday) in UTC, the zone Vercel Cron schedules run in. */
export const isoWeekday = (date: Date): number => date.getUTCDay() || 7

/** Daily tasks run on every call; weekly ones only on their weekday. */
export const isDue = (task: JobTask, now: Date): boolean =>
  task.schedule === 'daily' || isoWeekday(now) === (task.weekday ?? 1)
