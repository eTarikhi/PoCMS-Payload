import type { WidgetServerProps } from 'payload'
import { ExternalLinkIcon } from 'lucide-react'
import React from 'react'

import { hasCapability, isAdmin } from '@/access/permissions'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { formatDuration, RunStatus, type RunTone } from '@/components/admin/elements/RunStatus'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { relativeTime } from '@/components/admin/utilities/dates'
import { type CIReport, latestWorkflowRuns, type WorkflowRun } from '@/integrations/github'

const DOCS = 'https://docs.github.com/en/rest/actions/workflow-runs'

export function runTone(run: Pick<WorkflowRun, 'conclusion' | 'status'>): [RunTone, string] {
  if (run.status !== 'completed') return ['running', run.status === 'queued' ? 'Queued' : 'Running']
  switch (run.conclusion) {
    case 'success':
      return ['good', 'Passed']
    case 'failure':
    case 'timed_out':
    case 'startup_failure':
      return ['poor', 'Failed']
    case 'cancelled':
      return ['muted', 'Cancelled']
    default:
      return ['muted', run.conclusion ? run.conclusion.replace(/_/g, ' ') : 'Done']
  }
}

/**
 * The latest GitHub Actions runs of the repository: result, workflow, commit title, branch, time
 * and duration, linking to each run. Needs the "Deployments and CI" capability and the repository
 * (GITHUB_REPOSITORY, or Vercel's git variables); GITHUB_TOKEN for private repositories.
 */
export async function CIStatusWidget({ req, user }: WidgetServerProps) {
  const title = 'CI status'
  const description = 'The latest GitHub Actions runs.'
  if (!hasCapability(user, 'viewDeployments')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="GitHub Actions" state="forbidden" />
      </WidgetCard>
    )
  }
  const result = await latestWorkflowRuns(6)
  if (result.status !== 'ok') {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice
          service="GitHub Actions"
          state={result.status}
          missing={result.status === 'not-configured' ? result.missing : undefined}
          message={result.status === 'error' ? result.message : undefined}
          isAdmin={isAdmin(user)}
          docsURL={DOCS}
        />
      </WidgetCard>
    )
  }
  return <CIStatusView report={result.data} language={req.i18n.language} />
}

/** The list itself (no data fetching), also shown with sample data in the gallery. */
export function CIStatusView({ language, report }: { language: string; report: CIReport }) {
  return (
    <WidgetCard
      title="CI status"
      description={`GitHub Actions, ${report.repository}.`}
      action={
        <a
          href={`https://github.com/${report.repository}/actions`}
          target="_blank"
          rel="noopener noreferrer"
          className="acn:inline-flex acn:items-center acn:gap-1 acn:text-xs acn:text-muted-foreground acn:hover:text-foreground"
        >
          All runs <ExternalLinkIcon aria-hidden className="acn:size-3.5" />
          <span className="acn:sr-only"> (opens in a new tab)</span>
        </a>
      }
    >
      {report.runs.length === 0 ? (
        <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">No workflow runs yet.</p>
      ) : (
        <ul className="acn:m-0 acn:list-none acn:divide-y acn:divide-border acn:p-0">
          {report.runs.map((run) => {
            const [tone, label] = runTone(run)
            const details = [
              run.workflow,
              run.branch,
              run.commitSha?.slice(0, 7),
              formatDuration(run.durationSeconds),
              run.actor ? `by ${run.actor}` : null,
            ].filter(Boolean)
            return (
              <li
                key={run.id}
                className="acn:flex acn:items-start acn:gap-3 acn:py-2.5 acn:first:pt-0 acn:last:pb-0"
              >
                <RunStatus tone={tone} label={label} className="acn:min-w-24" />
                <div className="acn:min-w-0 acn:flex-1">
                  <div className="acn:flex acn:items-baseline acn:justify-between acn:gap-3">
                    <a
                      href={run.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="acn:truncate acn:text-sm acn:font-medium acn:text-foreground acn:underline-offset-4 acn:hover:underline"
                    >
                      {run.title}
                      <span className="acn:sr-only"> (opens in a new tab)</span>
                    </a>
                    <time
                      dateTime={run.createdAt}
                      className="acn:shrink-0 acn:text-xs acn:text-muted-foreground"
                    >
                      {relativeTime(run.createdAt, language)}
                    </time>
                  </div>
                  <p className="acn:m-0 acn:truncate acn:text-xs acn:text-muted-foreground">
                    {details.join(' · ')}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}

export default CIStatusWidget
