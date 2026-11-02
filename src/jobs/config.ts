import { revalidatePath, revalidateTag } from 'next/cache'
import type { JobsConfig, Payload } from 'payload'

import { hasCapability } from '@/access/permissions'
import { capabilityAccess } from '@/access/roles'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'
import { auditContentHealth } from '@/lib/contentHealth'
import { consolidateLegacyMediaUrls } from '@/lib/legacyMediaConsolidation'
import {
  executePayloadSql,
  qualifiedPayloadTable,
  resolvePayloadPoolClient,
  resolvePayloadSchemaName,
} from '@/lib/payloadSql'
import { partitionAuditLogsByMonth } from '@/lib/phase2And3SqlOptimizations'
import { pruneContentVersions } from '@/lib/versionRetention'
import { DEFAULT_RETENTION_KEEP_PER_DOC } from '@/lib/versionRetentionShared'

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
        for (const tag of Object.values(CACHE_TAGS)) {
          revalidateTag(tag, { expire: 0 })
        }
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
      { name: 'draftBacklogCount', type: 'number' },
      { name: 'orphanedMediaCount', type: 'number' },
      { name: 'redirectChains', type: 'number' },
      { name: 'redirectLoops', type: 'number' },
    ],
    handler: async ({ req }) => {
      const report = await auditContentHealth(req.payload, req)

      return {
        output: {
          checkedAt: report.checkedAt,
          articles: report.articlesTotal,
          projects: report.projectsTotal,
          redirects: report.redirectsTotal,
          missingSeoDescriptions:
            report.missingArticleSeoDescriptions + report.missingProjectSeoDescriptions,
          draftBacklogCount: report.draftBacklogCount,
          orphanedMediaCount: report.orphanedMediaCount,
          redirectChains: report.redirectChainCount,
          redirectLoops: report.redirectLoopCount,
        },
      }
    },
  },
  {
    slug: 'consolidateLegacyMediaUrls',
    label: 'Consolidate legacy media URLs',
    retries: 1,
    outputSchema: [
      { name: 'completedAt', type: 'text' },
      { name: 'scannedArticles', type: 'number' },
      { name: 'migratedArticles', type: 'number' },
      { name: 'scannedProjects', type: 'number' },
      { name: 'migratedProjects', type: 'number' },
      { name: 'skippedCount', type: 'number' },
    ],
    handler: async ({ req }) => {
      const summary = await consolidateLegacyMediaUrls({ payload: req.payload, req })
      if (summary.migratedArticles > 0 || summary.migratedProjects > 0) {
        try {
          revalidateTag(CACHE_TAGS.all, { expire: 0 })
          revalidateTag(CACHE_TAGS.articles, { expire: 0 })
          revalidateTag(CACHE_TAGS.projects, { expire: 0 })
          revalidateTag(CACHE_TAGS.home, { expire: 0 })
        } catch {
          // Safe outside Next.js request context.
        }
      }
      return { output: summary }
    },
  },
  {
    slug: 'purgeExpiredSessions',
    label: 'Purge expired user sessions',
    retries: 0,
    schedule: [
      {
        cron: '15 3 * * *',
        queue: 'default',
      },
    ],
    outputSchema: [
      { name: 'deletedCount', type: 'number' },
      { name: 'purgedAt', type: 'text' },
    ],
    handler: async ({ req }) => {
      const purgedAt = new Date().toISOString()
      const sessionsTable = qualifiedPayloadTable(req.payload, 'users_sessions')
      const sqlRes = await executePayloadSql(
        req.payload,
        `DELETE FROM ${sessionsTable} WHERE "expires_at" < $1::timestamptz`,
        [purgedAt],
        req,
      )
      return {
        output: {
          deletedCount: sqlRes?.rowCount ?? 0,
          purgedAt,
        },
      }
    },
  },
  {
    slug: 'purgeCompletedJobs',
    label: 'Clean up finished jobs',
    retries: 0,
    schedule: [
      {
        cron: '30 3 * * *',
        queue: 'default',
      },
    ],
    inputSchema: [
      { name: 'olderThanDays', type: 'number', defaultValue: 14 },
      { name: 'olderThanHours', type: 'number', defaultValue: 336 },
    ],
    outputSchema: [
      { name: 'deletedCount', type: 'number' },
      { name: 'orphanLogDeletedCount', type: 'number' },
      { name: 'cutoffIso', type: 'text' },
    ],
    handler: async ({ input, req }) => {
      const rec = (input ?? {}) as Record<string, unknown>
      const hours =
        typeof rec.olderThanHours === 'number' && rec.olderThanHours > 0
          ? rec.olderThanHours
          : typeof rec.olderThanDays === 'number' && rec.olderThanDays > 0
            ? rec.olderThanDays * 24
            : 14 * 24
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

      const jobsTable = qualifiedPayloadTable(req.payload, 'payload_jobs')
      const logsTable = qualifiedPayloadTable(req.payload, 'payload_jobs_log')
      const orphanLogsRes = await executePayloadSql(
        req.payload,
        `DELETE FROM ${logsTable} l
         WHERE NOT EXISTS (
           SELECT 1 FROM ${jobsTable} j WHERE j."id" = l."_parent_id"
         )`,
        [],
        req,
      )

      return {
        output: {
          deletedCount: deleted.docs.length,
          orphanLogDeletedCount: orphanLogsRes?.rowCount ?? 0,
          cutoffIso: cutoff,
        },
      }
    },
  },
  {
    slug: 'pruneDocumentVersions',
    label: 'Prune old document versions',
    retries: 0,
    schedule: [
      {
        cron: '0 4 * * *',
        queue: 'default',
      },
    ],
    inputSchema: [
      {
        name: 'keepLatestPerDoc',
        type: 'number',
        defaultValue: DEFAULT_RETENTION_KEEP_PER_DOC,
      },
      { name: 'maxAgeDays', type: 'number' },
      { name: 'pruneAutosaveSnapshots', type: 'checkbox', defaultValue: true },
    ],
    outputSchema: [
      { name: 'executedAt', type: 'text' },
      { name: 'totalScanned', type: 'number' },
      { name: 'totalProtected', type: 'number' },
      { name: 'totalDeleted', type: 'number' },
      { name: 'articlesDeleted', type: 'number' },
      { name: 'projectsDeleted', type: 'number' },
    ],
    handler: async ({ input, req }) => {
      const report = await pruneContentVersions({
        payload: req.payload,
        policy: {
          keepLatestPerDoc:
            typeof input?.keepLatestPerDoc === 'number'
              ? input.keepLatestPerDoc
              : DEFAULT_RETENTION_KEEP_PER_DOC,
          maxAgeDays:
            typeof input?.maxAgeDays === 'number' && input.maxAgeDays > 0
              ? input.maxAgeDays
              : null,
          pruneAutosaveSnapshots: input?.pruneAutosaveSnapshots !== false,
        },
        dryRun: false,
        req,
      })

      const articlesDeleted =
        report.collections.find((c) => c.collection === 'articles')?.deletedVersions ?? 0
      const projectsDeleted =
        report.collections.find((c) => c.collection === 'projects')?.deletedVersions ?? 0

      return {
        output: {
          executedAt: report.executedAt,
          totalScanned: report.totalScanned,
          totalProtected: report.totalProtected,
          totalDeleted: report.totalDeleted,
          articlesDeleted,
          projectsDeleted,
        },
      }
    },
  },
  {
    slug: 'maintainAuditLogPartitions',
    label: 'Maintain audit log partitions',
    retries: 0,
    schedule: [
      {
        cron: '5 0 1 * *',
        queue: 'default',
      },
    ],
    inputSchema: [
      { name: 'monthsAhead', type: 'number', defaultValue: 3 },
      { name: 'retentionMonths', type: 'number', defaultValue: 12 },
    ],
    outputSchema: [
      { name: 'convertedFromHeap', type: 'checkbox' },
      { name: 'ensuredCount', type: 'number' },
      { name: 'droppedCount', type: 'number' },
    ],
    handler: async ({ input, req }) => {
      const client = resolvePayloadPoolClient(req.payload)
      if (!client) {
        return {
          output: {
            convertedFromHeap: false,
            ensuredCount: 0,
            droppedCount: 0,
          },
        }
      }

      const rec = (input ?? {}) as Record<string, unknown>
      const monthsAhead =
        typeof rec.monthsAhead === 'number' && rec.monthsAhead >= 1 ? rec.monthsAhead : 3
      const envRetention = Number.parseInt(process.env.AUDIT_LOG_RETENTION_MONTHS ?? '', 10)
      const retentionMonths =
        typeof rec.retentionMonths === 'number' && rec.retentionMonths > 0
          ? rec.retentionMonths
          : Number.isFinite(envRetention) && envRetention > 0
            ? envRetention
            : 12

      const summary = await partitionAuditLogsByMonth(client, {
        schemaName: resolvePayloadSchemaName(req.payload),
        monthsAhead,
        retentionMonths,
      })

      return {
        output: {
          convertedFromHeap: summary.convertedFromHeap,
          ensuredCount: summary.ensuredPartitions.length,
          droppedCount: summary.droppedExpiredPartitions.length,
        },
      }
    },
  },
]

export function createJobsConfig(
  env: Record<string, string | undefined> = process.env,
): JobsConfig {
  const enableAutoRun = env.PAYLOAD_JOBS_AUTORUN === 'true' && env.NODE_ENV !== 'test'
  return {
    deleteJobOnComplete: false,
    addParentToTaskLog: true,
    ...(enableAutoRun
      ? {
          autoRun: [
            {
              cron: '*/5 * * * *',
              limit: 25,
              allQueues: true,
            },
          ],
        }
      : {}),
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
