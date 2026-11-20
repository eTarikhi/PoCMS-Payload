import config from '@payload-config'
import { REST_OPTIONS } from '@payloadcms/next/routes'

import { withGraphQLRequestBodyLimit } from '@/auth/graphqlRequestBodyLimit'
import { createAnonymousGraphQLRequestRateLimiter } from '@/auth/publicGraphQLRateLimit'
import { handlePersistedGraphQLHttpRequest } from '@/fgql/executePersistedQuery'

export const runtime = 'nodejs'

const withAnonymousGraphQLRateLimit = createAnonymousGraphQLRequestRateLimiter()

export const POST = withAnonymousGraphQLRateLimit(
  config,
  withGraphQLRequestBodyLimit(config, (request) =>
    handlePersistedGraphQLHttpRequest(request, { config }),
  ),
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

const payloadOptions = REST_OPTIONS(config)
export const OPTIONS: typeof payloadOptions = async (...args) =>
  addNoStoreHeader(await payloadOptions(...args))

const methodNotAllowed = (): Response =>
  new Response(null, {
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    status: 405,
  })

export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
