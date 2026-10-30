'use client'

import { toast, useAuth, useDocumentInfo } from '@payloadcms/ui'
import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'

import { can, hasCapability } from '@/access/permissions'
import {
  DEFAULT_RETENTION_KEEP_PER_DOC,
  isVersionedContentCollection,
  type DocumentVersionStats,
} from '@/lib/versionRetentionShared'

export function DocumentVersionRetention() {
  const { id, collectionSlug } = useDocumentInfo()
  const { user } = useAuth()

  const validCollection = isVersionedContentCollection(collectionSlug) ? collectionSlug : null
  const allowed = Boolean(
    validCollection &&
      user &&
      (can(user, validCollection, 'delete') || hasCapability(user, 'manageDatabase')),
  )

  const [keepLatest, setKeepLatest] = useState<string>(String(DEFAULT_RETENTION_KEEP_PER_DOC))
  const [stats, setStats] = useState<DocumentVersionStats | null>(null)
  const [busy, setBusy] = useState(false)

  const keepNumber = Math.min(100, Math.max(1, Number.parseInt(keepLatest, 10) || DEFAULT_RETENTION_KEEP_PER_DOC))

  const fetchStats = useCallback(
    async (keepVal: number) => {
      if (!id || !validCollection || !allowed) return
      try {
        const qs = new URLSearchParams({
          collection: validCollection,
          parentId: String(id),
          keepLatestPerDoc: String(keepVal),
        })
        const res = await fetch(`/api/admin-versions?${qs.toString()}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const json = (await res.json()) as { document?: DocumentVersionStats }
        if (json.document) {
          setStats(json.document)
        }
      } catch {
        // Silent fallback when offline
      }
    },
    [allowed, id, validCollection],
  )

  useEffect(() => {
    if (!id || !validCollection || !allowed) return
    let cancelled = false
    const qs = new URLSearchParams({
      collection: validCollection,
      parentId: String(id),
      keepLatestPerDoc: String(keepNumber),
    })
    void fetch(`/api/admin-versions?${qs.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { document?: DocumentVersionStats } | null) => {
        if (!cancelled && json?.document) {
          setStats(json.document)
        }
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [allowed, id, keepNumber, validCollection])

  if (!id || !validCollection || !allowed) {
    return null
  }

  const handlePrune = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin-versions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: validCollection,
          parentId: id,
          keepLatestPerDoc: keepNumber,
          pruneAutosaveSnapshots: true,
          dryRun: false,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        report?: { totalDeleted: number; totalProtected: number }
        document?: DocumentVersionStats
      }
      if (!res.ok) {
        toast.error(json.error || 'Unable to prune document versions.')
        return
      }
      if (json.document) {
        setStats(json.document)
      } else {
        await fetchStats(keepNumber)
      }
      const deleted = json.report?.totalDeleted ?? 0
      if (deleted > 0) {
        toast.success(
          `Pruned ${deleted} old version${deleted === 1 ? '' : 's'} (active & published preserved).`,
        )
      } else {
        toast.info('No obsolete versions to prune under this retention limit.')
      }
    } catch {
      toast.error('Network error while pruning document versions.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="document-version-retention"
      style={{
        marginTop: '1rem',
        padding: '0.85rem',
        borderRadius: '8px',
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text)' }}>
          Version Retention
        </span>
        <Link
          href={`/admin/collections/${validCollection}/${String(id)}/versions`}
          style={{
            fontSize: '0.74rem',
            color: 'var(--theme-elevation-650)',
            textDecoration: 'underline',
          }}
        >
          View history
        </Link>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-600)', lineHeight: 1.45 }}>
        {stats ? (
          <>
            <strong>{stats.totalVersions}</strong> stored ·{' '}
            <strong>{stats.protectedVersions}</strong> kept ·{' '}
            <strong>{stats.prunableVersions}</strong> prunable
          </>
        ) : (
          'Checking stored version snapshots…'
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label
          htmlFor={`keep-versions-${String(id)}`}
          style={{ fontSize: '0.74rem', color: 'var(--theme-elevation-650)', whiteSpace: 'nowrap' }}
        >
          Keep latest:
        </label>
        <input
          id={`keep-versions-${String(id)}`}
          type="number"
          min={1}
          max={100}
          value={keepLatest}
          onChange={(e) => setKeepLatest(e.target.value)}
          style={{
            width: '64px',
            padding: '0.25rem 0.45rem',
            fontSize: '0.76rem',
            borderRadius: '6px',
            border: '1px solid var(--theme-elevation-200)',
            background: 'var(--theme-input-bg, var(--theme-bg))',
            color: 'var(--theme-text)',
          }}
        />
        <button
          type="button"
          onClick={() => void handlePrune()}
          disabled={busy || (stats !== null && stats.prunableVersions === 0)}
          style={{
            marginLeft: 'auto',
            padding: '0.32rem 0.68rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '6px',
            border: '1px solid var(--theme-elevation-250)',
            background:
              stats && stats.prunableVersions > 0
                ? 'var(--theme-elevation-150)'
                : 'transparent',
            color:
              stats && stats.prunableVersions > 0
                ? 'var(--theme-text)'
                : 'var(--theme-elevation-450)',
            cursor:
              busy || (stats !== null && stats.prunableVersions === 0)
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          {busy ? 'Pruning…' : 'Prune old'}
        </button>
      </div>

      <div style={{ fontSize: '0.69rem', color: 'var(--theme-elevation-500)', lineHeight: 1.35 }}>
        Active latest and newest published snapshots are always protected.
      </div>
    </div>
  )
}

export default DocumentVersionRetention
