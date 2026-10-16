import type { ServerProps } from 'payload'
import { cookies } from 'next/headers'
import Link from 'next/link'
import React from 'react'

import { isAdmin } from '@/access/roles'

import { NAV_RAIL_COOKIE } from './navRail'
import { NavRailToggle } from './NavRailToggle'

/**
 * `admin.components.afterNavLinks`: "View site" for everyone, the UI kit for admins and the
 * sidebar collapse toggle, styled with Payload's own nav-link classes (icons come from
 * nav-icons.css). The site URL is NEXT_PUBLIC_SITE_URL when set, otherwise the same origin.
 */
export async function NavExtraLinks({ payload, user }: ServerProps) {
  const siteURL = process.env.NEXT_PUBLIC_SITE_URL || '/'
  const initialRail = (await cookies()).get(NAV_RAIL_COOKIE)?.value === '1'
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
      {isAdmin(user) ? (
        <Link className="nav__link" href={`${payload.config.routes.admin}/ui-kit`} id="nav-ui-kit">
          <span className="nav__link-label">UI kit</span>
        </Link>
      ) : null}
      <NavRailToggle initialRail={initialRail} />
    </div>
  )
}

export default NavExtraLinks
