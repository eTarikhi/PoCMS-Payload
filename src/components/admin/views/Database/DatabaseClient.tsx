'use client'

import { toast } from '@payloadcms/ui'
import {
  ActivityIcon,
  CloudUploadIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  GitBranchIcon,
  HardDriveDownloadIcon,
  PlayIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react'
import React, { useState } from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/admin/elements/Card'
import { Checkbox } from '@/components/admin/elements/Checkbox'
import { Input } from '@/components/admin/elements/Input'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { Label } from '@/components/admin/elements/Label'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/elements/Tabs'
import { cn } from '@/components/admin/utilities/cn'
import {
  classifyDatabaseHealth,
  formatBytes,
  REPAIR_ACTION_META,
  type DatabaseManagementSnapshot,
  type ProviderSlug,
  type RepairActionKind,
  type RepairOperationResult,
  type RestoreDryRunReport,
  type RestoreExecutionResult,
} from '@/plugins/databaseManager/shared'

const formatDateShort = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function DatabaseClient({
  initialSnapshot,
  apiRoute,
  isAdminUser = false,
}: {
  initialSnapshot: DatabaseManagementSnapshot
  apiRoute: string
  isAdminUser?: boolean
}) {
  const [snapshot, setSnapshot] = useState<DatabaseManagementSnapshot>(initialSnapshot)
  const [activeTab, setActiveTab] = useState<string>('health')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Backup & Restore state
  const [redactDownload, setRedactDownload] = useState(false)
  const [encryptDownload, setEncryptDownload] = useState(false)
  const [vaultLabel, setVaultLabel] = useState('manual')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedVaultPath, setSelectedVaultPath] = useState<string>('')
  const [dryRunReport, setDryRunReport] = useState<RestoreDryRunReport | null>(null)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [createSafetySnapshot, setCreateSafetySnapshot] = useState(true)
  const [allowRedactedRestore, setAllowRedactedRestore] = useState(false)
  const [lastRestoreResult, setLastRestoreResult] = useState<RestoreExecutionResult | null>(null)

  // Repair state
  const [lastRepairResult, setLastRepairResult] = useState<RepairOperationResult | null>(null)

  // Provider state
  const [selectedProvider, setSelectedProvider] = useState<ProviderSlug>(
    initialSnapshot.activeProvider ?? 'neon',
  )
  const [snapshotNameInput, setSnapshotNameInput] = useState('')
  const [snapshotExpiryDays, setSnapshotExpiryDays] = useState('14')
  const [branchNameInput, setBranchNameInput] = useState('')
  const [branchPitrTimestamp, setBranchPitrTimestamp] = useState('')
  const [branchTtlHours, setBranchTtlHours] = useState('24')
  const [branchNoCompute, setBranchNoCompute] = useState(false)

  const health = classifyDatabaseHealth(snapshot.vitals, snapshot.hygiene)

  const refresh = async () => {
    setBusyKey('refresh')
    try {
      const res = await fetch(`${apiRoute}/admin-database`, { credentials: 'include' })
      const data = (await res.json()) as DatabaseManagementSnapshot & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSnapshot(data)
      toast.success('Database telemetry refreshed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh database status.')
    } finally {
      setBusyKey(null)
    }
  }

  const postAction = async <T extends Record<string, unknown>>(
    key: string,
    payload: Record<string, unknown>,
    successMsg?: string,
  ): Promise<(T & { snapshot?: DatabaseManagementSnapshot }) | null> => {
    setBusyKey(key)
    try {
      const res = await fetch(`${apiRoute}/admin-database`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as T & {
        snapshot?: DatabaseManagementSnapshot
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      if (data.snapshot) setSnapshot(data.snapshot)
      if (successMsg) toast.success(successMsg)
      return data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Database operation failed.')
      return null
    } finally {
      setBusyKey(null)
    }
  }

  const runRepair = async (repairAction: RepairActionKind, tableName?: string) => {
    const key = tableName ? `repair:${repairAction}:${tableName}` : `repair:${repairAction}`
    const data = await postAction<{ result: RepairOperationResult }>(key, {
      action: 'repair',
      repairAction,
      ...(tableName ? { tableName } : {}),
    })
    if (data?.result) {
      setLastRepairResult(data.result)
      toast.success(data.result.summary)
    }
  }

  const runRestoreAction = async (mode: 'dry-run' | 'execute') => {
    setBusyKey(`restore:${mode}`)
    try {
      let res: Response
      if (selectedFile) {
        const form = new FormData()
        form.append('file', selectedFile)
        form.append('mode', mode)
        form.append('confirm', restoreConfirmText.trim())
        form.append('createSafetySnapshot', String(createSafetySnapshot))
        form.append('allowRedactedRestore', String(allowRedactedRestore))
        res = await fetch(`${apiRoute}/admin-database/restore`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
      } else if (selectedVaultPath) {
        res = await fetch(`${apiRoute}/admin-database/restore`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'vault',
            pathname: selectedVaultPath,
            mode,
            confirm: restoreConfirmText.trim(),
            createSafetySnapshot,
            allowRedactedRestore,
          }),
        })
      } else {
        throw new Error('Select a backup file or a Cloud Vault archive first.')
      }

      const data = (await res.json()) as {
        error?: string
        report?: RestoreDryRunReport
        result?: RestoreExecutionResult
        snapshot?: DatabaseManagementSnapshot
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      if (mode === 'dry-run' && data.report) {
        setDryRunReport(data.report)
        toast.success('Pre-flight dry-run completed with zero database writes.')
      } else if (mode === 'execute' && data.result) {
        setLastRestoreResult(data.result)
        setRestoreConfirmText('')
        if (data.snapshot) setSnapshot(data.snapshot)
        toast.success(
          `Restored ${data.result.restoredRows} row(s) across ${data.result.restoredTables} table(s).`,
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Restore operation failed.')
    } finally {
      setBusyKey(null)
    }
  }

  const currentProviderDesc =
    snapshot.providers.find((p) => p.slug === selectedProvider) ?? snapshot.providers[0]

  const downloadHref = `${apiRoute}/admin-database/export?source=live&redact=${redactDownload ? 'true' : 'false'}&encrypt=${encryptDownload ? 'true' : 'false'}`

  return (
    <div data-testid="database-view" className="acn:space-y-8 acn:pt-6 acn:pb-16">
      <header className="acn:flex acn:flex-wrap acn:items-start acn:justify-between acn:gap-4">
        <div className="acn:space-y-1">
          <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2.5">
            <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
              Database manager
            </h1>
            <RunStatus tone={health.tone} label={health.label} />
            <Badge variant="outline">{snapshot.connection.providerLabel}</Badge>
          </div>
          <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
            Provider-agnostic PostgreSQL monitoring, pure-TypeScript logical backups, atomic
            transactional restore, and sequence/bloat repair — plus optional serverless provider
            controls (Neon snapshots, PITR branches, and compute autoscaling).
          </p>
        </div>

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
          {busyKey === 'refresh' ? 'Refreshing…' : 'Refresh'}
        </Button>
      </header>

      {/* Top Vital Summary Cards */}
      <div className="acn:grid acn:gap-4 acn:sm:grid-cols-2 acn:lg:grid-cols-4">
        <Card>
          <CardHeader className="acn:pb-2">
            <CardDescription>Engine &amp; latency</CardDescription>
            <CardTitle className="acn:text-xl acn:font-semibold">
              {snapshot.vitals.latencyMs !== null ? `${snapshot.vitals.latencyMs} ms` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="acn:text-xs acn:text-muted-foreground">
            {snapshot.vitals.serverVersion ?? 'PostgreSQL not connected'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="acn:pb-2">
            <CardDescription>Database footprint</CardDescription>
            <CardTitle className="acn:text-xl acn:font-semibold">
              {formatBytes(snapshot.vitals.databaseSizeBytes)}
            </CardTitle>
          </CardHeader>
          <CardContent className="acn:text-xs acn:text-muted-foreground">
            {snapshot.tables.length} public tables ·{' '}
            {snapshot.vitals.migrations
              ? `${snapshot.vitals.migrations.applied} migrations`
              : 'push schema'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="acn:pb-2">
            <CardDescription>Buffer cache hit ratio</CardDescription>
            <CardTitle className="acn:text-xl acn:font-semibold">
              {snapshot.vitals.cacheHitRatio !== null ? `${snapshot.vitals.cacheHitRatio}%` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="acn:text-xs acn:text-muted-foreground">
            Commits: {snapshot.vitals.transactionsCommitted ?? '—'} · Deadlocks:{' '}
            {snapshot.vitals.deadlocks ?? 0}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="acn:pb-2">
            <CardDescription>Connections &amp; pooling</CardDescription>
            <CardTitle className="acn:text-xl acn:font-semibold">
              {snapshot.vitals.connections
                ? `${snapshot.vitals.connections.active} active / ${snapshot.vitals.connections.total} open`
                : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="acn:text-xs acn:text-muted-foreground">
            {snapshot.connection.pooled ? 'PgBouncer pooled' : 'Direct connection'}
            {snapshot.connection.hasUnpooledUrl ? ' + Unpooled URL ready' : ''}
          </CardContent>
        </Card>
      </div>

      {snapshot.connection.advisoryNote ? (
        <div
          role="status"
          className="acn:rounded-lg acn:border acn:border-border acn:bg-muted/40 acn:px-4 acn:py-3 acn:text-xs acn:text-muted-foreground"
        >
          <strong className="acn:text-foreground">Connection advisory:</strong>{' '}
          {snapshot.connection.advisoryNote}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="acn:space-y-6">
        <TabsList>
          <TabsTrigger value="health">
            <ActivityIcon aria-hidden className="acn:size-4" />
            Health &amp; Tables ({snapshot.tables.length})
          </TabsTrigger>
          <TabsTrigger value="backup">
            <HardDriveDownloadIcon aria-hidden className="acn:size-4" />
            Backup &amp; Restore
          </TabsTrigger>
          <TabsTrigger value="repair">
            <WrenchIcon aria-hidden className="acn:size-4" />
            Repair &amp; Maintenance
          </TabsTrigger>
          <TabsTrigger value="provider">
            <SparklesIcon aria-hidden className="acn:size-4" />
            Serverless Provider
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: HEALTH & TABLES */}
        <TabsContent value="health" className="acn:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Public schema table &amp; bloat inspector</CardTitle>
              <CardDescription>
                Live row estimates, dead-tuple bloat ratios, heap vs. index footprint, and scan
                telemetry from <code>pg_stat_user_tables</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot.tables.length === 0 ? (
                <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                  {snapshot.vitals.status === 'connected'
                    ? 'No tables found in schema public.'
                    : 'Connect POSTGRES_URL to inspect live PostgreSQL tables.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead className="acn:text-right">Live rows</TableHead>
                      <TableHead className="acn:text-right">Dead tuples (Bloat)</TableHead>
                      <TableHead className="acn:text-right">Heap / Indexes</TableHead>
                      <TableHead className="acn:text-right">Total size</TableHead>
                      <TableHead className="acn:text-right">Idx / Seq scans</TableHead>
                      <TableHead className="acn:text-right">Quick maintenance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.tables.map((tbl) => {
                      const highBloat = tbl.deadTuples >= 100 && tbl.bloatRatioPercent >= 15
                      return (
                        <TableRow key={tbl.tableName}>
                          <TableCell className="acn:font-mono acn:text-xs acn:font-medium">
                            {tbl.tableName}
                          </TableCell>
                          <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                            {tbl.estimatedLiveRows.toLocaleString()}
                          </TableCell>
                          <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                            <span className={cn(highBloat && 'acn:font-semibold acn:text-destructive')}>
                              {tbl.deadTuples.toLocaleString()} ({tbl.bloatRatioPercent}%)
                            </span>
                          </TableCell>
                          <TableCell className="acn:text-right acn:font-mono acn:text-xs acn:text-muted-foreground">
                            {formatBytes(tbl.tableBytes)} / {formatBytes(tbl.indexBytes)}
                          </TableCell>
                          <TableCell className="acn:text-right acn:font-mono acn:text-xs acn:font-medium">
                            {formatBytes(tbl.totalBytes)}
                          </TableCell>
                          <TableCell className="acn:text-right acn:font-mono acn:text-xs acn:text-muted-foreground">
                            {tbl.idxScans.toLocaleString()} / {tbl.seqScans.toLocaleString()}
                          </TableCell>
                          <TableCell className="acn:text-right">
                            <div className="acn:inline-flex acn:gap-1.5">
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={busyKey !== null}
                                onClick={() => void runRepair('analyze-all', tbl.tableName)}
                              >
                                Analyze
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={busyKey !== null}
                                onClick={() => void runRepair('vacuum-analyze', tbl.tableName)}
                              >
                                Vacuum
                              </Button>
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
        </TabsContent>

        {/* TAB 2: BACKUP & RESTORE */}
        <TabsContent value="backup" className="acn:space-y-6">
          <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
            {/* Portable Browser Download */}
            <Card>
              <CardHeader>
                <CardTitle>Portable logical backup (Browser download)</CardTitle>
                <CardDescription>
                  Pure-TypeScript schema, rows, FK graph, and sequence dump — runs natively on
                  Vercel Serverless without requiring <code>pg_dump</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="acn:space-y-4">
                <div className="acn:space-y-2.5">
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-sm">
                    <Checkbox
                      checked={redactDownload}
                      onCheckedChange={(v) => setRedactDownload(Boolean(v))}
                    />
                    <span>Redact user auth secrets (strip password hashes &amp; sessions)</span>
                  </label>
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-sm">
                    <Checkbox
                      checked={encryptDownload}
                      onCheckedChange={(v) => setEncryptDownload(Boolean(v))}
                    />
                    <span>Encrypt archive with AES-256-GCM (`DATABASE_BACKUP_SECRET` / `PAYLOAD_SECRET`)</span>
                  </label>
                </div>

                <a
                  href={downloadHref}
                  className="acn:inline-flex acn:h-9 acn:items-center acn:justify-center acn:gap-2 acn:rounded-md acn:bg-primary acn:px-4 acn:text-sm acn:font-medium acn:text-primary-foreground acn:no-underline acn:hover:opacity-90"
                >
                  <DownloadIcon aria-hidden className="acn:size-4" />
                  Download compressed backup
                </a>
              </CardContent>
            </Card>

            {/* Encrypted Vercel Blob Vault */}
            <Card>
              <CardHeader>
                <CardTitle>Encrypted Cloud Vault (Vercel Blob)</CardTitle>
                <CardDescription>
                  Off-database disaster recovery archives encrypted with AES-256-GCM and automatic
                  retention pruning.
                </CardDescription>
              </CardHeader>
              <CardContent className="acn:space-y-4">
                {!snapshot.vault.configured ? (
                  <IntegrationNotice
                    service="Vercel Blob Backup Vault"
                    state="not-configured"
                    isAdmin={isAdminUser}
                    missing={['BLOB_READ_WRITE_TOKEN']}
                  />
                ) : (
                  <>
                    <div className="acn:flex acn:flex-wrap acn:items-end acn:gap-2">
                      <div className="acn:min-w-44 acn:flex-1 acn:space-y-1">
                        <Label htmlFor="vault-label">Backup tag</Label>
                        <Input
                          id="vault-label"
                          value={vaultLabel}
                          onChange={(e) => setVaultLabel(e.target.value)}
                          placeholder="pre-deploy"
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={busyKey !== null || !snapshot.vault.encryptionConfigured}
                        onClick={() =>
                          void postAction(
                            'vault-save',
                            { action: 'vault-save', label: vaultLabel, retentionCount: 10 },
                            'Encrypted backup uploaded to Vercel Blob.',
                          )
                        }
                      >
                        <CloudUploadIcon aria-hidden className="acn:size-4" />
                        Save to Blob
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyKey !== null}
                        onClick={() =>
                          void postAction(
                            'schedule-backup',
                            { action: 'schedule-backup', label: 'queued-vault', retentionCount: 10 },
                            'Queued background backup job in Payload Jobs.',
                          )
                        }
                      >
                        Queue job
                      </Button>
                    </div>

                    {snapshot.vault.items.length === 0 ? (
                      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                        No cloud backups stored under <code>{snapshot.vault.prefix}</code> yet.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Archive</TableHead>
                            <TableHead className="acn:text-right">Size</TableHead>
                            <TableHead className="acn:text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshot.vault.items.slice(0, 8).map((item) => (
                            <TableRow key={item.pathname}>
                              <TableCell className="acn:font-mono acn:text-xs">
                                <div>{item.filename}</div>
                                <div className="acn:text-[11px] acn:text-muted-foreground">
                                  {formatDateShort(item.uploadedAt)}
                                </div>
                              </TableCell>
                              <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                                {formatBytes(item.sizeBytes)}
                              </TableCell>
                              <TableCell className="acn:text-right">
                                <div className="acn:inline-flex acn:gap-1.5">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedFile(null)
                                      setSelectedVaultPath(item.pathname)
                                      setDryRunReport(null)
                                      toast.info(`Selected vault archive "${item.filename}" for restore.`)
                                    }}
                                  >
                                    Select
                                  </Button>
                                  <a
                                    href={`${apiRoute}/admin-database/export?source=vault&pathname=${encodeURIComponent(item.pathname)}`}
                                    className="acn:inline-flex acn:h-7 acn:items-center acn:rounded-md acn:border acn:border-input acn:px-2 acn:text-xs acn:no-underline"
                                  >
                                    Download
                                  </a>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={busyKey !== null}
                                    onClick={() =>
                                      void postAction(
                                        `del:${item.pathname}`,
                                        { action: 'vault-delete', pathname: item.pathname },
                                        'Deleted cloud backup archive.',
                                      )
                                    }
                                  >
                                    <Trash2Icon aria-hidden className="acn:size-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Safe Transactional Restore */}
          <Card>
            <CardHeader>
              <CardTitle>Atomic transactional restore (Dry-run &amp; FK-ordered)</CardTitle>
              <CardDescription>
                Validates SHA-256 checksums, column compatibility, and Payload migrations first.
                Executes inside a single <code>BEGIN … COMMIT</code> transaction with advisory lock
                protection — rolling back 100% cleanly on any error.
              </CardDescription>
            </CardHeader>
            <CardContent className="acn:space-y-4">
              <div className="acn:grid acn:gap-4 acn:md:grid-cols-2">
                <div className="acn:space-y-1.5">
                  <Label htmlFor="restore-file">Upload backup file (`.json`, `.json.gz`, `.enc.json.gz`)</Label>
                  <Input
                    id="restore-file"
                    type="file"
                    accept=".json,.gz,.enc"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setSelectedFile(f)
                      if (f) setSelectedVaultPath('')
                      setDryRunReport(null)
                    }}
                  />
                </div>
                <div className="acn:space-y-1.5">
                  <Label htmlFor="restore-vault-path">Or Cloud Vault pathname</Label>
                  <Input
                    id="restore-vault-path"
                    value={selectedVaultPath}
                    onChange={(e) => {
                      setSelectedVaultPath(e.target.value)
                      if (e.target.value) setSelectedFile(null)
                      setDryRunReport(null)
                    }}
                    placeholder="backups/database/pocms-..."
                  />
                </div>
              </div>

              <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyKey !== null || (!selectedFile && !selectedVaultPath)}
                  onClick={() => void runRestoreAction('dry-run')}
                >
                  <ShieldCheckIcon aria-hidden className="acn:size-4" />
                  1. Run pre-flight dry-run
                </Button>

                <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
                  <Checkbox
                    checked={createSafetySnapshot}
                    onCheckedChange={(v) => setCreateSafetySnapshot(Boolean(v))}
                  />
                  <span>Auto-create Neon snapshot before restore (when `NEON_API_KEY` is active)</span>
                </label>

                <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
                  <Checkbox
                    checked={allowRedactedRestore}
                    onCheckedChange={(v) => setAllowRedactedRestore(Boolean(v))}
                  />
                  <span>Allow restoring secret-redacted archive</span>
                </label>
              </div>

              {dryRunReport ? (
                <div className="acn:space-y-3 acn:rounded-lg acn:border acn:border-border acn:bg-muted/30 acn:p-4">
                  <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
                    <RunStatus
                      tone={dryRunReport.valid ? 'good' : 'poor'}
                      label={dryRunReport.valid ? 'Dry-run passed' : 'Incompatible archive'}
                    />
                    <Badge variant="outline">
                      {dryRunReport.matchedTables.length} / {dryRunReport.totalTables} tables matched
                    </Badge>
                    <Badge variant="outline">
                      {dryRunReport.totalRows.toLocaleString()} total rows
                    </Badge>
                    {dryRunReport.encrypted ? <Badge>AES-256-GCM verified</Badge> : null}
                  </div>

                  {dryRunReport.migrationWarnings.map((w) => (
                    <p key={w} className="acn:m-0 acn:text-xs acn:text-destructive">
                      {w}
                    </p>
                  ))}
                  {dryRunReport.columnWarnings.map((w) => (
                    <p key={w} className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                      {w}
                    </p>
                  ))}

                  <div className="acn:flex acn:flex-wrap acn:items-end acn:gap-3 acn:pt-2">
                    <div className="acn:space-y-1">
                      <Label htmlFor="restore-confirm">
                        Type <code>RESTORE</code> to unlock atomic restore
                      </Label>
                      <Input
                        id="restore-confirm"
                        value={restoreConfirmText}
                        onChange={(e) => setRestoreConfirmText(e.target.value)}
                        placeholder="RESTORE"
                        className="acn:w-48 acn:font-mono"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={
                        busyKey !== null ||
                        !dryRunReport.valid ||
                        restoreConfirmText.trim() !== 'RESTORE'
                      }
                      onClick={() => void runRestoreAction('execute')}
                    >
                      2. Execute transactional restore
                    </Button>
                  </div>
                </div>
              ) : null}

              {lastRestoreResult ? (
                <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                  Last restore: {lastRestoreResult.restoredRows} row(s) across{' '}
                  {lastRestoreResult.restoredTables} table(s), {lastRestoreResult.syncedSequences}{' '}
                  sequence(s) synced in {lastRestoreResult.durationMs}ms
                  {lastRestoreResult.safetySnapshotName
                    ? ` (Safety snapshot: ${lastRestoreResult.safetySnapshotName})`
                    : ''}
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: REPAIR & MAINTENANCE */}
        <TabsContent value="repair" className="acn:space-y-6">
          <div className="acn:grid acn:gap-4 acn:md:grid-cols-2 acn:lg:grid-cols-3">
            {REPAIR_ACTION_META.map((item) => {
              const key = `repair:${item.action}`
              return (
                <Card key={item.action} className="acn:flex acn:flex-col acn:justify-between">
                  <CardHeader>
                    <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
                      <CardTitle className="acn:text-base">{item.label}</CardTitle>
                      {item.prefersUnpooled ? (
                        <Badge variant="outline">Direct URL</Badge>
                      ) : null}
                    </div>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyKey !== null}
                      onClick={() => void runRepair(item.action)}
                    >
                      <PlayIcon aria-hidden className="acn:size-3.5" />
                      {busyKey === key ? 'Running…' : 'Run action'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {lastRepairResult ? (
            <div
              role="status"
              className="acn:rounded-lg acn:border acn:border-border acn:bg-muted/30 acn:px-4 acn:py-3 acn:text-sm"
            >
              <strong>{lastRepairResult.summary}</strong>{' '}
              <span className="acn:text-xs acn:text-muted-foreground">
                ({lastRepairResult.durationMs} ms ·{' '}
                {lastRepairResult.usedUnpooledConnection ? 'unpooled direct' : 'pooled'} connection)
              </span>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Primary-key sequence synchronization status</CardTitle>
              <CardDescription>
                Compares <code>pg_sequences.last_value</code> against <code>MAX(id)</code> on every
                serial/identity column so inserts never fail with duplicate-key errors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot.sequences.length === 0 ? (
                <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                  No serial/identity sequences detected or database not connected.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table.Column</TableHead>
                      <TableHead>Sequence</TableHead>
                      <TableHead className="acn:text-right">Sequence last_value</TableHead>
                      <TableHead className="acn:text-right">Table MAX(id)</TableHead>
                      <TableHead className="acn:text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.sequences.map((seq) => (
                      <TableRow key={`${seq.tableName}.${seq.columnName}`}>
                        <TableCell className="acn:font-mono acn:text-xs">
                          {seq.tableName}.{seq.columnName}
                        </TableCell>
                        <TableCell className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                          {seq.sequenceName}
                        </TableCell>
                        <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                          {seq.lastValue}
                        </TableCell>
                        <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                          {seq.maxId}
                        </TableCell>
                        <TableCell className="acn:text-right">
                          <RunStatus
                            tone={seq.inSync ? 'good' : 'poor'}
                            label={seq.inSync ? 'In sync' : 'Drifted'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: SERVERLESS PROVIDER ADAPTERS */}
        <TabsContent value="provider" className="acn:space-y-6">
          <div className="acn:flex acn:flex-wrap acn:gap-2">
            {snapshot.providers.map((prov) => (
              <Button
                key={prov.slug}
                type="button"
                size="sm"
                variant={selectedProvider === prov.slug ? 'default' : 'outline'}
                onClick={() => setSelectedProvider(prov.slug)}
              >
                <DatabaseIcon aria-hidden className="acn:size-4" />
                {prov.name}
                {prov.detectedFromHost ? (
                  <Badge variant="secondary" className="acn:ml-1">
                    Active DB
                  </Badge>
                ) : null}
              </Button>
            ))}
          </div>

          {currentProviderDesc ? (
            currentProviderDesc.result.status !== 'ok' ? (
              <Card>
                <CardHeader>
                  <CardTitle>{currentProviderDesc.name} — Advanced API Controls</CardTitle>
                  <CardDescription>
                    Optional Tier-2 integration. All Tier-1 PostgreSQL monitoring, logical backups,
                    restores, and repairs remain 100% operational without a provider API key.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {currentProviderDesc.result.status === 'not-configured' ? (
                    <IntegrationNotice
                      service={currentProviderDesc.name}
                      state="not-configured"
                      isAdmin={isAdminUser}
                      missing={currentProviderDesc.result.missing}
                      docsURL={currentProviderDesc.docsUrl}
                      hint={
                        currentProviderDesc.optionalEnv.length > 0
                          ? `Optional variables: ${currentProviderDesc.optionalEnv.join(', ')} (auto-detected from POSTGRES_URL when omitted).`
                          : undefined
                      }
                    />
                  ) : (
                    <IntegrationNotice
                      service={currentProviderDesc.name}
                      state="error"
                      isAdmin={isAdminUser}
                      message={currentProviderDesc.result.message}
                      action={currentProviderDesc.result.action}
                    />
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="acn:space-y-6">
                {/* Connected Provider Overview */}
                <Card>
                  <CardHeader>
                    <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
                      <div>
                        <CardTitle>
                          {currentProviderDesc.result.data.projectName}{' '}
                          <span className="acn:font-mono acn:text-sm acn:font-normal acn:text-muted-foreground">
                            ({currentProviderDesc.result.data.projectId})
                          </span>
                        </CardTitle>
                        <CardDescription>
                          Region: {currentProviderDesc.result.data.regionId} · PostgreSQL{' '}
                          {currentProviderDesc.result.data.pgVersion}
                          {currentProviderDesc.result.data.autoDetectedProject
                            ? ' · Auto-matched from POSTGRES_URL endpoint'
                            : ''}
                        </CardDescription>
                      </div>
                      <RunStatus tone="good" label="API connected" />
                    </div>
                  </CardHeader>
                  {currentProviderDesc.result.data.notes?.length ? (
                    <CardContent className="acn:text-xs acn:text-muted-foreground">
                      {currentProviderDesc.result.data.notes.join(' ')}
                    </CardContent>
                  ) : null}
                </Card>

                {/* Instant Copy-on-Write Snapshots */}
                {currentProviderDesc.slug === 'neon' ? (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>Instant Copy-on-Write Snapshots</CardTitle>
                        <CardDescription>
                          Zero-overhead Neon storage snapshots (`@neon/sdk`) for sub-second rollback
                          or branch cloning.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="acn:space-y-4">
                        <div className="acn:flex acn:flex-wrap acn:items-end acn:gap-3">
                          <div className="acn:min-w-52 acn:flex-1 acn:space-y-1">
                            <Label htmlFor="neon-snap-name">Snapshot name</Label>
                            <Input
                              id="neon-snap-name"
                              value={snapshotNameInput}
                              onChange={(e) => setSnapshotNameInput(e.target.value)}
                              placeholder="pre-migration-v2"
                            />
                          </div>
                          <div className="acn:w-32 acn:space-y-1">
                            <Label htmlFor="neon-snap-ttl">Expire (days)</Label>
                            <Input
                              id="neon-snap-ttl"
                              type="number"
                              min={1}
                              max={365}
                              value={snapshotExpiryDays}
                              onChange={(e) => setSnapshotExpiryDays(e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void postAction(
                                'neon-snap-create',
                                {
                                  action: 'provider-snapshot-create',
                                  provider: 'neon',
                                  name: snapshotNameInput,
                                  expiresInDays: Number(snapshotExpiryDays) || undefined,
                                },
                                'Created instant Neon snapshot.',
                              ).then((res) => {
                                if (res) setSnapshotNameInput('')
                              })
                            }
                          >
                            Create snapshot
                          </Button>
                        </div>

                        {currentProviderDesc.result.data.snapshots.length === 0 ? (
                          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                            No snapshots created on this Neon project yet.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Snapshot</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Expires</TableHead>
                                <TableHead className="acn:text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {currentProviderDesc.result.data.snapshots.map((snap) => (
                                <TableRow key={snap.id}>
                                  <TableCell className="acn:font-mono acn:text-xs">
                                    <div className="acn:font-medium">{snap.name}</div>
                                    <div className="acn:text-[11px] acn:text-muted-foreground">
                                      {snap.id}
                                    </div>
                                  </TableCell>
                                  <TableCell className="acn:text-xs">
                                    {formatDateShort(snap.createdAt)}
                                  </TableCell>
                                  <TableCell className="acn:text-xs acn:text-muted-foreground">
                                    {formatDateShort(snap.expiresAt)}
                                  </TableCell>
                                  <TableCell className="acn:text-right">
                                    <div className="acn:inline-flex acn:gap-1.5">
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="outline"
                                        disabled={busyKey !== null}
                                        onClick={() =>
                                          void postAction(
                                            `snap-restore:${snap.id}`,
                                            {
                                              action: 'provider-snapshot-restore',
                                              provider: 'neon',
                                              snapshotId: snap.id,
                                              newBranchName: `restored-${snap.name.slice(0, 20)}-${Date.now().toString(36)}`,
                                            },
                                            'Restored snapshot into a new isolated Neon branch.',
                                          )
                                        }
                                      >
                                        Restore to branch
                                      </Button>
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        disabled={busyKey !== null}
                                        onClick={() =>
                                          void postAction(
                                            `snap-del:${snap.id}`,
                                            {
                                              action: 'provider-snapshot-delete',
                                              provider: 'neon',
                                              snapshotId: snap.id,
                                            },
                                            'Snapshot deleted.',
                                          )
                                        }
                                      >
                                        <Trash2Icon aria-hidden className="acn:size-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>

                    {/* Branches & Point-in-Time Recovery */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Zero-Copy Branches &amp; Point-in-Time Recovery (PITR)</CardTitle>
                        <CardDescription>
                          Spin up isolated copy-on-write branches from HEAD or a historical timestamp
                          with optional auto-expiry TTL so preview branches never accumulate cost.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="acn:space-y-4">
                        <div className="acn:grid acn:gap-3 acn:md:grid-cols-4">
                          <div className="acn:space-y-1">
                            <Label htmlFor="neon-branch-name">Branch name</Label>
                            <Input
                              id="neon-branch-name"
                              value={branchNameInput}
                              onChange={(e) => setBranchNameInput(e.target.value)}
                              placeholder="pitr-verify-oct26"
                            />
                          </div>
                          <div className="acn:space-y-1">
                            <Label htmlFor="neon-pitr-ts">PITR timestamp (optional ISO)</Label>
                            <Input
                              id="neon-pitr-ts"
                              value={branchPitrTimestamp}
                              onChange={(e) => setBranchPitrTimestamp(e.target.value)}
                              placeholder="2026-10-26T10:00:00Z"
                            />
                          </div>
                          <div className="acn:space-y-1">
                            <Label htmlFor="neon-branch-ttl">Auto-expire TTL (hours)</Label>
                            <Input
                              id="neon-branch-ttl"
                              type="number"
                              min={0}
                              value={branchTtlHours}
                              onChange={(e) => setBranchTtlHours(e.target.value)}
                            />
                          </div>
                          <div className="acn:flex acn:items-end acn:gap-2">
                            <Button
                              type="button"
                              disabled={busyKey !== null || !branchNameInput.trim()}
                              onClick={() =>
                                void postAction(
                                  'neon-branch-create',
                                  {
                                    action: 'provider-branch-create',
                                    provider: 'neon',
                                    name: branchNameInput,
                                    parentTimestamp: branchPitrTimestamp || undefined,
                                    expiresInHours: Number(branchTtlHours) || undefined,
                                    noCompute: branchNoCompute,
                                  },
                                  'Created Neon database branch.',
                                ).then((res) => {
                                  if (res) setBranchNameInput('')
                                })
                              }
                            >
                              <GitBranchIcon aria-hidden className="acn:size-4" />
                              Create branch
                            </Button>
                          </div>
                        </div>

                        <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
                          <Checkbox
                            checked={branchNoCompute}
                            onCheckedChange={(v) => setBranchNoCompute(Boolean(v))}
                          />
                          <span>Storage-only branch (`noCompute: true` — zero compute hours until attached)</span>
                        </label>

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Branch</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead className="acn:text-right">Logical size</TableHead>
                              <TableHead>Expires</TableHead>
                              <TableHead className="acn:text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentProviderDesc.result.data.branches.map((br) => (
                              <TableRow key={br.id}>
                                <TableCell className="acn:font-mono acn:text-xs">
                                  <div className="acn:flex acn:items-center acn:gap-1.5">
                                    <span className="acn:font-medium">{br.name}</span>
                                    {br.isDefault ? <Badge>Default</Badge> : null}
                                    {br.isProtected ? <Badge variant="secondary">Protected</Badge> : null}
                                  </div>
                                  <div className="acn:text-[11px] acn:text-muted-foreground">
                                    {br.id}
                                  </div>
                                </TableCell>
                                <TableCell className="acn:text-xs">{br.currentState}</TableCell>
                                <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                                  {formatBytes(br.logicalSizeBytes)}
                                </TableCell>
                                <TableCell className="acn:text-xs acn:text-muted-foreground">
                                  {formatDateShort(br.expiresAt)}
                                </TableCell>
                                <TableCell className="acn:text-right">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={busyKey !== null || br.isDefault || br.isProtected}
                                    onClick={() =>
                                      void postAction(
                                        `br-del:${br.id}`,
                                        {
                                          action: 'provider-branch-delete',
                                          provider: 'neon',
                                          branchId: br.id,
                                        },
                                        `Deleted branch "${br.name}".`,
                                      )
                                    }
                                  >
                                    <Trash2Icon aria-hidden className="acn:size-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Compute Endpoints */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Serverless Compute Endpoints</CardTitle>
                        <CardDescription>
                          Inspect CU autoscaling bounds and wake, suspend, or restart Neon compute
                          nodes.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Endpoint</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Autoscaling</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead className="acn:text-right">Controls</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentProviderDesc.result.data.endpoints.map((ep) => (
                              <TableRow key={ep.id}>
                                <TableCell className="acn:font-mono acn:text-xs">
                                  <div className="acn:flex acn:items-center acn:gap-1.5">
                                    <CpuIcon aria-hidden className="acn:size-3.5" />
                                    <span>{ep.id}</span>
                                  </div>
                                  <div className="acn:text-[11px] acn:text-muted-foreground">
                                    {ep.host}
                                  </div>
                                </TableCell>
                                <TableCell className="acn:text-xs">{ep.type}</TableCell>
                                <TableCell className="acn:font-mono acn:text-xs">
                                  {ep.minCu} – {ep.maxCu} CU
                                </TableCell>
                                <TableCell className="acn:text-xs">
                                  <RunStatus
                                    tone={ep.currentState === 'active' ? 'good' : 'muted'}
                                    label={ep.currentState}
                                  />
                                </TableCell>
                                <TableCell className="acn:text-right">
                                  <div className="acn:inline-flex acn:gap-1.5">
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="outline"
                                      disabled={busyKey !== null}
                                      onClick={() =>
                                        void postAction(
                                          `ep:start:${ep.id}`,
                                          {
                                            action: 'provider-compute',
                                            provider: 'neon',
                                            endpointId: ep.id,
                                            operation: 'start',
                                          },
                                          `Started compute ${ep.id}.`,
                                        )
                                      }
                                    >
                                      Start
                                    </Button>
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="outline"
                                      disabled={busyKey !== null}
                                      onClick={() =>
                                        void postAction(
                                          `ep:suspend:${ep.id}`,
                                          {
                                            action: 'provider-compute',
                                            provider: 'neon',
                                            endpointId: ep.id,
                                            operation: 'suspend',
                                          },
                                          `Suspended compute ${ep.id}.`,
                                        )
                                      }
                                    >
                                      Suspend
                                    </Button>
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="outline"
                                      disabled={busyKey !== null}
                                      onClick={() =>
                                        void postAction(
                                          `ep:restart:${ep.id}`,
                                          {
                                            action: 'provider-compute',
                                            provider: 'neon',
                                            endpointId: ep.id,
                                            operation: 'restart',
                                          },
                                          `Restarted compute ${ep.id}.`,
                                        )
                                      }
                                    >
                                      Restart
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  /* Supabase / Prisma Postgres Snapshots list when connected */
                  currentProviderDesc.result.data.snapshots.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Cloud Provider Backups</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Backup</TableHead>
                              <TableHead>Created</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentProviderDesc.result.data.snapshots.map((snap) => (
                              <TableRow key={snap.id}>
                                <TableCell className="acn:font-mono acn:text-xs">{snap.id}</TableCell>
                                <TableCell className="acn:text-xs">{snap.name}</TableCell>
                                <TableCell className="acn:text-xs">
                                  {formatDateShort(snap.createdAt)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            )
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
