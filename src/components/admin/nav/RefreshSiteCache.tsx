'use client'

import { toast, useConfig } from '@payloadcms/ui'
import { RefreshCwIcon } from 'lucide-react'
import React, { useState } from 'react'

/**
 * Settings-menu item (gear, bottom of the sidebar) for every signed-in user: makes the public site
 * show the latest content on the next visit. Calls POST /api/revalidate-site.
 */
export function RefreshSiteCache() {
  const { config } = useConfig()
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${config.serverURL}${config.routes.api}/revalidate-site`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success('The site will show the latest content on the next visit.')
    } catch {
      toast.error('Could not refresh the site cache. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      data-testid="refresh-site-cache"
      onClick={refresh}
      disabled={busy}
      aria-busy={busy}
      className="acn:flex acn:w-full acn:cursor-pointer acn:items-center acn:gap-2 acn:border-0 acn:bg-transparent acn:px-3 acn:py-1.5 acn:text-left acn:text-sm acn:text-foreground acn:hover:bg-muted acn:disabled:cursor-wait acn:disabled:opacity-60 acn:[&_svg]:size-4"
    >
      <RefreshCwIcon aria-hidden className={busy ? 'acn:animate-spin' : undefined} />
      {busy ? 'Refreshing…' : 'Refresh site cache'}
    </button>
  )
}

export default RefreshSiteCache
