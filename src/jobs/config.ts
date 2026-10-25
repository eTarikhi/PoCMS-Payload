import { revalidatePath, revalidateTag } from 'next/cache'
import type { JobsConfig, Payload } from 'payload'

import { hasCapability } from '@/access/permissions'
import { capabilityAccess } from '@/access/roles'
import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

import {
  classifyJobStatus,
  hasCronBearerToken,
  mapJobDocsToSnapshot,
  REGISTERED_JOB_TASKS,
  type AdminJobRow,
  type JobRunState,
  type JobsSnapshot,
  type JobTaskMeta,
} from './shared'

export {
  classifyJobStatus,
  hasCronBearerToken,
  mapJobDocsToSnapshot,
  REGISTERED_JOB_TASKS,
  type AdminJobRow,
  type JobRunState,
  type JobsSnapshot,
  type JobTaskMeta,
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
