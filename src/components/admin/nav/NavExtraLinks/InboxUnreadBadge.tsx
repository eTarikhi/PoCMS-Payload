'use client'

import React, { useEffect, useState } from 'react'

export function InboxUnreadBadge({
  initialUnread = 0,
  apiRoute,
}: {
  initialUnread?: number
  apiRoute: string
}) {
  const [unread, setUnread] = useState(initialUnread)

  useEffect(() => {
    // Skip background network fetch inside unit/JSDOM tests unless explicitly mocked
    if (process.env.NODE_ENV === 'test') return

    let active = true
    const refresh = async () => {
      try {
        const res = await fetch(`${apiRoute}/mail/unread-count`, {
          credentials: 'include',
        })
        if (!res.ok || !active) return
        const data = (await res.json()) as { inboxUnread?: number }
        if (typeof data.inboxUnread === 'number' && active) {
          setUnread(data.inboxUnread)
        }
      } catch {
        // Ignore transient network errors in sidebar polling.
      }
    }

    const initTimer = setTimeout(() => {
      void refresh()
    }, 50)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }, 30_000)

    return () => {
      active = false
      clearTimeout(initTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    }
  }, [apiRoute])

  if (unread <= 0) return null

  return (
    <span
      data-testid="nav-inbox-unread-badge"
      className="acn:ml-auto acn:rounded-full acn:bg-primary/15 acn:px-1.5 acn:py-0.5 acn:font-mono acn:text-[11px] acn:font-semibold acn:leading-none acn:text-foreground"
    >
      {unread > 99 ? '99+' : unread}
    </span>
  )
}
