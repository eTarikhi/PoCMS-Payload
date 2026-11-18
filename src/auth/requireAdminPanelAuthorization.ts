import { getPayload, type SanitizedConfig } from 'payload'

import { hasAnyRole } from '@/access/permissions'

type RouteHandler = (request: Request) => Promise<Response>
type RequestAuthenticator = (request: Request) => Promise<unknown>

const authorizationError = (status: 401 | 403, message: string): Response =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

/** Prevent role-scoped GraphQL and Admin UI responses from being reused by HTTP caches. */
const withoutCaching = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

/**
 * Wrap a route with the same role-presence policy used by `Users.access.admin`.
 * Keeping the policy check separate makes the allow/deny behavior testable without a database.
 */
export function withAdminPanelAuthorization(
  authenticate: RequestAuthenticator,
  handler: RouteHandler,
): RouteHandler {
  return async (request) => {
    const user = await authenticate(request)

    if (!user) {
      return authorizationError(401, 'Authentication required.')
    }

    if (!hasAnyRole(user)) {
      return authorizationError(403, 'Admin access required.')
    }

    return withoutCaching(await handler(request))
  }
}

/** Authenticate the request through Payload before delegating to a Payload route handler. */
export function withPayloadAdminPanelAuthorization(
  config: Promise<SanitizedConfig> | SanitizedConfig,
  handler: RouteHandler,
): RouteHandler {
  return withAdminPanelAuthorization(async (request) => {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    return user
  }, handler)
}
