import { timingSafeEqual } from 'node:crypto'

import { revalidatePath, revalidateTag } from 'next/cache'
import type { Endpoint, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import type { JobRun } from '@/payload-types'

import { taskBySlug } from '@/jobs/registry'
import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'
import { queueDueJobs, queueJob, runQueue } from '@/jobs/runner'

/**
 * JobRun endpoints (E4). Payload mounts these under `/api`:
 *
 * - `POST /api/jobs/run`      signed in + Scheduled jobs capability. `{ task }` or `?task=`.
 *                             Queues the task and runs the queue now (the admin's "Run now").
 * - `POST /api/jobs/cancel`   signed in + Scheduled jobs capability. `{ id }`: a queued run is
 *                             cancelled before its turn; a running one returns 409 (a function
 *                             cannot be interrupted safely).
 * - `GET  /api/jobs/cron`     Vercel Cron, `Authorization: Bearer $CRON_SECRET` (or
 *                             `x-cron-secret`). Queues the tasks due today and drains the queue.
 *                             Without CRON_SECRET it answers 503: it never runs unauthenticated.
 */

const json = (data: unknown, status = 200) => Response.json(data, { status })

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const data = await req.json?.()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Expires the caches a finished task changes.
 *
 * The Page speed report stores its own runs, but the live lab test on the widget is cached for a
 * day: expiring the tag makes the next render run Lighthouse again, which is what "Run again" means.
 *
 * Scheduled publishing changes what the public site shows, and it runs outside a document hook — the
 * collection hooks do call `revalidatePortfolio`, but there is no request store in a job, so those
 * calls log and do nothing. Here the endpoint *is* a request, so the tag and the affected article
 * paths are expired explicitly.
 */
function refreshTaskCaches(job: JobRun) {
  try {
    if (job.task === 'pagespeed-report') revalidateTag('pagespeed', { expire: 0 })
    if (job.task === 'publish-scheduled') {
      revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 })
      revalidatePath('/')
      for (const slug of publishedSlugs(job)) revalidatePath(`/articles/${slug}`)
    }
  } catch {
    // Not in a request (integration tests): the cached value expires on its own.
  }
}

/** Slugs a finished publish run reported, from its `details`. */
function publishedSlugs(job: JobRun): string[] {
  const details = job.details as { published?: unknown } | null | undefined
  return Array.isArray(details?.published)
    ? details.published.filter((slug): slug is string => typeof slug === 'string')
    : []
}

const publicJob = (job: JobRun) => ({
  id: job.id,
  task: job.task,
  status: job.status,
  trigger: job.trigger,
  summary: job.summary ?? null,
  error: job.error ?? null,
  durationMs: job.durationMs ?? null,
  createdAt: job.createdAt,
})

/** Constant-time comparison, so the secret cannot be guessed by timing the answer. */
function cronSecretMatches(header: string | null, fallback: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  const given = header?.startsWith('Bearer ') ? header.slice(7).trim() : (fallback?.trim() ?? '')
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const jobsRunEndpoint: Endpoint = {
  path: '/jobs/run',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageJobs'))
      return json({ error: 'Needs the Scheduled jobs permission.' }, 403)

    const data = await body(req)
    const task = String(data.task ?? req.searchParams.get('task') ?? '')
    if (!taskBySlug(task)) return json({ error: 'Unknown task.' }, 400)

    const queued = await queueJob(req.payload, { task, trigger: 'manual', user: req.user })
    if (queued.status === 'unknown-task') return json({ error: 'Unknown task.' }, 400)
    if (queued.status === 'needs-env')
      return json(
        {
          error: `${queued.task.label} needs ${queued.missing.join(', ')}.`,
          missing: queued.missing,
        },
        409,
      )
    if (queued.status === 'busy')
      return json(
        {
          error: `Already ${queued.job.status}: run ${queued.job.id}.`,
          job: publicJob(queued.job),
        },
        409,
      )

    req.payload.logger.info({ msg: `JobRun queued: ${task}`, user: req.user?.email })
    const { ran } = await runQueue(req.payload, { only: task })
    const job = ran.find((candidate) => candidate.id === queued.job.id) ?? queued.job
    if (job.status === 'done') refreshTaskCaches(job)
    return json({ job: publicJob(job) }, job.status === 'failed' ? 500 : 200)
  },
}

export const jobsCancelEndpoint: Endpoint = {
  path: '/jobs/cancel',
  method: 'post',
  handler: async (req) => {
    if (!hasCapability(req.user, 'manageJobs'))
      return json({ error: 'Needs the Scheduled jobs permission.' }, 403)

    const data = await body(req)
    const id = Number(data.id ?? req.searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'Give the run id.' }, 400)

    const job = (await req.payload
      .findByID({ collection: 'job-runs', id, depth: 0, overrideAccess: true })
      .catch(() => null)) as JobRun | null
    if (!job) return json({ error: 'No such run.' }, 404)
    if (job.status !== 'queued')
      return json({ error: `Run ${id} is ${job.status}; only queued runs can be cancelled.` }, 409)

    const cancelled = (await req.payload.update({
      collection: 'job-runs',
      id,
      data: {
        status: 'cancelled',
        summary: 'Cancelled before it started.',
        finishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })) as JobRun
    req.payload.logger.info({ msg: `JobRun cancelled: ${id}`, user: req.user?.email })
    return json({ job: publicJob(cancelled) })
  },
}

export const jobsCronEndpoint: Endpoint = {
  path: '/jobs/cron',
  method: 'get',
  handler: async (req) => {
    if (!process.env.CRON_SECRET?.trim())
      return json(
        {
          error:
            'CRON_SECRET is not set, so scheduled runs are disabled. Add it to the environment (and to Vercel) to enable them.',
        },
        503,
      )
    if (!cronSecretMatches(req.headers.get('authorization'), req.headers.get('x-cron-secret')))
      return json({ error: 'Not allowed.' }, 401)

    const only = req.searchParams.get('task')
    if (only) {
      if (!taskBySlug(only)) return json({ error: 'Unknown task.' }, 400)
      await queueJob(req.payload, { task: only, trigger: 'cron' })
    }
    const { queued, skipped } = await queueDueJobs(req.payload)
    const { ran } = await runQueue(req.payload)
    for (const job of ran) if (job.status === 'done') refreshTaskCaches(job)
    req.payload.logger.info({
      msg: 'Scheduled jobs ran',
      queued: queued.map((job) => job.id),
      ran: ran.map((job) => job.id),
    })
    return json({
      queued: queued.map(publicJob),
      ran: ran.map(publicJob),
      skipped,
    })
  },
}
