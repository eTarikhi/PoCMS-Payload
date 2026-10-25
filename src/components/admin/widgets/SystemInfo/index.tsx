import Link from 'next/link'
import type { WidgetServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { formatDuration, RunStatus, type RunTone } from '@/components/admin/elements/RunStatus'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { collectSystemInfo, type SystemInfoReport } from '@/lib/systemInfo'

const dbTone = (status: SystemInfoReport['database']['status']): [RunTone, string] => {
  if (status === 'connected') return ['good', 'Connected']
  if (status === 'unreachable') return ['poor', 'Unreachable']
  return ['muted', 'Not configured']
}

/**
 * Dashboard widget for `viewSystem`: runtime versions, PostgreSQL/Neon status, and configured integrations.
 */
export async function SystemInfoWidget({ req, user }: WidgetServerProps) {
  const title = 'System information'
  const description = 'Runtime versions, database health, and integrations.'
  if (!hasCapability(user, 'viewSystem')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="System information" state="forbidden" />
      </WidgetCard>
    )
  }

  const report = await collectSystemInfo(req.payload)
  const adminRoute = req.payload.config.routes.admin

  return <SystemInfoSummaryView report={report} adminRoute={adminRoute} />
}

export function SystemInfoSummaryView({
  report,
  adminRoute = '/admin',
}: {
  report: SystemInfoReport
  adminRoute?: string
}) {
  const [tone, label] = dbTone(report.database.status)
  const configuredCount = report.integrations.filter((i) => i.status === 'configured').length

  return (
    <WidgetCard
      title="System information"
      description="Runtime versions, database health, and integrations."
      action={
        <Link
          href={`${adminRoute}/system`}
          className="acn:text-xs acn:font-medium acn:text-muted-foreground acn:underline-offset-4 acn:hover:text-foreground acn:hover:underline"
        >
          Details →
        </Link>
      }
    >
      <div className="acn:space-y-3">
        <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
          <div className="acn:flex acn:items-center acn:gap-2">
            <RunStatus tone={tone} label={label} />
            <span className="acn:text-xs acn:text-muted-foreground">
              {report.database.providerLabel}
              {report.database.latencyMs !== null ? ` · ${report.database.latencyMs}ms` : ''}
            </span>
          </div>
          <Badge variant="outline">{report.runtime.deploymentEnv}</Badge>
        </div>

        <dl className="acn:m-0 acn:grid acn:grid-cols-2 acn:gap-x-4 acn:gap-y-2 acn:border-t acn:border-border acn:pt-3 acn:text-xs">
          <div>
            <dt className="acn:text-muted-foreground">Payload / Next.js</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">
              {report.versions.payload} / {report.versions.next}
            </dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Node.js</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">{report.versions.node}</dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Memory / Uptime</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">
              {report.runtime.rssMb} MB · {formatDuration(report.runtime.uptimeSeconds)}
            </dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Integrations</dt>
            <dd className="acn:m-0 acn:font-medium">
              {configuredCount} / {report.integrations.length} active
            </dd>
          </div>
        </dl>
      </div>
    </WidgetCard>
  )
}
