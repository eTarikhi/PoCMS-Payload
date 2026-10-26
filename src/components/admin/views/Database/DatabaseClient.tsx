'use client'

import { toast } from '@payloadcms/ui'
import {
  ActivityIcon,
  CloudUploadIcon,
  Code2Icon,
  CopyIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  FileCode2Icon,
  GitBranchIcon,
  HardDriveDownloadIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchCodeIcon,
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
  BACKUP_FORMAT_META,
  classifyDatabaseHealth,
  DIAGNOSTIC_SQL_PRESETS,
  formatBytes,
  inferBackupFormatFromFilename,
  REPAIR_ACTION_META,
  type BackupContentMode,
  type BackupExportFormat,
  type CsvRestoreStrategy,
  type DatabaseManagementSnapshot,
  type GeneratedArtifactPreview,
  type MigrationGenMode,
  type ProviderSlug,
  type ReadOnlyQueryResult,
  type RepairActionKind,
  type RepairOperationResult,
  type RestoreDryRunReport,
  type RestoreExecutionResult,
  type SeedGenMode,
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
  const [exportFormat, setExportFormat] = useState<BackupExportFormat>('sql')
  const [exportContentMode, setExportContentMode] =
    useState<BackupContentMode>('schema-and-data')
  const [csvExportTable, setCsvExportTable] = useState<string>(
    initialSnapshot.tables[0]?.tableName ?? 'articles',
  )
  const [selectedExportTables, setSelectedExportTables] = useState<string[]>([])
  const [redactDownload, setRedactDownload] = useState(false)
  const [anonymizeExport, setAnonymizeExport] = useState(false)
  const [encryptDownload, setEncryptDownload] = useState(false)
  const [compressExport, setCompressExport] = useState(false)
  const [upsertSqlExport, setUpsertSqlExport] = useState(false)
  const [vaultLabel, setVaultLabel] = useState('manual')
  const [vaultFormat, setVaultFormat] = useState<'json' | 'sql' | 'ndjson'>('json')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedVaultPath, setSelectedVaultPath] = useState<string>('')
  const [csvRestoreTable, setCsvRestoreTable] = useState<string>(
    initialSnapshot.tables[0]?.tableName ?? 'articles',
  )
  const [csvRestoreStrategy, setCsvRestoreStrategy] =
    useState<CsvRestoreStrategy>('upsert')
  const [dryRunReport, setDryRunReport] = useState<RestoreDryRunReport | null>(null)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [createSafetySnapshot, setCreateSafetySnapshot] = useState(true)
  const [allowRedactedRestore, setAllowRedactedRestore] = useState(false)
  const [lastRestoreResult, setLastRestoreResult] = useState<RestoreExecutionResult | null>(null)

  // Migrations & Seeds Codegen state
  const [migrationName, setMigrationName] = useState('schema_baseline')
  const [migrationMode, setMigrationMode] = useState<MigrationGenMode>('schema-baseline')
  const [migrationTables, setMigrationTables] = useState<string[]>([])
  const [migrationAnonymize, setMigrationAnonymize] = useState(false)
  const [seedName, setSeedName] = useState('live_content_seed')
  const [seedMode, setSeedMode] = useState<SeedGenMode>('payload-local-api')
  const [seedCollections, setSeedCollections] = useState<string[]>([])
  const [seedGlobals, setSeedGlobals] = useState<string[]>([])
  const [seedAnonymize, setSeedAnonymize] = useState(true)
  const [generatedArtifact, setGeneratedArtifact] =
    useState<GeneratedArtifactPreview | null>(null)

  // Read-only SQL Inspector state
  const [sqlInput, setSqlInput] = useState<string>(
    DIAGNOSTIC_SQL_PRESETS[0]?.sql ?? 'SELECT version();',
  )
  const [sqlResult, setSqlResult] = useState<ReadOnlyQueryResult | null>(null)

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
        if (csvRestoreTable) form.append('csvTable', csvRestoreTable)
        form.append('csvStrategy', csvRestoreStrategy)
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
            csvTable: csvRestoreTable,
            csvStrategy: csvRestoreStrategy,
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

  const exportParams = new URLSearchParams({
    source: 'live',
    format: exportFormat,
    contentMode: exportContentMode,
    redact: String(redactDownload),
    anonymize: String(anonymizeExport),
    encrypt: String(encryptDownload),
    compress: String(compressExport),
    upsert: String(upsertSqlExport),
  })
  if (exportFormat === 'csv' && csvExportTable) {
    exportParams.set('csvTable', csvExportTable)
  } else if (selectedExportTables.length > 0) {
    exportParams.set('tables', selectedExportTables.join(','))
  }
  const downloadHref = `${apiRoute}/admin-database/export?${exportParams.toString()}`

  const isSelectedCsv =
    (selectedFile && inferBackupFormatFromFilename(selectedFile.name) === 'csv') ||
    (selectedVaultPath && inferBackupFormatFromFilename(selectedVaultPath) === 'csv')

  const downloadTextArtifact = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const runGenerateMigration = async (writeToDisk: boolean) => {
    const data = await postAction<{ artifact: GeneratedArtifactPreview }>(
      writeToDisk ? 'codegen:mig:write' : 'codegen:mig:preview',
      {
        action: 'generate-migration',
        name: migrationName,
        migrationMode,
        tables: migrationTables.length > 0 ? migrationTables : undefined,
        anonymizePii: migrationAnonymize,
        writeToDisk,
      },
    )
    if (data?.artifact) {
      setGeneratedArtifact(data.artifact)
      toast.success(
        data.artifact.writtenToDisk
          ? `Wrote migration ${data.artifact.relativePath}`
          : `Generated migration preview (${data.artifact.filename})`,
      )
    }
  }

  const runGenerateSeed = async (writeToDisk: boolean) => {
    const data = await postAction<{ artifact: GeneratedArtifactPreview }>(
      writeToDisk ? 'codegen:seed:write' : 'codegen:seed:preview',
      {
        action: 'generate-seed',
        name: seedName,
        seedMode,
        collections: seedCollections.length > 0 ? seedCollections : undefined,
        globals: seedGlobals.length > 0 ? seedGlobals : undefined,
        tables: migrationTables.length > 0 ? migrationTables : undefined,
        anonymizePii: seedAnonymize,
        writeToDisk,
      },
    )
    if (data?.artifact) {
      setGeneratedArtifact(data.artifact)
      toast.success(
        data.artifact.writtenToDisk
          ? `Wrote seed file ${data.artifact.relativePath}`
          : `Generated seed preview (${data.artifact.filename})`,
      )
    }
  }

  const runSqlInspector = async (explain: boolean) => {
    const data = await postAction<{ queryResult: ReadOnlyQueryResult }>(
      explain ? 'sql:explain' : 'sql:run',
      {
        action: 'sql-query',
        sql: sqlInput,
        explain,
        maxRows: 250,
      },
    )
    if (data?.queryResult) {
      setSqlResult(data.queryResult)
    }
  }

  const exportSqlResultAsCsv = () => {
    if (!sqlResult || sqlResult.columns.length === 0) return
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return s.includes('"') || s.includes(',') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }
    const header = sqlResult.columns.map(esc).join(',')
    const rows = sqlResult.rows.map((r) => sqlResult.columns.map((c) => esc(r[c])).join(','))
    downloadTextArtifact('query-result.csv', [header, ...rows].join('\r\n') + '\r\n', 'text/csv;charset=utf-8')
  }

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
        <TabsList className="acn:flex-wrap">
          <TabsTrigger value="health">
            <ActivityIcon aria-hidden className="acn:size-4" />
            Health &amp; Advisor ({snapshot.tables.length})
          </TabsTrigger>
          <TabsTrigger value="backup">
            <HardDriveDownloadIcon aria-hidden className="acn:size-4" />
            Backup &amp; Restore
          </TabsTrigger>
          <TabsTrigger value="codegen">
            <FileCode2Icon aria-hidden className="acn:size-4" />
            Migrations &amp; Seeds
          </TabsTrigger>
          <TabsTrigger value="sql">
            <SearchCodeIcon aria-hidden className="acn:size-4" />
            SQL Inspector
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

        {/* TAB 1: HEALTH & ADVISOR */}
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

          {/* Schema & Query Performance Advisor */}
          <Card>
            <CardHeader>
              <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
                <div>
                  <CardTitle>Schema &amp; query performance advisor</CardTitle>
                  <CardDescription>
                    Detects unindexed foreign keys, zero-scan indexes, orphaned media records, and{' '}
                    <code>pg_stat_statements</code> query hotspots.
                  </CardDescription>
                </div>
                {(snapshot.advisor?.missingFkIndexes.length ?? 0) > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyKey !== null}
                    onClick={() => void runRepair('create-missing-fk-indexes')}
                  >
                    Create {snapshot.advisor?.missingFkIndexes.length} missing FK index(es)
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="acn:space-y-4">
              <div className="acn:flex acn:flex-wrap acn:gap-2">
                <Badge variant="outline">
                  Missing FK indexes: {snapshot.advisor?.missingFkIndexes.length ?? 0}
                </Badge>
                <Badge variant="outline">
                  Unused indexes: {snapshot.advisor?.unusedIndexes.length ?? 0}
                </Badge>
                <Badge variant="outline">
                  Unreferenced media:{' '}
                  {snapshot.advisor?.orphanedMediaCount !== null &&
                  snapshot.advisor?.orphanedMediaCount !== undefined
                    ? snapshot.advisor.orphanedMediaCount
                    : '—'}
                </Badge>
                <Badge variant="outline">
                  pg_stat_statements:{' '}
                  {snapshot.advisor?.pgStatStatementsAvailable ? 'Active' : 'Not enabled'}
                </Badge>
              </div>

              {(snapshot.advisor?.recommendations.length ?? 0) > 0 ? (
                <ul className="acn:m-0 acn:list-disc acn:space-y-1 acn:pl-5 acn:text-xs acn:text-muted-foreground">
                  {snapshot.advisor?.recommendations.map((rec) => (
                    <li key={rec}>{rec}</li>
                  ))}
                </ul>
              ) : null}

              {(snapshot.advisor?.missingFkIndexes.length ?? 0) > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table.Column</TableHead>
                      <TableHead>References</TableHead>
                      <TableHead>Suggested DDL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.advisor?.missingFkIndexes.slice(0, 12).map((fk) => (
                      <TableRow key={`${fk.tableName}.${fk.columnName}`}>
                        <TableCell className="acn:font-mono acn:text-xs">
                          {fk.tableName}.{fk.columnName}
                        </TableCell>
                        <TableCell className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                          {fk.referencedTable}
                        </TableCell>
                        <TableCell className="acn:font-mono acn:text-[11px] acn:text-muted-foreground">
                          {fk.suggestedSql}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}

              {(snapshot.advisor?.slowQueries.length ?? 0) > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Top query (pg_stat_statements)</TableHead>
                      <TableHead className="acn:text-right">Calls</TableHead>
                      <TableHead className="acn:text-right">Mean (ms)</TableHead>
                      <TableHead className="acn:text-right">Total (ms)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.advisor?.slowQueries.map((sq, idx) => (
                      <TableRow key={`${idx}-${sq.calls}`}>
                        <TableCell className="acn:max-w-md acn:truncate acn:font-mono acn:text-xs">
                          {sq.query}
                        </TableCell>
                        <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                          {sq.calls.toLocaleString()}
                        </TableCell>
                        <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                          {sq.meanTimeMs}
                        </TableCell>
                        <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                          {sq.totalTimeMs}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: MULTI-FORMAT BACKUP & RESTORE */}
        <TabsContent value="backup" className="acn:space-y-6">
          <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
            {/* Multi-Format Browser Export */}
            <Card>
              <CardHeader>
                <CardTitle>Multi-format portable backup (Browser download)</CardTitle>
                <CardDescription>
                  Export standard PostgreSQL <code>.sql</code> (compatible with <code>psql</code>{' '}
                  &amp; Neon SQL Editor), structured <code>.json</code>, streaming{' '}
                  <code>.ndjson</code>, or per-table RFC-4180 <code>.csv</code> — 100% pure
                  TypeScript on Vercel Serverless.
                </CardDescription>
              </CardHeader>
              <CardContent className="acn:space-y-4">
                <div className="acn:grid acn:gap-2 acn:sm:grid-cols-2">
                  {BACKUP_FORMAT_META.map((meta) => {
                    const selected = exportFormat === meta.format
                    return (
                      <button
                        key={meta.format}
                        type="button"
                        onClick={() => setExportFormat(meta.format)}
                        className={cn(
                          'acn:rounded-lg acn:border acn:p-2.5 acn:text-left acn:transition-colors',
                          selected
                            ? 'acn:border-primary acn:bg-primary/5'
                            : 'acn:border-border acn:bg-transparent acn:hover:bg-muted/40',
                        )}
                      >
                        <div className="acn:flex acn:items-center acn:justify-between acn:gap-1">
                          <span className="acn:text-xs acn:font-semibold">{meta.label}</span>
                          <Badge variant={selected ? 'default' : 'outline'}>{meta.extension}</Badge>
                        </div>
                        <p className="acn:m-0 acn:mt-1 acn:text-[11px] acn:text-muted-foreground">
                          {meta.description}
                        </p>
                      </button>
                    )
                  })}
                </div>

                {exportFormat === 'csv' ? (
                  <div className="acn:space-y-1.5">
                    <Label htmlFor="csv-export-table">Target table for CSV export</Label>
                    <select
                      id="csv-export-table"
                      value={csvExportTable}
                      onChange={(e) => setCsvExportTable(e.target.value)}
                      className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm"
                    >
                      {(snapshot.codegen?.tables.length
                        ? snapshot.codegen.tables
                        : snapshot.tables.map((t) => ({
                            name: t.tableName,
                            rowCount: t.estimatedLiveRows,
                          }))
                      ).map((tbl) => (
                        <option key={tbl.name} value={tbl.name}>
                          {tbl.name} ({tbl.rowCount} rows)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="acn:grid acn:gap-3 acn:sm:grid-cols-2">
                    <div className="acn:space-y-1">
                      <Label htmlFor="export-content-mode">Content mode</Label>
                      <select
                        id="export-content-mode"
                        value={exportContentMode}
                        onChange={(e) =>
                          setExportContentMode(e.target.value as BackupContentMode)
                        }
                        className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm"
                      >
                        <option value="schema-and-data">Schema + Data (Full dump)</option>
                        <option value="data-only">Data only (INSERTs / rows)</option>
                        <option value="schema-only">Schema only (DDL / structure)</option>
                      </select>
                    </div>
                    <div className="acn:space-y-1">
                      <Label htmlFor="export-table-filter">
                        Selective tables ({selectedExportTables.length || 'All'})
                      </Label>
                      <Input
                        id="export-table-filter"
                        value={selectedExportTables.join(', ')}
                        onChange={(e) =>
                          setSelectedExportTables(
                            e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="Leave blank for all public tables"
                      />
                    </div>
                  </div>
                )}

                <div className="acn:space-y-2">
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                    <Checkbox
                      checked={redactDownload}
                      onCheckedChange={(v) => setRedactDownload(Boolean(v))}
                    />
                    <span>Redact user auth secrets (strip password hashes &amp; sessions)</span>
                  </label>
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                    <Checkbox
                      checked={anonymizeExport}
                      onCheckedChange={(v) => setAnonymizeExport(Boolean(v))}
                    />
                    <span>Anonymize PII (mask emails &amp; audit IPs for staging/dev)</span>
                  </label>
                  {exportFormat === 'sql' && exportContentMode !== 'schema-only' ? (
                    <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                      <Checkbox
                        checked={upsertSqlExport}
                        onCheckedChange={(v) => setUpsertSqlExport(Boolean(v))}
                      />
                      <span>
                        Idempotent SQL (<code>ON CONFLICT DO UPDATE</code> instead of{' '}
                        <code>TRUNCATE</code>)
                      </span>
                    </label>
                  ) : null}
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                    <Checkbox
                      checked={compressExport}
                      onCheckedChange={(v) => setCompressExport(Boolean(v))}
                    />
                    <span>Gzip-compress download (`.gz`)</span>
                  </label>
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                    <Checkbox
                      checked={encryptDownload}
                      onCheckedChange={(v) => setEncryptDownload(Boolean(v))}
                    />
                    <span>
                      Encrypt with AES-256-GCM (`DATABASE_BACKUP_SECRET` / `PAYLOAD_SECRET`)
                    </span>
                  </label>
                </div>

                <a
                  href={downloadHref}
                  className="acn:inline-flex acn:h-9 acn:items-center acn:justify-center acn:gap-2 acn:rounded-md acn:bg-primary acn:px-4 acn:text-sm acn:font-medium acn:text-primary-foreground acn:no-underline acn:hover:opacity-90"
                >
                  <DownloadIcon aria-hidden className="acn:size-4" />
                  Download {exportFormat.toUpperCase()} backup
                </a>
              </CardContent>
            </Card>

            {/* Encrypted Vercel Blob Vault */}
            <Card>
              <CardHeader>
                <CardTitle>Encrypted Cloud Vault &amp; Scheduled Jobs (Vercel Blob)</CardTitle>
                <CardDescription>
                  Off-database disaster recovery archives encrypted with AES-256-GCM in{' '}
                  <code>JSON</code>, <code>SQL</code>, or <code>NDJSON</code> format with automatic
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
                      <div className="acn:min-w-36 acn:flex-1 acn:space-y-1">
                        <Label htmlFor="vault-label">Backup tag</Label>
                        <Input
                          id="vault-label"
                          value={vaultLabel}
                          onChange={(e) => setVaultLabel(e.target.value)}
                          placeholder="pre-deploy"
                        />
                      </div>
                      <div className="acn:w-28 acn:space-y-1">
                        <Label htmlFor="vault-format">Format</Label>
                        <select
                          id="vault-format"
                          value={vaultFormat}
                          onChange={(e) =>
                            setVaultFormat(e.target.value as 'json' | 'sql' | 'ndjson')
                          }
                          className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-2 acn:text-xs"
                        >
                          <option value="json">JSON</option>
                          <option value="sql">SQL</option>
                          <option value="ndjson">NDJSON</option>
                        </select>
                      </div>
                      <Button
                        type="button"
                        disabled={busyKey !== null || !snapshot.vault.encryptionConfigured}
                        onClick={() =>
                          void postAction(
                            'vault-save',
                            {
                              action: 'vault-save',
                              label: vaultLabel,
                              format: vaultFormat,
                              retentionCount: 10,
                            },
                            `Encrypted ${vaultFormat.toUpperCase()} backup uploaded to Vercel Blob.`,
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
                            {
                              action: 'schedule-backup',
                              label: 'queued-vault',
                              format: vaultFormat,
                              retentionCount: 10,
                            },
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
                            <TableHead>Format</TableHead>
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
                              <TableCell>
                                <Badge variant="outline">
                                  {(item.format ?? 'json').toUpperCase()}
                                </Badge>
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

          {/* Universal Atomic Transactional Restore */}
          <Card>
            <CardHeader>
              <CardTitle>
                Universal atomic restore (SQL · JSON · NDJSON · CSV — Dry-run &amp; Transactional)
              </CardTitle>
              <CardDescription>
                Auto-detects plain, gzipped, or AES-256-GCM encrypted <code>.sql</code>,{' '}
                <code>.json</code>, <code>.ndjson</code>, and <code>.csv</code> backups. Executes
                inside a single <code>BEGIN … COMMIT</code> transaction with advisory lock
                protection — rolling back 100% cleanly on any error.
              </CardDescription>
            </CardHeader>
            <CardContent className="acn:space-y-4">
              <div className="acn:grid acn:gap-4 acn:md:grid-cols-2">
                <div className="acn:space-y-1.5">
                  <Label htmlFor="restore-file">
                    Upload backup file (`.sql`, `.json`, `.ndjson`, `.csv`, `.gz`, `.enc.*`)
                  </Label>
                  <Input
                    id="restore-file"
                    type="file"
                    accept=".sql,.json,.ndjson,.jsonl,.csv,.gz,.enc"
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

              {isSelectedCsv ? (
                <div className="acn:grid acn:gap-3 acn:rounded-lg acn:border acn:border-border acn:bg-muted/20 acn:p-3 acn:sm:grid-cols-2">
                  <div className="acn:space-y-1">
                    <Label htmlFor="csv-restore-table">CSV target PostgreSQL table</Label>
                    <select
                      id="csv-restore-table"
                      value={csvRestoreTable}
                      onChange={(e) => setCsvRestoreTable(e.target.value)}
                      className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm"
                    >
                      {snapshot.tables.map((t) => (
                        <option key={t.tableName} value={t.tableName}>
                          {t.tableName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="acn:space-y-1">
                    <Label htmlFor="csv-restore-strategy">CSV import strategy</Label>
                    <select
                      id="csv-restore-strategy"
                      value={csvRestoreStrategy}
                      onChange={(e) =>
                        setCsvRestoreStrategy(e.target.value as CsvRestoreStrategy)
                      }
                      className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm"
                    >
                      <option value="upsert">Upsert rows (ON CONFLICT DO UPDATE)</option>
                      <option value="replace">Replace table (TRUNCATE + INSERT)</option>
                    </select>
                  </div>
                </div>
              ) : null}

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
                    {dryRunReport.detectedFormat ? (
                      <Badge>{dryRunReport.detectedFormat.toUpperCase()}</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {dryRunReport.matchedTables.length} / {dryRunReport.totalTables} tables matched
                    </Badge>
                    <Badge variant="outline">
                      {dryRunReport.sqlStatementCount !== undefined
                        ? `${dryRunReport.sqlStatementCount} SQL statements`
                        : `${dryRunReport.totalRows.toLocaleString()} total rows`}
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
                  Last restore ({(lastRestoreResult.detectedFormat ?? 'json').toUpperCase()}):{' '}
                  {lastRestoreResult.restoredRows} row(s) across {lastRestoreResult.restoredTables}{' '}
                  table(s), {lastRestoreResult.syncedSequences} sequence(s) synced in{' '}
                  {lastRestoreResult.durationMs}ms
                  {lastRestoreResult.safetySnapshotName
                    ? ` (Safety snapshot: ${lastRestoreResult.safetySnapshotName})`
                    : ''}
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: DIRECT DATABASE -> MIGRATION & SEED GENERATORS */}
        <TabsContent value="codegen" className="acn:space-y-6">
          <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
            {/* Database -> Migration File */}
            <Card>
              <CardHeader>
                <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
                  <CardTitle>Generate Migration from Live Database</CardTitle>
                  <Badge variant="outline">
                    {snapshot.codegen?.canWriteToDisk ? 'Disk write ready' : 'Download mode'}
                  </Badge>
                </div>
                <CardDescription>
                  Introspects live PostgreSQL enums, sequences, tables, foreign keys, and rows to
                  generate a Payload v3 <code>@payloadcms/db-vercel-postgres</code> migration (
                  <code>up</code> / <code>down</code>) or standalone <code>.sql</code> file.
                </CardDescription>
              </CardHeader>
              <CardContent className="acn:space-y-4">
                <div className="acn:grid acn:gap-3 acn:sm:grid-cols-2">
                  <div className="acn:space-y-1">
                    <Label htmlFor="mig-name">Migration slug</Label>
                    <Input
                      id="mig-name"
                      value={migrationName}
                      onChange={(e) => setMigrationName(e.target.value)}
                      placeholder="schema_baseline"
                    />
                  </div>
                  <div className="acn:space-y-1">
                    <Label htmlFor="mig-mode">Migration type</Label>
                    <select
                      id="mig-mode"
                      value={migrationMode}
                      onChange={(e) => setMigrationMode(e.target.value as MigrationGenMode)}
                      className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm"
                    >
                      <option value="schema-baseline">Payload TS — Schema baseline (DDL)</option>
                      <option value="data-upsert">Payload TS — Data upsert (ON CONFLICT)</option>
                      <option value="raw-sql">Standalone PostgreSQL .sql migration</option>
                    </select>
                  </div>
                </div>

                <div className="acn:space-y-1">
                  <Label htmlFor="mig-tables">
                    Filter tables (comma-separated, leave blank for all)
                  </Label>
                  <Input
                    id="mig-tables"
                    value={migrationTables.join(', ')}
                    onChange={(e) =>
                      setMigrationTables(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="articles, projects, skills"
                  />
                </div>

                {migrationMode !== 'schema-baseline' ? (
                  <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                    <Checkbox
                      checked={migrationAnonymize}
                      onCheckedChange={(v) => setMigrationAnonymize(Boolean(v))}
                    />
                    <span>Anonymize PII in data rows (emails &amp; audit IPs)</span>
                  </label>
                ) : null}

                <div className="acn:flex acn:flex-wrap acn:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyKey !== null}
                    onClick={() => void runGenerateMigration(false)}
                  >
                    <Code2Icon aria-hidden className="acn:size-4" />
                    Preview migration
                  </Button>
                  {snapshot.codegen?.canWriteToDisk ? (
                    <Button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void runGenerateMigration(true)}
                    >
                      Write to src/migrations/
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Database -> Seed File */}
            <Card>
              <CardHeader>
                <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
                  <CardTitle>Generate Seed File from Live Database</CardTitle>
                  <Badge variant="outline">Portable Local API / SQL</Badge>
                </div>
                <CardDescription>
                  Captures live Payload collections &amp; globals into a replayable TypeScript seed
                  script (resolving <code>media</code> IDs by filename and preserving{' '}
                  <code>_order</code> ranks) or an idempotent SQL seed.
                </CardDescription>
              </CardHeader>
              <CardContent className="acn:space-y-4">
                <div className="acn:grid acn:gap-3 acn:sm:grid-cols-2">
                  <div className="acn:space-y-1">
                    <Label htmlFor="seed-name">Seed filename slug</Label>
                    <Input
                      id="seed-name"
                      value={seedName}
                      onChange={(e) => setSeedName(e.target.value)}
                      placeholder="live_content_seed"
                    />
                  </div>
                  <div className="acn:space-y-1">
                    <Label htmlFor="seed-mode">Seed format</Label>
                    <select
                      id="seed-mode"
                      value={seedMode}
                      onChange={(e) => setSeedMode(e.target.value as SeedGenMode)}
                      className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:text-sm"
                    >
                      <option value="payload-local-api">
                        Payload Local API TypeScript (.ts)
                      </option>
                      <option value="raw-sql-seed">
                        Idempotent PostgreSQL Seed (.seed.sql)
                      </option>
                    </select>
                  </div>
                </div>

                {seedMode === 'payload-local-api' &&
                (snapshot.codegen?.collections.length ?? 0) > 0 ? (
                  <div className="acn:space-y-1.5">
                    <Label>
                      Collections ({seedCollections.length || 'All seedable collections'})
                    </Label>
                    <div className="acn:flex acn:flex-wrap acn:gap-2">
                      {snapshot.codegen?.collections.map((col) => {
                        const checked = seedCollections.includes(col.slug)
                        return (
                          <button
                            key={col.slug}
                            type="button"
                            onClick={() =>
                              setSeedCollections((prev) =>
                                prev.includes(col.slug)
                                  ? prev.filter((x) => x !== col.slug)
                                  : [...prev, col.slug],
                              )
                            }
                            className={cn(
                              'acn:rounded-md acn:border acn:px-2 acn:py-1 acn:font-mono acn:text-xs',
                              checked
                                ? 'acn:border-primary acn:bg-primary/10 acn:font-semibold'
                                : 'acn:border-border acn:text-muted-foreground',
                            )}
                          >
                            {col.slug} ({col.rowCount})
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {seedMode === 'payload-local-api' &&
                (snapshot.codegen?.globals.length ?? 0) > 0 ? (
                  <div className="acn:space-y-1.5">
                    <Label>Globals ({seedGlobals.length || 'All globals'})</Label>
                    <div className="acn:flex acn:flex-wrap acn:gap-2">
                      {snapshot.codegen?.globals.map((g) => {
                        const checked = seedGlobals.includes(g.slug)
                        return (
                          <button
                            key={g.slug}
                            type="button"
                            onClick={() =>
                              setSeedGlobals((prev) =>
                                prev.includes(g.slug)
                                  ? prev.filter((x) => x !== g.slug)
                                  : [...prev, g.slug],
                              )
                            }
                            className={cn(
                              'acn:rounded-md acn:border acn:px-2 acn:py-1 acn:font-mono acn:text-xs',
                              checked
                                ? 'acn:border-primary acn:bg-primary/10 acn:font-semibold'
                                : 'acn:border-border acn:text-muted-foreground',
                            )}
                          >
                            {g.slug}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <label className="acn:flex acn:items-center acn:gap-2 acn:text-xs">
                  <Checkbox
                    checked={seedAnonymize}
                    onCheckedChange={(v) => setSeedAnonymize(Boolean(v))}
                  />
                  <span>Anonymize user PII &amp; strip auth hashes in generated seed</span>
                </label>

                <div className="acn:flex acn:flex-wrap acn:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyKey !== null}
                    onClick={() => void runGenerateSeed(false)}
                  >
                    <Code2Icon aria-hidden className="acn:size-4" />
                    Preview seed
                  </Button>
                  {snapshot.codegen?.canWriteToDisk ? (
                    <Button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void runGenerateSeed(true)}
                    >
                      Write to src/seed/generated/
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Generated Code Preview & Download */}
          {generatedArtifact ? (
            <Card>
              <CardHeader>
                <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
                  <div className="acn:space-y-1">
                    <CardTitle className="acn:font-mono acn:text-base">
                      {generatedArtifact.relativePath}
                    </CardTitle>
                    <CardDescription>
                      {generatedArtifact.tableCount} entities · {generatedArtifact.rowCount} records
                      · {formatBytes(generatedArtifact.sizeBytes)}
                      {generatedArtifact.writtenToDisk ? ' · Saved to workspace disk' : ''}
                    </CardDescription>
                  </div>
                  <div className="acn:flex acn:gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(generatedArtifact.content)
                        toast.success('Copied generated code to clipboard.')
                      }}
                    >
                      <CopyIcon aria-hidden className="acn:size-3.5" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        downloadTextArtifact(generatedArtifact.filename, generatedArtifact.content)
                      }
                    >
                      <DownloadIcon aria-hidden className="acn:size-3.5" />
                      Download {generatedArtifact.filename}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="acn:max-h-96 acn:overflow-auto acn:rounded-lg acn:border acn:border-border acn:bg-muted/40 acn:p-4 acn:font-mono acn:text-xs">
                  <code>{generatedArtifact.content}</code>
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* TAB 4: SAFE READ-ONLY SQL & EXPLAIN INSPECTOR */}
        <TabsContent value="sql" className="acn:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Safe Read-Only SQL &amp; EXPLAIN Inspector</CardTitle>
              <CardDescription>
                Protected by 3 independent layers: single-statement AST allowlist, PostgreSQL{' '}
                <code>BEGIN READ ONLY</code> kernel transaction + <code>statement_timeout = 8s</code>
                , and automatic password-hash redaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="acn:space-y-4">
              <div className="acn:flex acn:flex-wrap acn:gap-1.5">
                {DIAGNOSTIC_SQL_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setSqlInput(preset.sql)}
                    title={preset.description}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              <div className="acn:space-y-1.5">
                <Label htmlFor="readonly-sql-editor">Read-only SQL statement</Label>
                <textarea
                  id="readonly-sql-editor"
                  rows={5}
                  value={sqlInput}
                  onChange={(e) => setSqlInput(e.target.value)}
                  className="acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:p-3 acn:font-mono acn:text-xs"
                  placeholder="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
                />
              </div>

              <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
                <div className="acn:flex acn:gap-2">
                  <Button
                    type="button"
                    disabled={busyKey !== null || !sqlInput.trim()}
                    onClick={() => void runSqlInspector(false)}
                  >
                    <PlayIcon aria-hidden className="acn:size-4" />
                    Run read-only query
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyKey !== null || !sqlInput.trim()}
                    onClick={() => void runSqlInspector(true)}
                  >
                    EXPLAIN plan
                  </Button>
                </div>

                {sqlResult ? (
                  <div className="acn:flex acn:items-center acn:gap-2">
                    <Badge variant="outline">
                      {sqlResult.rowCount} row(s){sqlResult.truncated ? ' (capped at 250)' : ''} ·{' '}
                      {sqlResult.durationMs} ms
                    </Badge>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={exportSqlResultAsCsv}
                    >
                      Export CSV
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        downloadTextArtifact(
                          'query-result.json',
                          JSON.stringify(sqlResult.rows, null, 2),
                          'application/json;charset=utf-8',
                        )
                      }
                    >
                      Export JSON
                    </Button>
                  </div>
                ) : null}
              </div>

              {sqlResult ? (
                sqlResult.columns.length === 0 ? (
                  <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                    Query completed in {sqlResult.durationMs} ms and returned 0 rows.
                  </p>
                ) : (
                  <div className="acn:max-h-96 acn:overflow-auto acn:rounded-lg acn:border acn:border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {sqlResult.columns.map((col) => (
                            <TableHead key={col} className="acn:font-mono acn:text-xs">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sqlResult.rows.map((row, rIdx) => (
                          <TableRow key={rIdx}>
                            {sqlResult.columns.map((col) => {
                              const val = row[col]
                              const formatted =
                                val === null || val === undefined
                                  ? 'NULL'
                                  : typeof val === 'object'
                                    ? JSON.stringify(val)
                                    : String(val)
                              return (
                                <TableCell
                                  key={col}
                                  className="acn:max-w-xs acn:truncate acn:font-mono acn:text-xs"
                                  title={formatted}
                                >
                                  {formatted}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: REPAIR & MAINTENANCE */}
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
