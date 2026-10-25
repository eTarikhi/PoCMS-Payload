import Link from 'next/link'
import type { WidgetServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { relativeTime } from '@/components/admin/utilities/dates'
import { collectJobsSnapshot } from '@/jobs/config'
import { JOB_STATE_DISPLAY, type JobsSnapshot } from '@/jobs/shared'

export { JOB_STATE_DISPLAY }

/**
 * Dashboard widget for `manageJobs`: summary counts + latest background/scheduled jobs.
 */
export async function ScheduledJobsWidget({ req, user }: WidgetServerProps) {
  const title = 'Scheduled jobs'
  const description = 'Payload job queue activity and upcoming tasks.'
  if (!hasCapability(user, 'manageJobs')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="Scheduled jobs" state="forbidden" />
      </WidgetCard>
    )
  }

  const snapshot = await collectJobsSnapshot(req.payload, 6)
  return (
    <ScheduledJobsSummaryView
      snapshot={snapshot}
      adminRoute={req.payload.config.routes.admin}
      language={req.i18n.language}
    />
  )
}

export function ScheduledJobsSummaryView({
  snapshot,
  adminRoute = '/admin',
  language = 'en',
}: {
  snapshot: JobsSnapshot
  adminRoute?: string
  language?: string
}) {
  const pendingCount = snapshot.counts.queued + snapshot.counts.scheduled + snapshot.counts.running

  return (
    <WidgetCard
      title="Scheduled jobs"
      description={`${pendingCount} pending · ${snapshot.counts.completed} completed · ${snapshot.counts.failed} failed`}
      action={
        <Link
          href={`${adminRoute}/jobs`}
          className="acn:text-xs acn:font-medium acn:text-muted-foreground acn:underline-offset-4 acn:hover:text-foreground acn:hover:underline"
        >
          Manage →
        </Link>
      }
    >
      {snapshot.jobs.length === 0 ? (
        <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
          No jobs in the queue yet. Queue or schedule a task from{' '}
          <Link href={`${adminRoute}/jobs`} className="acn:underline">
            Scheduled jobs
          </Link>
          .
        </p>
      ) : (
        <ul className="acn:m-0 acn:list-none acn:divide-y acn:divide-border acn:p-0">
          {snapshot.jobs.slice(0, 5).map((job) => {
            const [tone, label] = JOB_STATE_DISPLAY[job.state]
            return (
              <li
                key={String(job.id)}
                className="acn:flex acn:items-center acn:justify-between acn:gap-3 acn:py-2 acn:first:pt-0 acn:last:pb-0"
              >
                <div className="acn:flex acn:min-w-0 acn:items-center acn:gap-2.5">
                  <RunStatus tone={tone} label={label} className="acn:min-w-22" />
                  <span className="acn:truncate acn:text-sm acn:font-medium">{job.taskLabel}</span>
                </div>
                <time
                  dateTime={job.updatedAt}
                  className="acn:shrink-0 acn:text-xs acn:text-muted-foreground"
                >
                  {relativeTime(job.updatedAt, language)}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
