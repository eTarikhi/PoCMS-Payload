import type { Endpoint } from 'payload'

import { hasCapability } from '@/access/permissions'
import { collectJobsSnapshot, REGISTERED_JOB_TASKS } from '@/jobs/config'

const VALID_TASK_SLUGS = new Set(REGISTERED_JOB_TASKS.map((t) => t.slug))

/**
 * GET /api/admin-jobs — lists queued, scheduled, running, completed, failed, and canceled jobs.
 * POST /api/admin-jobs — queues a task, runs due jobs (or one job by ID), cancels a queued job, or deletes a job record.
 * Guarded by the `manageJobs` capability (ADR 0011).
 */
export const adminJobsEndpoints: Endpoint[] = [
  {
    path: '/admin-jobs',
    method: 'get',
    handler: async (req) => {
      if (!hasCapability(req.user, 'manageJobs')) {
        return Response.json(
          { error: 'Needs the Scheduled jobs permission.' },
          { status: 403 },
        )
      }
      const snapshot = await collectJobsSnapshot(req.payload, 60)
      return Response.json(snapshot)
    },
  },
  {
    path: '/admin-jobs',
    method: 'post',
    handler: async (req) => {
      if (!hasCapability(req.user, 'manageJobs')) {
        return Response.json(
          { error: 'Needs the Scheduled jobs permission.' },
          { status: 403 },
        )
      }

      const body = (await req.json?.().catch(() => ({}))) as {
        action?: 'queue' | 'run-due' | 'run-one' | 'cancel' | 'delete'
        task?: string
        queue?: string
        waitUntil?: string
        id?: number | string
        input?: Record<string, unknown>
      }

      const action = body?.action
      if (!action) {
        return Response.json({ error: 'Missing job action.' }, { status: 400 })
      }

      try {
        if (action === 'queue') {
          const task = body.task?.trim() ?? ''
          if (!VALID_TASK_SLUGS.has(task)) {
            return Response.json(
              { error: `Unknown task "${task}".` },
              { status: 400 },
            )
          }
          let waitUntilDate: Date | undefined
          if (body.waitUntil) {
            const parsed = new Date(body.waitUntil)
            if (Number.isNaN(parsed.getTime())) {
              return Response.json({ error: 'Invalid waitUntil timestamp.' }, { status: 400 })
            }
            waitUntilDate = parsed
          }

          const queued = await req.payload.jobs.queue({
            task: task as 'refreshSiteCache' | 'verifyContentHealth' | 'purgeCompletedJobs',
            input: (body.input ?? {}) as Record<string, never>,
            queue: body.queue?.trim() || 'default',
            ...(waitUntilDate ? { waitUntil: waitUntilDate } : {}),
            req,
          })

          req.payload.logger.info({
            msg: 'Admin job queued',
            task,
            user: req.user?.email,
          })

          const snapshot = await collectJobsSnapshot(req.payload, 60)
          return Response.json({ ok: true, jobId: queued.id, snapshot })
        }

        if (action === 'run-due') {
          const result = await req.payload.jobs.run({
            allQueues: true,
            limit: 15,
            req,
          })
          const snapshot = await collectJobsSnapshot(req.payload, 60)
          return Response.json({ ok: true, result, snapshot })
        }

        if (action === 'run-one') {
          if (body.id === undefined || body.id === null || body.id === '') {
            return Response.json({ error: 'Missing job id.' }, { status: 400 })
          }
          const result = await req.payload.jobs.runByID({
            id: body.id,
            req,
          })
          const snapshot = await collectJobsSnapshot(req.payload, 60)
          return Response.json({ ok: true, result, snapshot })
        }

        if (action === 'cancel') {
          if (body.id === undefined || body.id === null || body.id === '') {
            return Response.json({ error: 'Missing job id.' }, { status: 400 })
          }
          await req.payload.jobs.cancelByID({
            id: body.id,
            req,
          })
          const snapshot = await collectJobsSnapshot(req.payload, 60)
          return Response.json({ ok: true, snapshot })
        }

        if (action === 'delete') {
          if (body.id === undefined || body.id === null || body.id === '') {
            return Response.json({ error: 'Missing job id.' }, { status: 400 })
          }
          await req.payload.delete({
            collection: 'payload-jobs',
            id: body.id,
            overrideAccess: true,
            req,
          })
          const snapshot = await collectJobsSnapshot(req.payload, 60)
          return Response.json({ ok: true, snapshot })
        }

        return Response.json({ error: `Unsupported action "${String(action)}".` }, { status: 400 })
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Job operation failed.' },
          { status: 500 },
        )
      }
    },
  },
]
