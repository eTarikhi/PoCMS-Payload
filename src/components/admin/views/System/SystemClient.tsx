'use client'

import { toast } from '@payloadcms/ui'
import { RefreshCwIcon } from 'lucide-react'
import React, { useState } from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/elements/Card'
import { formatDuration, RunStatus, type RunTone } from '@/components/admin/elements/RunStatus'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { cn } from '@/components/admin/utilities/cn'
import type { IntegrationStatus, SystemInfoReport } from '@/lib/systemInfo'

const dbTone = (status: SystemInfoReport['database']['status']): [RunTone, string] => {
  if (status === 'connected') return ['good', 'Connected']
  if (status === 'unreachable') return ['poor', 'Unreachable']
  return ['muted', 'Not configured']
}

const integrationTone = (status: IntegrationStatus): [RunTone, string] => {
  if (status === 'configured') return ['good', 'Configured']
  if (status === 'partial') return ['running', 'Partial']
  return ['muted', 'Not set']
}

export function SystemClient({
  initialReport,
  apiRoute,
}: {
  initialReport: SystemInfoReport
  apiRoute: string
}) {
  const [report, setReport] = useState<SystemInfoReport>(initialReport)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`${apiRoute}/system-info`, { credentials: 'include' })
      const data = (await res.json()) as SystemInfoReport & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setReport(data)
      toast.success('System information refreshed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh system info.')
    } finally {
      setRefreshing(false)
    }
  }

  const [dbStatusTone, dbStatusLabel] = dbTone(report.database.status)

  return (
    <div data-testid="system-view" className="acn:space-y-8 acn:pt-6 acn:pb-16">
      <header className="acn:flex acn:flex-wrap acn:items-start acn:justify-between acn:gap-4">
        <div className="acn:space-y-1">
          <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
            System information
          </h1>
          <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
            Framework versions, Node.js runtime telemetry, PostgreSQL / Neon connection diagnostics,
            and configured environment integrations. Secret values are never exposed.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCwIcon
            aria-hidden
            className={cn('acn:size-4', refreshing && 'acn:animate-spin')}
          />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </header>

      <div className="acn:grid acn:gap-4 acn:md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Stack versions</CardTitle>
            <CardDescription>Application &amp; core dependencies</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="acn:m-0 acn:space-y-2 acn:text-sm">
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">PoCMS</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">v{report.versions.app}</dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Payload CMS</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">
                  {report.versions.payload}
                </dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Next.js</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">{report.versions.next}</dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">React</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">{report.versions.react}</dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Node.js</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">{report.versions.node}</dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">OS / Arch</dt>
                <dd className="acn:m-0 acn:font-mono acn:text-xs">{report.versions.platform}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment &amp; runtime</CardTitle>
            <CardDescription>Process health &amp; Payload schema</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="acn:m-0 acn:space-y-2 acn:text-sm">
              <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Environment</dt>
                <dd className="acn:m-0">
                  <Badge variant="secondary">{report.runtime.deploymentEnv}</Badge>
                </dd>
              </div>
              {report.runtime.gitCommit ? (
                <div className="acn:flex acn:justify-between acn:gap-2">
                  <dt className="acn:text-muted-foreground">Commit</dt>
                  <dd className="acn:m-0 acn:font-mono acn:font-medium">
                    {report.runtime.gitCommit}
                  </dd>
                </div>
              ) : null}
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Public URL</dt>
                <dd className="acn:m-0 acn:truncate acn:font-mono acn:text-xs">
                  {report.runtime.siteUrl}
                </dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Uptime</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">
                  {formatDuration(report.runtime.uptimeSeconds)}
                </dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Memory (RSS / Heap)</dt>
                <dd className="acn:m-0 acn:font-mono acn:font-medium">
                  {report.runtime.rssMb} / {report.runtime.heapUsedMb} MB
                </dd>
              </div>
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Schema</dt>
                <dd className="acn:m-0 acn:text-xs">
                  {report.schema.collections} collections · {report.schema.globals} globals ·{' '}
                  {report.schema.jobTasks} job tasks
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database (PostgreSQL)</CardTitle>
            <CardDescription>{report.database.providerLabel}</CardDescription>
          </CardHeader>
          <CardContent className="acn:space-y-3">
            <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
              <RunStatus tone={dbStatusTone} label={dbStatusLabel} />
              {report.database.latencyMs !== null ? (
                <span className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                  {report.database.latencyMs}ms ping
                </span>
              ) : null}
            </div>
            <dl className="acn:m-0 acn:space-y-1.5 acn:text-xs">
              {report.database.host ? (
                <div className="acn:flex acn:justify-between acn:gap-2">
                  <dt className="acn:text-muted-foreground">Host</dt>
                  <dd className="acn:m-0 acn:truncate acn:font-mono">{report.database.host}</dd>
                </div>
              ) : null}
              {report.database.database ? (
                <div className="acn:flex acn:justify-between acn:gap-2">
                  <dt className="acn:text-muted-foreground">Database</dt>
                  <dd className="acn:m-0 acn:font-mono">{report.database.database}</dd>
                </div>
              ) : null}
              <div className="acn:flex acn:justify-between acn:gap-2">
                <dt className="acn:text-muted-foreground">Pooling</dt>
                <dd className="acn:m-0">
                  {report.database.pooled ? 'PgBouncer pooled' : 'Direct connection'}
                  {report.database.hasUnpooledUrl ? ' + unpooled URL' : ''}
                </dd>
              </div>
              {report.database.serverVersion ? (
                <div className="acn:flex acn:justify-between acn:gap-2">
                  <dt className="acn:text-muted-foreground">Engine</dt>
                  <dd className="acn:m-0 acn:truncate acn:font-mono">
                    {report.database.serverVersion}
                  </dd>
                </div>
              ) : null}
              {report.database.migrationsApplied !== null ? (
                <div className="acn:flex acn:justify-between acn:gap-2">
                  <dt className="acn:text-muted-foreground">Migrations</dt>
                  <dd className="acn:m-0 acn:font-mono">
                    {report.database.migrationsApplied} applied
                    {report.database.latestMigration
                      ? ` (${report.database.latestMigration})`
                      : ''}
                  </dd>
                </div>
              ) : null}
            </dl>
            {report.database.errorMessage ? (
              <p className="acn:m-0 acn:rounded acn:bg-destructive/10 acn:p-2 acn:font-mono acn:text-xs acn:text-destructive">
                {report.database.errorMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured integrations</CardTitle>
          <CardDescription>
            Environment variable health across database, storage, email, CI/CD, analytics, and cron
            runners.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integration</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Environment variables</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.integrations.map((item) => {
                const [tone, label] = integrationTone(item.status)
                return (
                  <TableRow key={item.key}>
                    <TableCell className="acn:font-medium">{item.name}</TableCell>
                    <TableCell className="acn:text-muted-foreground">{item.category}</TableCell>
                    <TableCell>
                      <RunStatus tone={tone} label={label} />
                    </TableCell>
                    <TableCell className="acn:font-mono acn:text-xs">
                      {item.presentVars.map((name) => (
                        <Badge key={name} variant="secondary" className="acn:mr-1 acn:mb-1">
                          {name}
                        </Badge>
                      ))}
                      {item.missingVars.map((name) => (
                        <Badge
                          key={name}
                          variant="outline"
                          className="acn:mr-1 acn:mb-1 acn:text-muted-foreground"
                        >
                          {name} (unset)
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="acn:max-w-xs acn:text-xs acn:text-muted-foreground">
                      {item.note}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
