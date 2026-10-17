import type { ServerProps } from 'payload'
import React from 'react'

import { isAdmin } from '@/access/roles'

import { DevToolsMenu } from './DevToolsMenu'

/**
 * Header action for admins: GraphQL Playground and a menu with cache actions (site cache, and the
 * bundler cache in development) and debugging links (the JSON behind the current page,
 * permissions, the signed-in user). The playground link shows only where Payload
 * serves it: GraphQL enabled, and in development or with `disablePlaygroundInProduction: false`.
 */
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
      canResetBundler={process.env.NODE_ENV !== 'production'}
    />
  )
}

export default DevTools
