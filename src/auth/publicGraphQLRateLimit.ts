import { headersWithCors, type PayloadRequest, type SanitizedConfig } from 'payload'

import {
  GRAPHQL_RATE_LIMIT_BURST,
  GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS,
} from './graphqlRequestRateLimit'

export { GRAPHQL_RATE_LIMIT_BURST, GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS }

const RATE_LIMIT_MESSAGE = 'Persisted GraphQL request rate limit exceeded.'

type RouteHandler = (request: Request) => Promise<Response>

export type AnonymousGraphQLRateLimiterOptions = {
  burst?: number
  refillWindowMs?: number
  now?: () => number
}

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`)
  }
}

/**
 * Creates a single shared process-local token bucket for the anonymous `POST /api/fgql` route.
 *
 * Intentionally ignores client-supplied forwarding headers (`X-Forwarded-For`, `X-Real-IP`, etc.)
 * so spoofed addresses cannot multiply capacity or allocate unbounded per-IP map entries.
 *
 * Scope limitation: this bucket is process/worker-local, not a distributed or global cross-instance
 * rate limiter. Serverless cold starts and multiple Node workers maintain independent buckets.
 */
export function createAnonymousGraphQLRequestRateLimiter(
  options: AnonymousGraphQLRateLimiterOptions = {},
): (config: Promise<SanitizedConfig> | SanitizedConfig, handler: RouteHandler) => RouteHandler {
  const burst = options.burst ?? GRAPHQL_RATE_LIMIT_BURST
  const refillWindowMs = options.refillWindowMs ?? GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS
  const now = options.now ?? (() => performance.now())

  assertPositiveInteger('burst', burst)
  assertPositiveInteger('refillWindowMs', refillWindowMs)

  const tokensPerMs = burst / refillWindowMs
  let tokens = burst
  let updatedAt = Number.NEGATIVE_INFINITY

  return (configSource, handler) => async (request) => {
    const currentTime = now()
    if (!Number.isFinite(updatedAt)) {
      tokens = burst
      updatedAt = currentTime
    } else {
      const elapsed = Math.max(0, currentTime - updatedAt)
      tokens = Math.min(burst, tokens + elapsed * tokensPerMs)
      updatedAt = currentTime
    }

    if (tokens < 1) {
      const missingTokens = 1 - tokens
      const retryAfterSeconds = Math.max(1, Math.ceil(missingTokens / tokensPerMs / 1000))
      const config = await Promise.resolve(configSource)
      const headers = headersWithCors({
        headers: new Headers({
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfterSeconds),
          Vary: 'Origin',
        }),
        req: {
          headers: request.headers,
          payload: { config } as unknown as PayloadRequest['payload'],
        },
      })

      return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429, headers })
    }

    tokens -= 1
    return handler(request)
  }
}
