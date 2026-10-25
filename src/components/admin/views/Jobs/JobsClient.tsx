'use client'

import { toast } from '@payloadcms/ui'
import { PlayIcon, PlusIcon, RefreshCwIcon, Trash2Icon, XCircleIcon } from 'lucide-react'
import React, { useMemo, useState } from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/elements/Card'
import { Input } from '@/components/admin/elements/Input'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { JOB_STATE_DISPLAY } from '@/components/admin/widgets/ScheduledJobs'
import { cn } from '@/components/admin/utilities/cn'
import type { JobRunState, JobsSnapshot } from '@/jobs/config'

type FilterTab = 'all' | JobRunState

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'canceled', label: 'Canceled' },
]

export function JobsClient({
  initialSnapshot,
  apiRoute,
}: {
  initialSnapshot: JobsSnapshot
  apiRoute: string
}) {
  const [snapshot, setSnapshot] = useState<JobsSnapshot>(initialSnapshot)
  const [selectedTask, setSelectedTask] = useState<string>(
    initialSnapshot.tasks[0]?.slug ?? 'refreshSiteCache',
  )
  const [scheduleAt, setScheduleAt] = useState<string>('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return snapshot.jobs
    return snapshot.jobs.filter((job) => job.state === filter)
  }, [snapshot.jobs, filter])

  const refresh = async () => {
    setBusyKey('refresh')
    try {
      const res = await fetch(`${apiRoute}/admin-jobs`, { credentials: 'include' })
      const data = (await res.json()) as JobsSnapshot & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSnapshot(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh jobs.')
    } finally {
      setBusyKey(null)
    }
  }

  const runAction = async (
    key: string,
    payloadBody: Record<string, unknown>,
    successMsg: string,
  ) => {
    setBusyKey(key)
    try {
      const res = await fetch(`${apiRoute}/admin-jobs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        snapshot?: JobsSnapshot
      }
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      if (data.snapshot) setSnapshot(data.snapshot)
      toast.success(successMsg)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Job action failed.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleQueueTask = (event: React.FormEvent) => {
    event.preventDefault()
    const waitUntilIso = scheduleAt.trim() ? new Date(scheduleAt).toISOString() : undefined
    void runAction(
      'queue',
      {
        action: 'queue',
        task: selectedTask,
        ...(waitUntilIso ? { waitUntil: waitUntilIso } : {}),
      },
      waitUntilIso ? 'Task scheduled.' : 'Task added to the queue.',
    ).then(() => setScheduleAt(''))
  }

  const activeTaskMeta = snapshot.tasks.find((t) => t.slug === selectedTask)

  return (
    <div data-testid="jobs-view" className="acn:space-y-8 acn:pt-6 acn:pb-16">
      <header className="acn:flex acn:flex-wrap acn:items-start acn:justify-between acn:gap-4">
        <div className="acn:space-y-1">
          <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
            Scheduled jobs
          </h1>
          <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
            Inspect Payload&rsquo;s background job queue (<code className="acn:font-mono">payload-jobs</code>
            ), queue or schedule tasks for future execution, run pending jobs immediately, or cancel
            queued runs.
          </p>
        </div>
        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busyKey !== null}
            onClick={() => void runAction('run-due', { action: 'run-due' }, 'Executed due jobs.')}
          >
            <PlayIcon aria-hidden className="acn:size-4" />
            Run due jobs now
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyKey !== null}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon
              aria-hidden
              className={cn('acn:size-4', busyKey === 'refresh' && 'acn:animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Queue or schedule a task</CardTitle>
          <CardDescription>
            {activeTaskMeta?.description ?? 'Choose a registered task and optionally set a future run time.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleQueueTask}
            className="acn:flex acn:flex-wrap acn:items-end acn:gap-3"
          >
            <label className="acn:flex acn:min-w-60 acn:flex-1 acn:flex-col acn:gap-1.5 acn:text-xs acn:font-medium">
              Task
              <select
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                className="acn:h-9 acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm acn:text-foreground"
              >
                {snapshot.tasks.map((task) => (
                  <option key={task.slug} value={task.slug}>
                    {task.label} ({task.slug})
                  </option>
                ))}
              </select>
            </label>

            <label className="acn:flex acn:min-w-56 acn:flex-col acn:gap-1.5 acn:text-xs acn:font-medium">
              Run after (optional — blank queues immediately)
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </label>

            <Button type="submit" size="sm" disabled={busyKey !== null}>
              <PlusIcon aria-hidden className="acn:size-4" />
              {scheduleAt ? 'Schedule job' : 'Queue job'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job queue ({snapshot.total})</CardTitle>
          <CardDescription>
            <span className="acn:inline-flex acn:flex-wrap acn:gap-1.5 acn:pt-1">
              {FILTER_TABS.map((tab) => {
                const count =
                  tab.key === 'all' ? snapshot.jobs.length : snapshot.counts[tab.key]
                const active = filter === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(tab.key)}
                    className={cn(
                      'acn:cursor-pointer acn:rounded-full acn:border acn:px-2.5 acn:py-0.5 acn:text-xs acn:font-medium acn:transition-colors',
                      active
                        ? 'acn:border-primary acn:bg-primary acn:text-primary-foreground'
                        : 'acn:border-border acn:bg-transparent acn:text-muted-foreground acn:hover:text-foreground',
                    )}
                  >
                    {tab.label} ({count})
                  </button>
                )
              })}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <p className="acn:m-0 acn:py-6 acn:text-center acn:text-sm acn:text-muted-foreground">
              No jobs match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Queue</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Scheduled / Completed</TableHead>
                  <TableHead>Result / Error</TableHead>
                  <TableHead className="acn:text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => {
                  const [tone, label] = JOB_STATE_DISPLAY[job.state]
                  const canRun = job.state === 'queued' || job.state === 'scheduled'
                  const canCancel = job.state === 'queued' || job.state === 'scheduled'
                  const canDelete = job.state !== 'running'
                  const rowKey = String(job.id)

                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="acn:font-mono acn:text-xs">#{rowKey}</TableCell>
                      <TableCell>
                        <div className="acn:font-medium">{job.taskLabel}</div>
                        <div className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                          {job.taskSlug} · tries: {job.totalTried}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{job.queue}</Badge>
                      </TableCell>
                      <TableCell>
                        <RunStatus tone={tone} label={label} />
                      </TableCell>
                      <TableCell className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                        {job.completedAt
                          ? `Done: ${new Date(job.completedAt).toLocaleString()}`
                          : job.waitUntil
                            ? `Due: ${new Date(job.waitUntil).toLocaleString()}`
                            : `Created: ${new Date(job.createdAt).toLocaleString()}`}
                      </TableCell>
                      <TableCell className="acn:max-w-xs acn:truncate acn:font-mono acn:text-xs">
                        {job.errorMessage ? (
                          <span className="acn:text-destructive">{job.errorMessage}</span>
                        ) : (
                          <span className="acn:text-muted-foreground">
                            {job.outputSummary ?? '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="acn:text-right">
                        <div className="acn:inline-flex acn:items-center acn:gap-1">
                          {canRun ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runAction(
                                  `run:${rowKey}`,
                                  { action: 'run-one', id: job.id },
                                  `Executed job #${rowKey}.`,
                                )
                              }
                            >
                              <PlayIcon aria-hidden className="acn:size-3.5" />
                              Run now
                            </Button>
                          ) : null}
                          {canCancel ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runAction(
                                  `cancel:${rowKey}`,
                                  { action: 'cancel', id: job.id },
                                  `Canceled job #${rowKey}.`,
                                )
                              }
                            >
                              <XCircleIcon aria-hidden className="acn:size-3.5" />
                              Cancel
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete job #${rowKey}`}
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runAction(
                                  `delete:${rowKey}`,
                                  { action: 'delete', id: job.id },
                                  `Deleted job #${rowKey}.`,
                                )
                              }
                            >
                              <Trash2Icon aria-hidden className="acn:size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
