import type { ServerProps } from 'payload'
import React from 'react'

import { isAdmin } from '@/access/roles'

import { DevToolsMenu } from './DevToolsMenu'

/**
 * Header action for admins: GraphQL Playground and the developer tools menu. Cache actions,
 * migration status and inspection links work in every environment; bundler reset, dev server
 * restart, migrations and code generators only on the development server. The playground link shows only where Payload
 * serves it: GraphQL enabled, and in development or with `disablePlaygroundInProduction: false`.
 */
/** Where this admin runs: Vercel's environment when deployed there, otherwise the Node mode. */
function environment(): { label: string; commit?: string } {
  const vercel = process.env.VERCEL_ENV
  const label = vercel
    ? `${vercel[0].toUpperCase()}${vercel.slice(1)}`
    : process.env.NODE_ENV === 'production'
      ? 'Production build'
      : 'Development'
  return { label, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) }
}

export function DevTools({ payload, user }: ServerProps) {
  if (!isAdmin(user)) return null
  const { graphQL, routes } = payload.config
  const playgroundAvailable =
    !graphQL.disable &&
    (process.env.NODE_ENV !== 'production' || graphQL.disablePlaygroundInProduction === false)
  return (
    <DevToolsMenu
      adminRoute={routes.admin}
      apiRoute={routes.api}
      playgroundURL={playgroundAvailable ? `${routes.api}${routes.graphQLPlayground}` : null}
      devServer={process.env.NODE_ENV !== 'production'}
      environment={environment()}
    />
  )
}

export default DevTools
