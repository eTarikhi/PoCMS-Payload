import type { ServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { isTerminalEnabled } from '@/terminal/scripts'

/**
 * `admin.components.afterNavLinks`: "View site" for everyone and the component gallery for admins, styled with
 * Payload's own nav-link classes (icons come from nav-icons.css). The site URL is
 * NEXT_PUBLIC_SITE_URL when set, otherwise the same origin.
 */
export function NavExtraLinks({ payload, user }: ServerProps) {
  const siteURL = process.env.NEXT_PUBLIC_SITE_URL || '/'
  return (
    <div className="nav-extra acn:mt-5 acn:flex acn:flex-col acn:self-stretch acn:border-t acn:border-border acn:pt-4">
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
      {hasCapability(user, 'manageJobs') ? (
        <Link className="nav__link" href={`${payload.config.routes.admin}/jobs`} id="nav-jobs">
          <span className="nav__link-label">Scheduled jobs</span>
        </Link>
      ) : null}
      {hasCapability(user, 'viewSystem') ? (
        <Link className="nav__link" href={`${payload.config.routes.admin}/system`} id="nav-system">
          <span className="nav__link-label">System</span>
        </Link>
      ) : null}
      {hasCapability(user, 'manageDatabase') ? (
        <Link className="nav__link" href={`${payload.config.routes.admin}/database`} id="nav-database">
          <span className="nav__link-label">Database</span>
        </Link>
      ) : null}
      {hasCapability(user, 'useTerminal') && isTerminalEnabled() ? (
        <Link
          className="nav__link"
          href={`${payload.config.routes.admin}/terminal`}
          id="nav-terminal"
        >
          <span className="nav__link-label">Terminal</span>
        </Link>
      ) : null}
      {hasCapability(user, 'useDeveloperTools') ? (
        <Link
          className="nav__link"
          href={`${payload.config.routes.admin}/gallery`}
          id="nav-gallery"
        >
          <span className="nav__link-label">Component gallery</span>
        </Link>
      ) : null}
    </div>
  )
}

export default NavExtraLinks
