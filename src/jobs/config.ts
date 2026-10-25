import { revalidatePath, revalidateTag } from 'next/cache'
import type { JobsConfig, Payload, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import { capabilityAccess } from '@/access/roles'
import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

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
] as const

/** Authenticates external cron runners (e.g. Vercel Cron) via `Authorization: Bearer <CRON_SECRET>`. */
export function hasCronBearerToken(req: Pick<PayloadRequest, 'headers'>): boolean {
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
    const errObj = doc.error && typeof doc.error === 'object' ? (doc.error as Record<string, unknown>) : null
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

export async function collectJobsSnapshot(payload: Payload, limit = 50): Promise<JobsSnapshot> {
  try {
    const res = await payload.find({
      collection: 'payload-jobs',
      sort: '-createdAt',
      limit,
      depth: 0,
      overrideAccess: true,
    })
    return mapJobDocsToSnapshot(
      res.docs as unknown as Record<string, unknown>[],
      res.totalDocs,
    )
  } catch {
    return mapJobDocsToSnapshot([], 0)
  }
}

const tasks: NonNullable<JobsConfig['tasks']> = [
  {
    slug: 'refreshSiteCache',
    label: 'Refresh portfolio cache',
    retries: 1,
    outputSchema: [
      { name: 'refreshedAt', type: 'text' },
      { name: 'tag', type: 'text' },
    ],
    handler: async () => {
      try {
        revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 })
        revalidatePath('/', 'layout')
      } catch {
        // Safe outside Next.js request context (e.g. CLI test runner).
      }
      return {
        output: {
          refreshedAt: new Date().toISOString(),
          tag: PORTFOLIO_CACHE_TAG,
        },
      }
    },
  },
  {
    slug: 'verifyContentHealth',
    label: 'Audit content & SEO health',
    retries: 1,
    outputSchema: [
      { name: 'checkedAt', type: 'text' },
      { name: 'articles', type: 'number' },
      { name: 'projects', type: 'number' },
      { name: 'redirects', type: 'number' },
      { name: 'missingSeoDescriptions', type: 'number' },
    ],
    handler: async ({ req }) => {
      const [articles, projects, redirects] = await Promise.all([
        req.payload.find({ collection: 'articles', pagination: false, depth: 0, req }),
        req.payload.find({ collection: 'projects', pagination: false, depth: 0, req }),
        req.payload.find({ collection: 'redirects', pagination: false, depth: 0, req }),
      ])

      const missingArticleSeo = articles.docs.filter(
        (doc) => !doc.meta?.description?.trim() && !doc.excerpt?.trim(),
      ).length
      const missingProjectSeo = projects.docs.filter(
        (doc) => !doc.meta?.description?.trim() && !doc.excerpt?.trim(),
      ).length

      return {
        output: {
          checkedAt: new Date().toISOString(),
          articles: articles.totalDocs,
          projects: projects.totalDocs,
          redirects: redirects.totalDocs,
          missingSeoDescriptions: missingArticleSeo + missingProjectSeo,
        },
      }
    },
  },
  {
    slug: 'purgeCompletedJobs',
    label: 'Clean up finished jobs',
    retries: 0,
    inputSchema: [{ name: 'olderThanHours', type: 'number', defaultValue: 72 }],
    outputSchema: [
      { name: 'deletedCount', type: 'number' },
      { name: 'cutoffIso', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const hours =
        typeof input?.olderThanHours === 'number' && input.olderThanHours > 0
          ? input.olderThanHours
          : 72
      const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString()
      const deleted = await req.payload.delete({
        collection: 'payload-jobs',
        overrideAccess: true,
        req,
        where: {
          and: [
            { completedAt: { less_than: cutoff } },
            { processing: { equals: false } },
          ],
        },
      })
      return {
        output: {
          deletedCount: deleted.docs.length,
          cutoffIso: cutoff,
        },
      }
    },
  },
]

export function createJobsConfig(): JobsConfig {
  return {
    deleteJobOnComplete: false,
    addParentToTaskLog: true,
    access: {
      queue: ({ req }) => hasCapability(req.user, 'manageJobs'),
      run: ({ req }) => hasCapability(req.user, 'manageJobs') || hasCronBearerToken(req),
      cancel: ({ req }) => hasCapability(req.user, 'manageJobs'),
    },
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      custom: {
        ...(defaultJobsCollection.custom ?? {}),
        permissions: false,
        auditLog: false,
      },
      access: {
        ...defaultJobsCollection.access,
        read: capabilityAccess('manageJobs'),
        delete: capabilityAccess('manageJobs'),
      },
    }),
    tasks,
  }
}
