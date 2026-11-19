import { withGraphQLQueryNestingLimit } from '@/auth/graphqlQueryNestingLimit'
import { withGraphQLRequestBodyLimit } from '@/auth/graphqlRequestBodyLimit'
import { createGraphQLRequestRateLimiter } from '@/auth/graphqlRequestRateLimit'
import { withPayloadAdminPanelAuthorization } from '@/auth/requireAdminPanelAuthorization'

import config from '@payload-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'

export const runtime = 'nodejs'

// One token-bucket store per loaded Node route module; authorization passes the user identity only
// after the existing Admin-role gate succeeds. Rate checks therefore precede all body reads.
const withGraphQLRequestRateLimit = createGraphQLRequestRateLimiter()

export const POST = withPayloadAdminPanelAuthorization(
  config,
  withGraphQLRequestRateLimit(
    config,
    withGraphQLRequestBodyLimit(config, withGraphQLQueryNestingLimit(config, GRAPHQL_POST(config))),
  ),
  { passAuthenticatedUser: true },
)

// Keep Payload's CORS preflight behavior unchanged; it does not execute GraphQL operations.
export const OPTIONS = REST_OPTIONS(config)
