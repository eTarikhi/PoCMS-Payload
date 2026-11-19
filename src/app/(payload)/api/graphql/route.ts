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

const addNoStoreHeader = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

// Keep Payload's CORS preflight behavior unchanged while preventing intermediary caching.
const payloadOptions = REST_OPTIONS(config)
export const OPTIONS: typeof payloadOptions = async (...args) =>
  addNoStoreHeader(await payloadOptions(...args))

// Make unsupported standard App Router methods explicit so their 405 responses also disable
// caching instead of being synthesized by Next.js without route-level response headers.
const methodNotAllowed = (): Response =>
  new Response(null, {
    headers: { 'Cache-Control': 'no-store' },
    status: 405,
  })

export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
