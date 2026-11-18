import { withGraphQLRequestBodyLimit } from '@/auth/graphqlRequestBodyLimit'
import { withPayloadAdminPanelAuthorization } from '@/auth/requireAdminPanelAuthorization'

import config from '@payload-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'

// Authorization runs before this limiter, so denied callers never enter GraphQL body parsing.
export const POST = withPayloadAdminPanelAuthorization(
  config,
  withGraphQLRequestBodyLimit(config, GRAPHQL_POST(config)),
)

// Keep Payload's CORS preflight behavior unchanged; it does not execute GraphQL operations.
export const OPTIONS = REST_OPTIONS(config)
