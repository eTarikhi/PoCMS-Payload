import type { ServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import {
  resolveOptions,
  type ResolvedDatabaseToolsOptions,
} from '@/plugins/databaseTools/options'

/**
 * `admin.components.afterNavLinks`: the sidebar link to the database tools.
 *
 * The plugin registers this component and hands it the resolved options as `serverProps`, so the
 * link and the page cannot disagree about the path or the label. It is a server component (the nav
 * is rendered on the server, with the signed-in user) — the visibility rule therefore sees the
 * user, not a request: `navigation.visible`, which defaults to the same `permissions.fullAccess`
 * test `access` defaults to.
 *
 * A host that overrides `access` with its own model should pass the matching `navigation.visible`
 * (this repo: `hasCapability(user, 'manageDatabase')`), otherwise the link may show for someone the
 * page then answers 404 to. Hiding on an error is deliberate: a nav link is not worth a broken
 * admin page.
 */

type DatabaseNavLinkProps = ServerProps & { databaseTools?: ResolvedDatabaseToolsOptions }

export async function DatabaseNavLink({ payload, user, databaseTools }: DatabaseNavLinkProps) {
  const options = databaseTools ?? resolveOptions()
  if (!options.navigation) return null

  let visible = false
  try {
    visible = Boolean(await options.navigation.visible({ user }))
  } catch (error) {
    payload.logger.error({ msg: 'Database tools navigation check failed', err: error })
  }
  if (!visible) return null

  return (
    <div className="acn:flex acn:flex-col acn:self-stretch">
      <Link
        className="nav__link"
        href={`${payload.config.routes.admin}${options.pagePath}`}
        id="nav-database"
      >
        <span className="nav__link-label">{options.navLabel}</span>
      </Link>
    </div>
  )
}

export default DatabaseNavLink
