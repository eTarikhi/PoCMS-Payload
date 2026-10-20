import type { Payload, Where } from 'payload'

import { publicSite } from '@/integrations/site'
import type { JobRun, User } from '@/payload-types'

import { isDue, taskBySlug, TASKS } from './registry'
import { STALE_RUN_MS, type JobTask, type JobTrigger } from './types'

/** The public origin tasks crawl (null while the site only exists on localhost). */
export const siteOrigin = (): string | null => {
  const site = publicSite()
  return site.status === 'ok' ? site.origin : null
}

const ACTIVE: JobRun['status'][] = ['queued', 'running']
const LOG_LIMIT = 20_000

const finished = (startedAt: Date) => Date.now() - startedAt.getTime()

/** A queued or running job for the same task, younger than the stale window. */
async function findActive(payload: Payload, task: string): Promise<JobRun | null> {
  const { docs } = await payload.find({
    collection: 'job-runs',
    where: {
      and: [
        { task: { equals: task } },
        { status: { in: ACTIVE } },
        { createdAt: { greater_than: new Date(Date.now() - STALE_RUN_MS).toISOString() } },
      ],
    },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (docs[0] as JobRun | undefined) ?? null
}

/** Jobs whose function died (a deploy, a timeout): marked failed so the queue moves on. */
async function expireStale(payload: Payload, log: (line: string) => void): Promise<void> {
  const { docs } = await payload.find({
    collection: 'job-runs',
    where: {
      and: [
        { status: { in: ACTIVE } },
        { createdAt: { less_than: new Date(Date.now() - STALE_RUN_MS).toISOString() } },
      ],
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  for (const job of docs as JobRun[]) {
    await payload.update({
      collection: 'job-runs',
      id: job.id,
      data: {
        status: 'failed',
        error: `No update for ${Math.round(STALE_RUN_MS / 60_000)} minutes; the function running it stopped (a deploy, a timeout or a crash).`,
        finishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    log(`Expired stale run ${job.id} (${job.task}, ${job.status}).`)
  }
}

export type QueueOutcome =
  | { status: 'queued'; job: JobRun }
  | { status: 'busy'; job: JobRun }
  | { status: 'unknown-task' }
  | { status: 'needs-env'; task: JobTask; missing: string[] }

/** Adds one task to the queue, unless the same task is already queued or running. */
export async function queueJob(
  payload: Payload,
  { task, trigger, user }: { task: string; trigger: JobTrigger; user?: Pick<User, 'id'> | null },
): Promise<QueueOutcome> {
  const definition = taskBySlug(task)
  if (!definition) return { status: 'unknown-task' }
  const missing = (definition.needs ?? []).filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) return { status: 'needs-env', task: definition, missing }

  const active = await findActive(payload, task)
  if (active) return { status: 'busy', job: active }

  const job = (await payload.create({
    collection: 'job-runs',
    data: {
      task: task as JobRun['task'],
      status: 'queued',
      trigger,
      startedAt: new Date().toISOString(),
      ...(user ? { startedBy: user.id } : {}),
    },
    overrideAccess: true,
  })) as JobRun
  return { status: 'queued', job }
}

/** Queues every task that is due now (daily tasks, weekly tasks on their weekday). */
export async function queueDueJobs(
  payload: Payload,
  now = new Date(),
): Promise<{ queued: JobRun[]; skipped: { task: string; why: string }[] }> {
  const queued: JobRun[] = []
  const skipped: { task: string; why: string }[] = []
  for (const task of TASKS) {
    if (!isDue(task, now)) {
      skipped.push({
        task: task.slug,
        why: `runs on ${task.schedule === 'weekly' ? 'its weekday' : 'every call'}`,
      })
      continue
    }
    const outcome = await queueJob(payload, { task: task.slug, trigger: 'cron' })
    if (outcome.status === 'queued') queued.push(outcome.job)
    else if (outcome.status === 'busy')
      skipped.push({
        task: task.slug,
        why: `already ${outcome.job.status} (run ${outcome.job.id})`,
      })
    else if (outcome.status === 'needs-env')
      skipped.push({ task: task.slug, why: `needs ${outcome.missing.join(', ')}` })
    else skipped.push({ task: task.slug, why: 'unknown task' })
  }
  return { queued, skipped }
}

/** Runs one queued job and records the outcome. */
export async function runJob(payload: Payload, job: JobRun): Promise<JobRun> {
  const task = taskBySlug(job.task)
  const startedAt = new Date()
  const lines: string[] = []
  const log = (line: string) => {
    lines.push(line)
    if (lines.length > 300) lines.shift()
  }
  const finish = async (data: Partial<JobRun>) =>
    (await payload.update({
      collection: 'job-runs',
      id: job.id,
      data: {
        log: lines.join('\n').slice(-LOG_LIMIT),
        finishedAt: new Date().toISOString(),
        durationMs: finished(startedAt),
        ...data,
      },
      overrideAccess: true,
    })) as JobRun

  if (!task) {
    log(`No task registered as "${job.task}".`)
    return finish({ status: 'failed', error: `Unknown task "${job.task}".` })
  }

  await payload.update({
    collection: 'job-runs',
    id: job.id,
    data: { status: 'running', startedAt: startedAt.toISOString() },
    overrideAccess: true,
  })

  try {
    log(`${task.label}: started (trigger: ${job.trigger}).`)
    const outcome = await task.run({ payload, log, siteURL: siteOrigin() })
    log(`Finished: ${outcome.summary}`)
    return await finish({
      status: 'done',
      summary: outcome.summary,
      details: (outcome.details ?? {}) as JobRun['details'],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`Failed: ${message}`)
    return await finish({ status: 'failed', error: message })
  }
}

/**
 * Drains the queue: queued jobs in creation order, one at a time. A job cancelled between the
 * queue call and its turn is skipped, which is what Cancel on the jobs page does.
 */
export async function runQueue(
  payload: Payload,
  { only }: { only?: string } = {},
): Promise<{ ran: JobRun[]; skipped: { id: number; why: string }[] }> {
  const log = (_line: string) => {}
  await expireStale(payload, log)
  const where: Where = { status: { equals: 'queued' } }
  const { docs } = await payload.find({
    collection: 'job-runs',
    where: only ? { and: [where, { task: { equals: only } }] } : where,
    sort: 'createdAt',
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  const ran: JobRun[] = []
  const skipped: { id: number; why: string }[] = []
  for (const job of docs as JobRun[]) {
    const current = (await payload.findByID({
      collection: 'job-runs',
      id: job.id,
      depth: 0,
      overrideAccess: true,
    })) as JobRun
    if (current.status !== 'queued') {
      skipped.push({ id: job.id, why: `status is ${current.status}` })
      continue
    }
    ran.push(await runJob(payload, current))
  }
  return { ran, skipped }
}
