'use client'

import { toast } from '@payloadcms/ui'
import { PlayIcon, RefreshCwIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'

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
import { Label } from '@/components/admin/elements/Label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { cn } from '@/components/admin/utilities/cn'
import {
  DEFAULT_MAX_VERSIONS_PER_DOC,
  DEFAULT_RETENTION_KEEP_PER_DOC,
  type VersionPruneReport,
  type VersionRetentionOverview,
} from '@/lib/versionRetentionShared'

const formatDateShort = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function VersionRetentionPanel({
  apiRoute,
  onPruned,
}: {
  apiRoute: string
  onPruned?: () => void
}) {
  const [targetCollection, setTargetCollection] = useState<'all' | 'articles' | 'projects'>('all')
  const [keepLatest, setKeepLatest] = useState<string>(String(DEFAULT_RETENTION_KEEP_PER_DOC))
  const [maxAgeDays, setMaxAgeDays] = useState<string>('')
  const [pruneAutosaves, setPruneAutosaves] = useState<boolean>(true)
  const [overview, setOverview] = useState<VersionRetentionOverview | null>(null)
  const [lastReport, setLastReport] = useState<VersionPruneReport | null>(null)
  const [busyMode, setBusyMode] = useState<'refresh' | 'dry-run' | 'prune' | null>(null)

  const parsedKeep = Math.min(
    100,
    Math.max(1, Number.parseInt(keepLatest, 10) || DEFAULT_RETENTION_KEEP_PER_DOC),
  )
  const parsedAge =
    maxAgeDays.trim().length > 0 && Number.parseInt(maxAgeDays, 10) > 0
      ? Number.parseInt(maxAgeDays, 10)
      : null

  const loadOverview = useCallback(async () => {
    setBusyMode('refresh')
    try {
      const qs = new URLSearchParams({
        collection: 'all',
        keepLatestPerDoc: String(parsedKeep),
        pruneAutosaveSnapshots: String(pruneAutosaves),
      })
      if (parsedAge !== null) {
        qs.set('maxAgeDays', String(parsedAge))
      }
      const res = await fetch(`${apiRoute}/admin-versions?${qs.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) return
      const json = (await res.json()) as { overview?: VersionRetentionOverview }
      if (json.overview) {
        setOverview(json.overview)
      }
    } catch {
      // Safe fallback in test or offline environments
    } finally {
      setBusyMode(null)
    }
  }, [apiRoute, parsedAge, parsedKeep, pruneAutosaves])

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({
      collection: 'all',
      keepLatestPerDoc: String(parsedKeep),
      pruneAutosaveSnapshots: String(pruneAutosaves),
    })
    if (parsedAge !== null) {
      qs.set('maxAgeDays', String(parsedAge))
    }

    void fetch(`${apiRoute}/admin-versions?${qs.toString()}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { overview?: VersionRetentionOverview } | null) => {
        if (!cancelled && json?.overview) {
          setOverview(json.overview)
        }
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [apiRoute, parsedAge, parsedKeep, pruneAutosaves])

  const executePrune = async (dryRun: boolean) => {
    setBusyMode(dryRun ? 'dry-run' : 'prune')
    try {
      const res = await fetch(`${apiRoute}/admin-versions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: targetCollection,
          keepLatestPerDoc: parsedKeep,
          maxAgeDays: parsedAge,
          pruneAutosaveSnapshots: pruneAutosaves,
          dryRun,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        report?: VersionPruneReport
        overview?: VersionRetentionOverview
      }
      if (!res.ok) {
        toast.error(json.error || 'Version retention request failed.')
        return
      }
      if (json.report) {
        setLastReport(json.report)
      }
      if (json.overview) {
        setOverview(json.overview)
      }
      if (dryRun) {
        toast.info(
          `Dry-run preview: ${json.report?.totalDeleted ?? 0} snapshot(s) eligible for pruning (${json.report?.totalProtected ?? 0} protected).`,
        )
      } else {
        const deleted = json.report?.totalDeleted ?? 0
        toast.success(
          deleted > 0
            ? `Pruned ${deleted} historical version snapshot(s).`
            : 'No obsolete versions matched the retention policy.',
        )
        if (deleted > 0 && onPruned) {
          onPruned()
        }
      }
    } catch {
      toast.error('Network error running version retention.')
    } finally {
      setBusyMode(null)
    }
  }

  return (
    <div data-testid="version-retention-panel" className="acn:space-y-6">
      <Card>
        <CardHeader className="acn:flex acn:flex-wrap acn:flex-row acn:items-start acn:justify-between acn:gap-4">
          <div className="acn:space-y-1">
            <div className="acn:flex acn:items-center acn:gap-2">
              <CardTitle>Content Version Retention &amp; Bulk Pruning</CardTitle>
              <Badge variant="outline">maxPerDoc: {DEFAULT_MAX_VERSIONS_PER_DOC}</Badge>
            </div>
            <CardDescription>
              Reclaim PostgreSQL space across <code>_articles_v</code> and <code>_projects_v</code>{' '}
              (including child gallery &amp; Lexical block version tables). Active{' '}
              <code>latest</code> working heads and the newest <code>published</code> snapshot per
              document are strictly protected and never deleted.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyMode !== null}
            onClick={() => void loadOverview()}
          >
            <RefreshCwIcon
              aria-hidden
              className={cn('acn:size-3.5', busyMode === 'refresh' && 'acn:animate-spin')}
            />
            Refresh counts
          </Button>
        </CardHeader>

        <CardContent className="acn:space-y-6">
          {/* Policy controls */}
          <div className="acn:grid acn:gap-4 acn:md:grid-cols-4">
            <div className="acn:space-y-1.5">
              <Label htmlFor="vr-collection">Target collection</Label>
              <select
                id="vr-collection"
                value={targetCollection}
                onChange={(e) =>
                  setTargetCollection(e.target.value as 'all' | 'articles' | 'projects')
                }
                className="acn:flex acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-3 acn:py-1 acn:text-sm"
              >
                <option value="all">Articles &amp; Projects (All)</option>
                <option value="articles">Articles only (_articles_v)</option>
                <option value="projects">Projects only (_projects_v)</option>
              </select>
            </div>

            <div className="acn:space-y-1.5">
              <Label htmlFor="vr-keep-latest">Keep latest versions / doc</Label>
              <Input
                id="vr-keep-latest"
                type="number"
                min={1}
                max={100}
                value={keepLatest}
                onChange={(e) => setKeepLatest(e.target.value)}
              />
            </div>

            <div className="acn:space-y-1.5">
              <Label htmlFor="vr-max-age">Prune older than (days, optional)</Label>
              <Input
                id="vr-max-age"
                type="number"
                min={1}
                max={3650}
                placeholder="No age cutoff"
                value={maxAgeDays}
                onChange={(e) => setMaxAgeDays(e.target.value)}
              />
            </div>

            <div className="acn:flex acn:items-end acn:pb-1.5">
              <label className="acn:flex acn:cursor-pointer acn:items-center acn:gap-2 acn:text-xs">
                <Checkbox
                  checked={pruneAutosaves}
                  onCheckedChange={(checked) => setPruneAutosaves(Boolean(checked))}
                />
                <span>Prune non-latest autosave rows</span>
              </label>
            </div>
          </div>

          {/* Live Version Table */}
          {overview ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection</TableHead>
                  <TableHead className="acn:text-right">Auto cap</TableHead>
                  <TableHead className="acn:text-right">Documents</TableHead>
                  <TableHead className="acn:text-right">Stored versions</TableHead>
                  <TableHead className="acn:text-right">Protected</TableHead>
                  <TableHead className="acn:text-right">Prunable</TableHead>
                  <TableHead className="acn:text-right">Oldest snapshot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.collections.map((row) => (
                  <TableRow key={row.collection}>
                    <TableCell className="acn:font-medium">
                      {row.label}{' '}
                      <span className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                        (_{row.collection}_v)
                      </span>
                    </TableCell>
                    <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                      {row.maxPerDocCap} / doc
                    </TableCell>
                    <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                      {row.distinctParents}
                    </TableCell>
                    <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                      {row.totalVersions}
                    </TableCell>
                    <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                      {row.protectedVersions}
                    </TableCell>
                    <TableCell className="acn:text-right acn:font-mono acn:text-xs">
                      <Badge variant={row.prunableVersions > 0 ? 'secondary' : 'outline'}>
                        {row.prunableVersions}
                      </Badge>
                    </TableCell>
                    <TableCell className="acn:text-right acn:text-xs acn:text-muted-foreground">
                      {formatDateShort(row.oldestVersionAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
              Connect POSTGRES_URL or click Refresh counts to inspect stored collection versions.
            </p>
          )}

          {/* Action bar */}
          <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-3">
            <div className="acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
              <ShieldCheckIcon aria-hidden className="acn:size-4" />
              <span>
                Background task <code>pruneDocumentVersions</code> is also available under Scheduled
                Jobs for automated cron runs.
              </span>
            </div>

            <div className="acn:flex acn:flex-wrap acn:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyMode !== null}
                onClick={() => void executePrune(true)}
              >
                <PlayIcon aria-hidden className="acn:size-3.5" />
                {busyMode === 'dry-run' ? 'Calculating…' : 'Dry-run preview'}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={busyMode !== null}
                onClick={() => void executePrune(false)}
              >
                <Trash2Icon aria-hidden className="acn:size-3.5" />
                {busyMode === 'prune' ? 'Pruning versions…' : 'Prune old versions'}
              </Button>
            </div>
          </div>

          {lastReport ? (
            <div
              role="status"
              className="acn:rounded-lg acn:border acn:border-border acn:bg-muted/30 acn:px-4 acn:py-3 acn:text-xs"
            >
              <strong>{lastReport.dryRun ? 'Dry-run preview:' : 'Prune completed:'}</strong> Scanned{' '}
              {lastReport.totalScanned} version(s), protected {lastReport.totalProtected},{' '}
              {lastReport.dryRun ? 'would delete' : 'deleted'}{' '}
              <strong>{lastReport.totalDeleted}</strong> snapshot(s).
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
