import Link from 'next/link'
import type { WidgetServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import {
  classifyDatabaseHealth,
  formatBytes,
  type DatabaseManagementSnapshot,
} from '@/plugins/databaseManager/shared'
import { collectDatabaseManagementSnapshot } from '@/plugins/databaseManager/snapshot'

/**
 * Dashboard widget guarded by `manageDatabase`: summarizes PostgreSQL vital signs,
 * cache hit ratio, sequence/bloat hygiene, cloud vault backups, and serverless provider status.
 */
export async function DatabaseHealthWidget({ req, user }: WidgetServerProps) {
  const title = 'Database health'
  const description = 'PostgreSQL vitals, backups, sequence sync, and serverless provider status.'

  if (!hasCapability(user, 'manageDatabase')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="Database manager" state="forbidden" />
      </WidgetCard>
    )
  }

  const snapshot = await collectDatabaseManagementSnapshot(req.payload)
  const adminRoute = req.payload.config.routes.admin

  return <DatabaseHealthSummaryView snapshot={snapshot} adminRoute={adminRoute} />
}

export function DatabaseHealthSummaryView({
  snapshot,
  adminRoute = '/admin',
}: {
  snapshot: DatabaseManagementSnapshot
  adminRoute?: string
}) {
  const health = classifyDatabaseHealth(snapshot.vitals, snapshot.hygiene)
  const activeProv = snapshot.providers.find((p) => p.slug === snapshot.activeProvider)
  const providerConnected = activeProv?.result.status === 'ok'

  return (
    <WidgetCard
      title="Database health"
      description="PostgreSQL vitals, backups, sequence sync, and serverless provider status."
      action={
        <Link
          href={`${adminRoute}/database`}
          className="acn:text-xs acn:font-medium acn:text-muted-foreground acn:underline-offset-4 acn:hover:text-foreground acn:hover:underline"
        >
          Manage →
        </Link>
      }
    >
      <div className="acn:space-y-3">
        <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
          <div className="acn:flex acn:items-center acn:gap-2">
            <RunStatus tone={health.tone} label={health.label} />
            <span className="acn:text-xs acn:text-muted-foreground">
              {snapshot.connection.providerLabel}
              {snapshot.vitals.latencyMs !== null ? ` · ${snapshot.vitals.latencyMs}ms` : ''}
            </span>
          </div>
          <Badge variant={providerConnected ? 'default' : 'outline'}>
            {providerConnected ? `${activeProv?.name} API` : 'Pilot SQL mode'}
          </Badge>
        </div>

        <dl className="acn:m-0 acn:grid acn:grid-cols-2 acn:gap-x-4 acn:gap-y-2 acn:border-t acn:border-border acn:pt-3 acn:text-xs">
          <div>
            <dt className="acn:text-muted-foreground">Size / Tables</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">
              {formatBytes(snapshot.vitals.databaseSizeBytes)} · {snapshot.tables.length} tables
            </dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Cache hit ratio</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">
              {snapshot.vitals.cacheHitRatio !== null ? `${snapshot.vitals.cacheHitRatio}%` : '—'}
            </dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Sequences</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">
              {snapshot.hygiene.outOfSyncSequencesCount === 0
                ? `${snapshot.sequences.length} in sync`
                : `${snapshot.hygiene.outOfSyncSequencesCount} drifted`}
            </dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Cloud backups</dt>
            <dd className="acn:m-0 acn:font-medium">
              {snapshot.vault.configured ? `${snapshot.vault.items.length} in Blob` : 'Not set'}
            </dd>
          </div>
        </dl>

        {health.issues.length > 0 ? (
          <p className="acn:m-0 acn:border-t acn:border-border acn:pt-2 acn:text-xs acn:text-muted-foreground">
            {health.issues[0]}
          </p>
        ) : null}
      </div>
    </WidgetCard>
  )
}

export default DatabaseHealthWidget
