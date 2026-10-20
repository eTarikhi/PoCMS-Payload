import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { CalendarClockIcon, KeyRoundIcon } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/elements/Card'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { RunStatus, formatDuration, type RunTone } from '@/components/admin/elements/RunStatus'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { relativeTime } from '@/components/admin/utilities/dates'
import { TASKS } from '@/jobs/registry'
import type { JobRun } from '@/payload-types'

import { CancelRunButton, RunNowButton } from './Actions'

const STATUS: Record<JobRun['status'], { label: string; tone: RunTone }> = {
  queued: { label: 'Queued', tone: 'muted' },
  running: { label: 'Running', tone: 'running' },
  done: { label: 'Done', tone: 'good' },
  failed: { label: 'Failed', tone: 'poor' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const scheduleLabel = (task: (typeof TASKS)[number]) =>
  task.schedule === 'daily' ? 'Daily' : `${WEEKDAYS[(task.weekday ?? 1) % 7]}s`

const duration = (job: JobRun) =>
  job.durationMs === null || job.durationMs === undefined
    ? '–'
    : (formatDuration(Math.max(1, Math.round(job.durationMs / 1000))) ?? '–')

const triggerLabel = (job: JobRun) => (job.trigger === 'cron' ? 'Scheduled' : 'Manual')

const who = (job: JobRun) => {
  const startedBy = job.startedBy
  if (startedBy && typeof startedBy === 'object' && 'email' in startedBy) return startedBy.email
  return job.trigger === 'cron' ? 'Cron' : '–'
}

/**
 * /admin/jobs (CR-12 E4, `manageJobs` capability): the maintenance tasks with their schedule and a
 * Run now button, then the recent runs with what each found. Vercel Cron calls
 * `GET /api/jobs/cron` daily with CRON_SECRET; the page shows whether that is configured.
 */
export async function JobsView({
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin
  const language = i18n.language

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/jobs`)}`)
  }
  if (!hasCapability(req.user, 'manageJobs')) notFound()

  const { docs } = await payload.find({
    collection: 'job-runs',
    sort: '-createdAt',
    limit: 25,
    depth: 1,
    req,
    overrideAccess: false,
  })
  const runs = docs as JobRun[]
  const cronConfigured = Boolean(process.env.CRON_SECRET?.trim())

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewActions={viewActions}
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <SetStepNav nav={[{ label: 'Scheduled jobs' }]} />
        <div data-testid="jobs" className="acn:space-y-8 acn:pt-6 acn:pb-16">
          <header className="acn:space-y-2">
            <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
              Scheduled jobs
            </h1>
            <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
              Maintenance tasks the admin runs on a schedule: emptying the trash, the Page speed
              report and the weekly link check. Vercel Cron calls{' '}
              <code className="acn:rounded-sm acn:bg-muted acn:px-1 acn:py-0.5 acn:text-xs">
                GET /api/jobs/cron
              </code>{' '}
              once a day; each task decides whether it is due. Run a task now with the button on its
              card; Cancel stops a queued run before it starts.
            </p>
          </header>

          {!cronConfigured ? (
            <Card>
              <CardContent className="acn:pt-6">
                <IntegrationNotice
                  state="not-configured"
                  service="Scheduled runs"
                  missing={['CRON_SECRET']}
                  isAdmin={hasCapability(req.user, 'useDeveloperTools')}
                  hint={
                    <>
                      Add <code className="acn:rounded-sm acn:bg-muted acn:px-1">CRON_SECRET</code>{' '}
                      here and in Vercel, then the daily cron call is allowed. Until then only the
                      Run now buttons work.
                    </>
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <section aria-labelledby="jobs-tasks" className="acn:space-y-3">
            <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
              <h2 id="jobs-tasks" className="acn:m-0 acn:text-lg acn:font-semibold">
                Tasks
              </h2>
              <p className="acn:m-0 acn:inline-flex acn:items-center acn:gap-1.5 acn:text-xs acn:text-muted-foreground">
                <CalendarClockIcon aria-hidden className="acn:size-3.5" />
                Times are UTC, like Vercel Cron
              </p>
            </div>
            <ul className="lg:acn:grid-cols-2 acn:m-0 acn:grid acn:list-none acn:gap-4 acn:p-0">
              {TASKS.map((task) => {
                const last = runs.find((run) => run.task === task.slug)
                const missing = (task.needs ?? []).filter((name) => !process.env[name]?.trim())
                return (
                  <li key={task.slug} className="acn:min-w-0">
                    <Card className="acn:h-full">
                      <CardHeader>
                        <CardTitle>
                          <h3 className="acn:m-0 acn:text-base acn:font-semibold">{task.label}</h3>
                        </CardTitle>
                        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1.5">
                          <Badge variant="secondary">
                            <CalendarClockIcon aria-hidden />
                            {scheduleLabel(task)}
                          </Badge>
                          <Badge variant="outline">Usually {task.estimate}</Badge>
                          {missing.length > 0 ? (
                            <Badge variant="destructive">
                              <KeyRoundIcon aria-hidden />
                              Needs {missing.join(', ')}
                            </Badge>
                          ) : null}
                        </div>
                      </CardHeader>
                      <CardContent className="acn:flex acn:flex-col acn:gap-4">
                        <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                          {task.description}
                        </p>
                        <div className="acn:flex acn:flex-wrap acn:items-end acn:justify-between acn:gap-3">
                          <div className="acn:min-w-0 acn:space-y-1 acn:text-sm">
                            {last ? (
                              <>
                                <p className="acn:m-0 acn:flex acn:items-center acn:gap-2">
                                  <RunStatus
                                    tone={STATUS[last.status].tone}
                                    label={STATUS[last.status].label}
                                  />
                                  <time
                                    dateTime={last.createdAt}
                                    title={new Date(last.createdAt).toLocaleString(language)}
                                    className="acn:text-muted-foreground"
                                  >
                                    {relativeTime(last.createdAt, language)}
                                  </time>
                                  <span className="acn:text-xs acn:text-muted-foreground">
                                    ({triggerLabel(last).toLowerCase()}, {duration(last)})
                                  </span>
                                </p>
                                <p className="acn:m-0 acn:max-w-md acn:text-xs acn:text-muted-foreground">
                                  {last.error ?? last.summary ?? 'No summary.'}
                                </p>
                              </>
                            ) : (
                              <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                                Never run.
                              </p>
                            )}
                          </div>
                          {missing.length > 0 ? (
                            <p className="acn:m-0 acn:max-w-56 acn:text-xs acn:text-muted-foreground">
                              Set {missing.join(', ')} to enable this task.
                            </p>
                          ) : (
                            <RunNowButton task={task.slug} label={task.label} />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="jobs-runs" className="acn:space-y-3">
            <div className="acn:flex acn:flex-wrap acn:items-baseline acn:justify-between acn:gap-2">
              <h2 id="jobs-runs" className="acn:m-0 acn:text-lg acn:font-semibold">
                Recent runs
              </h2>
              <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                The last {runs.length === 0 ? '25' : Math.min(25, runs.length)} of 25 shown
              </p>
            </div>
            {runs.length === 0 ? (
              <Card>
                <CardContent className="acn:pt-6">
                  <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                    No runs yet. Run a task above, or wait for the daily cron call once CRON_SECRET
                    is set.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="acn:py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Took</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>
                        <span className="acn:sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="acn:font-medium">
                          {TASKS.find((task) => task.slug === run.task)?.label ?? run.task}
                        </TableCell>
                        <TableCell>
                          <RunStatus
                            tone={STATUS[run.status].tone}
                            label={STATUS[run.status].label}
                          />
                        </TableCell>
                        <TableCell>
                          <time
                            dateTime={run.createdAt}
                            title={new Date(run.createdAt).toLocaleString(language)}
                            className="acn:text-muted-foreground"
                          >
                            {relativeTime(run.createdAt, language)}
                          </time>
                        </TableCell>
                        <TableCell className="acn:text-muted-foreground">{who(run)}</TableCell>
                        <TableCell className="acn:tabular-nums">{duration(run)}</TableCell>
                        <TableCell className="acn:max-w-lg acn:whitespace-normal">
                          <span className="acn:line-clamp-2 acn:text-sm">
                            {run.error ?? run.summary ?? '–'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {run.status === 'queued' ? <CancelRunButton id={run.id} /> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </section>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default JobsView
