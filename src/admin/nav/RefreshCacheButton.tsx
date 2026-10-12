'use client'

import React, { useState } from 'react'

type Status = 'idle' | 'working' | 'done' | 'error'

/**
 * Settings-menu action that marks the live-site portfolio cache stale on demand.
 * Useful after out-of-band content changes (imports, seeds, manual DB edits) where the
 * admin save hooks could not run. Requires an authenticated admin user (see
 * /api/revalidate). Rendered in the gear menu above the logout button.
 */
export const RefreshCacheButton: React.FC = () => {
  const [status, setStatus] = useState<Status>('idle')

  const refresh = async () => {
    setStatus('working')
    try {
      const res = await fetch('/api/revalidate', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      setStatus('done')
      window.setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
      window.setTimeout(() => setStatus('idle'), 3500)
    }
  }

  const label =
    status === 'working'
      ? 'Refreshing…'
      : status === 'done'
        ? 'Cache refreshed ✓'
        : status === 'error'
          ? 'Refresh failed — retry'
          : 'Refresh live site cache'

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={status === 'working'}
      style={{
        display: 'block',
        width: '100%',
        padding: '6px 12px',
        border: 0,
        background: 'transparent',
        color: 'inherit',
        textAlign: 'left',
        fontSize: 'inherit',
        cursor: status === 'working' ? 'wait' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export default RefreshCacheButton
