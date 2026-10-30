import type { ServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { hasCapability } from '@/access/permissions'

import { InboxUnreadBadge } from './InboxUnreadBadge'

/**
 * `admin.components.afterNavLinks`: "View site" for everyone and capability-gated Admin tools,
 * styled with Payload's own nav-link classes (icons come from nav-icons.css). The site URL is
 * NEXT_PUBLIC_SITE_URL when set, otherwise the same origin.
 */
export function NavExtraLinks({ payload, user }: ServerProps) {
  const siteURL = process.env.NEXT_PUBLIC_SITE_URL || '/'
  const adminRoute = payload.config.routes.admin
  const apiRoute = payload.config.routes.api || '/api'
  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div className="nav-extra acn:mt-5 acn:flex acn:flex-col acn:self-stretch acn:border-t acn:border-border acn:pt-4">
      {hasCapability(user, 'manageInbox') ? (
        <Link className="nav__link" href={`${adminRoute}/inbox`} id="nav-inbox">
          <span className="nav__link-label">Mail inbox</span>
          <InboxUnreadBadge apiRoute={apiRoute} />
        </Link>
      ) : null}
      <a
        className="nav__link"
        href={siteURL}
        target="_blank"
        rel="noopener noreferrer"
        id="nav-view-site"
      >
        <span className="nav__link-label">
          View site<span className="acn:sr-only"> (opens in a new tab)</span>
        </span>
      </a>
      {hasCapability(user, 'viewSystem') ? (
        <Link className="nav__link" href={`${adminRoute}/system`} id="nav-system">
          <span className="nav__link-label">System info</span>
        </Link>
      ) : null}
      {hasCapability(user, 'manageDatabase') ? (
        <Link className="nav__link" href={`${adminRoute}/database`} id="nav-database">
          <span className="nav__link-label">Database</span>
        </Link>
      ) : null}
      {hasCapability(user, 'manageJobs') ? (
        <Link className="nav__link" href={`${adminRoute}/jobs`} id="nav-jobs">
          <span className="nav__link-label">Scheduled jobs</span>
        </Link>
      ) : null}
      {isDev && hasCapability(user, 'useTerminal') ? (
        <Link className="nav__link" href={`${adminRoute}/terminal`} id="nav-terminal">
          <span className="nav__link-label">Terminal</span>
        </Link>
      ) : null}
      {hasCapability(user, 'useDeveloperTools') ? (
        <Link className="nav__link" href={`${adminRoute}/gallery`} id="nav-gallery">
          <span className="nav__link-label">Components</span>
        </Link>
      ) : null}
    </div>
  )
}

export default NavExtraLinks
