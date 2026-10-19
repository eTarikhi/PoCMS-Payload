import type { WidgetServerProps } from 'payload'
import React from 'react'

import { hasCapability, isAdmin } from '@/access/permissions'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { formatDuration, RunStatus, type RunTone } from '@/components/admin/elements/RunStatus'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { relativeTime } from '@/components/admin/utilities/dates'
import { type Deployment, latestDeployments } from '@/integrations/vercel'

const DOCS = 'https://vercel.com/docs/rest-api/deployments/list-deployments'

const STATE: Record<string, [RunTone, string]> = {
  READY: ['good', 'Ready'],
  ERROR: ['poor', 'Failed'],
  BUILDING: ['pending', 'Building'],
  INITIALIZING: ['pending', 'Starting'],
  QUEUED: ['pending', 'Queued'],
  CANCELED: ['muted', 'Canceled'],
  DELETED: ['muted', 'Deleted'],
}

/**
 * The latest Vercel deployments: state, production or preview, commit, branch, build time and links
 * to the deployment and its build logs. Needs the "Deployments and CI" capability and
 * VERCEL_TOKEN + VERCEL_PROJECT_ID.
 */
export async function DeploymentsWidget({ req, user }: WidgetServerProps) {
  const title = 'Deployments'
  const description = 'The latest Vercel deployments.'
  if (!hasCapability(user, 'viewDeployments')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="Vercel" state="forbidden" />
      </WidgetCard>
    )
  }
  const result = await latestDeployments(6)
  if (result.status !== 'ok') {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice
          service="Vercel"
          state={result.status}
          missing={result.status === 'not-configured' ? result.missing : undefined}
          message={result.status === 'error' ? result.message : undefined}
          isAdmin={isAdmin(user)}
          docsURL={DOCS}
        />
      </WidgetCard>
    )
  }
  return <DeploymentsView deployments={result.data} language={req.i18n.language} />
}

/** The list itself (no data fetching), also shown with sample data in the gallery. */
export function DeploymentsView({
  deployments,
  language,
}: {
  deployments: Deployment[]
  language: string
}) {
  return (
    <WidgetCard title="Deployments" description="The latest Vercel deployments.">
      {deployments.length === 0 ? (
        <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">No deployments yet.</p>
      ) : (
        <ul className="acn:m-0 acn:list-none acn:divide-y acn:divide-border acn:p-0">
          {deployments.map((deployment) => {
            const [tone, label] = STATE[deployment.state] ?? [
              'muted',
              deployment.state.toLowerCase(),
            ]
            const details = [
              deployment.target === 'production' ? 'Production' : 'Preview',
              deployment.branch,
              deployment.commitSha?.slice(0, 7),
              formatDuration(deployment.buildSeconds),
              deployment.author ? `by ${deployment.author}` : null,
            ].filter(Boolean)
            return (
              <li
                key={deployment.id}
                className="acn:flex acn:items-start acn:gap-3 acn:py-2.5 acn:first:pt-0 acn:last:pb-0"
              >
                <RunStatus tone={tone} label={label} className="acn:min-w-24" />
                <div className="acn:min-w-0 acn:flex-1">
                  <div className="acn:flex acn:items-baseline acn:justify-between acn:gap-3">
                    {deployment.inspectorUrl ? (
                      <a
                        href={deployment.inspectorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="acn:relative acn:truncate acn:text-sm acn:font-medium acn:text-foreground acn:underline-offset-4 acn:hover:underline"
                      >
                        {deployment.commitMessage ?? deployment.url ?? deployment.id}
                        <span className="acn:sr-only"> (build logs, opens in a new tab)</span>
                      </a>
                    ) : (
                      <span className="acn:truncate acn:text-sm acn:font-medium">
                        {deployment.commitMessage ?? deployment.url ?? deployment.id}
                      </span>
                    )}
                    <time
                      dateTime={deployment.createdAt}
                      className="acn:shrink-0 acn:text-xs acn:text-muted-foreground"
                    >
                      {relativeTime(deployment.createdAt, language)}
                    </time>
                  </div>
                  <p className="acn:relative acn:m-0 acn:truncate acn:text-xs acn:text-muted-foreground">
                    {details.join(' · ')}
                    {deployment.url && deployment.state === 'READY' ? (
                      <>
                        {' · '}
                        <a
                          href={deployment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="acn:text-muted-foreground acn:underline-offset-4 acn:hover:text-foreground"
                        >
                          Visit
                          <span className="acn:sr-only">
                            {' '}
                            {deployment.url} (opens in a new tab)
                          </span>
                        </a>
                      </>
                    ) : null}
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

export default DeploymentsWidget
