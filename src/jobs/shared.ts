import type { RunTone } from '@/components/admin/elements/RunStatus'

/**
 * Isomorphic types, task metadata, and pure status classifiers shared between
 * server endpoints/widgets and `'use client'` admin views.
 *
 * IMPORTANT: Keep this file free of `next/cache`, `node:*`, and server-only imports
 * so Turbopack can safely bundle it into Client Components.
 */

export type JobRunState = 'queued' | 'scheduled' | 'running' | 'completed' | 'failed' | 'canceled'

export type JobTaskMeta = {
  slug: string
  label: string
  description: string
}

export type AdminJobRow = {
  id: number | string
  taskSlug: string
  taskLabel: string
  queue: string
  state: JobRunState
  totalTried: number
  waitUntil: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  errorMessage: string | null
  outputSummary: string | null
}

export type JobsSnapshot = {
  tasks: JobTaskMeta[]
  counts: Record<JobRunState, number>
  total: number
  jobs: AdminJobRow[]
}

export const JOB_STATE_DISPLAY: Record<JobRunState, [RunTone, string]> = {
  queued: ['running', 'Queued'],
  scheduled: ['muted', 'Scheduled'],
  running: ['running', 'Running'],
  completed: ['good', 'Completed'],
  failed: ['poor', 'Failed'],
  canceled: ['muted', 'Canceled'],
}

export const REGISTERED_JOB_TASKS: readonly JobTaskMeta[] = [
  {
    slug: 'refreshSiteCache',
    label: 'Refresh portfolio cache',
    description: 'Expires the portfolio data tag and revalidates cached public routes.',
  },
  {
    slug: 'verifyContentHealth',
    label: 'Audit content & SEO health',
    description:
      'Scans Articles, Projects, and Redirects for missing SEO descriptions or incomplete fields.',
  },
  {
    slug: 'purgeCompletedJobs',
    label: 'Clean up finished jobs',
    description: 'Removes completed job records older than 72 hours from payload-jobs.',
  },
  {
    slug: 'createDatabaseBackup',
    label: 'Encrypted cloud database backup',
    description:
      'Exports all public PostgreSQL tables & sequences as an AES-256-GCM encrypted archive into Vercel Blob with retention pruning.',
  },
] as const

/** Authenticates external cron runners (e.g. Vercel Cron) via `Authorization: Bearer <CRON_SECRET>`. */
export function hasCronBearerToken(req: { headers?: { get?: (name: string) => string | null } }): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = req.headers?.get?.('authorization')?.trim() ?? ''
  return header === `Bearer ${secret}`
}

/**
 * Classifies a `payload-jobs` document into a clear human-readable run state.
 * Note: Payload's `cancelByID` sets `hasError: true` with `error: { cancelled: true }`.
 */
export function classifyJobStatus(
  doc: {
    processing?: boolean | null
    hasError?: boolean | null
    error?: unknown
    completedAt?: string | null
    waitUntil?: string | null
  },
  nowMs: number = Date.now(),
): JobRunState {
  if (doc.processing) return 'running'
  if (doc.hasError) {
    const errObj =
      doc.error && typeof doc.error === 'object' ? (doc.error as Record<string, unknown>) : null
    if (errObj?.cancelled === true) return 'canceled'
    return 'failed'
  }
  if (doc.completedAt) return 'completed'
  if (doc.waitUntil) {
    const target = new Date(doc.waitUntil).getTime()
    if (!Number.isNaN(target) && target > nowMs) return 'scheduled'
  }
  return 'queued'
}

function extractJobError(error: unknown): string | null {
  if (!error) return null
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const rec = error as Record<string, unknown>
    if (rec.cancelled === true) return 'Canceled by user'
    if (typeof rec.message === 'string') return rec.message
    try {
      return JSON.stringify(error)
    } catch {
      return 'Task error'
    }
  }
  return String(error)
}

function extractLatestOutput(log: unknown): string | null {
  if (!Array.isArray(log) || log.length === 0) return null
  const last = log[log.length - 1] as Record<string, unknown> | undefined
  if (!last?.output) return null
  try {
    return JSON.stringify(last.output)
  } catch {
    return null
  }
}

export function mapJobDocsToSnapshot(
  docs: readonly Record<string, unknown>[],
  total: number = docs.length,
  nowMs: number = Date.now(),
): JobsSnapshot {
  const counts: Record<JobRunState, number> = {
    queued: 0,
    scheduled: 0,
    running: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
  }

  const labelBySlug = new Map(REGISTERED_JOB_TASKS.map((t) => [t.slug, t.label]))

  const jobs: AdminJobRow[] = docs.map((doc) => {
    const state = classifyJobStatus(
      {
        processing: Boolean(doc.processing),
        hasError: Boolean(doc.hasError),
        error: doc.error,
        completedAt: typeof doc.completedAt === 'string' ? doc.completedAt : null,
        waitUntil: typeof doc.waitUntil === 'string' ? doc.waitUntil : null,
      },
      nowMs,
    )
    counts[state] += 1

    const taskSlug =
      (typeof doc.taskSlug === 'string' && doc.taskSlug) ||
      (typeof doc.workflowSlug === 'string' && doc.workflowSlug) ||
      'inline'

    return {
      id: (doc.id as number | string) ?? '',
      taskSlug,
      taskLabel: labelBySlug.get(taskSlug) ?? taskSlug,
      queue: typeof doc.queue === 'string' && doc.queue ? doc.queue : 'default',
      state,
      totalTried: typeof doc.totalTried === 'number' ? doc.totalTried : 0,
      waitUntil: typeof doc.waitUntil === 'string' ? doc.waitUntil : null,
      completedAt: typeof doc.completedAt === 'string' ? doc.completedAt : null,
      createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : new Date(nowMs).toISOString(),
      updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date(nowMs).toISOString(),
      errorMessage: extractJobError(doc.error),
      outputSummary: extractLatestOutput(doc.log),
    }
  })

  return {
    tasks: [...REGISTERED_JOB_TASKS],
    counts,
    total,
    jobs,
  }
}
