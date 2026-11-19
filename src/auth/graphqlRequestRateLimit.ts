import { headersWithCors, type PayloadRequest, type SanitizedConfig } from 'payload'

/** Per-Node-process GraphQL allowance: 120-request burst, refilled over 60 seconds. */
export const GRAPHQL_RATE_LIMIT_BURST = 120
export const GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS = 60_000
/** Bound limiter memory even if many distinct authenticated accounts become active. */
export const GRAPHQL_RATE_LIMIT_MAX_IDENTITIES = 10_000

const IDENTITY_UNAVAILABLE_MESSAGE = 'GraphQL request identity is unavailable.'
const RATE_LIMIT_MESSAGE = 'GraphQL request rate limit exceeded.'
const RATE_LIMIT_UNAVAILABLE_MESSAGE = 'GraphQL request rate limiting is temporarily unavailable.'

type AuthenticatedRouteHandler = (
  request: Request,
  authenticatedUser?: unknown,
) => Promise<Response>
type RouteHandler = (request: Request) => Promise<Response>

type Bucket = {
  tokens: number
  updatedAt: number
  lastSeenAt: number
}

type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

type GraphQLRateLimiterOptions = {
  /** Maximum immediate requests for one authenticated user (the token-bucket burst). */
  burst?: number
  /** Time required to refill an empty bucket to its full burst. */
  refillWindowMs?: number
  /** Maximum number of active authenticated-user buckets retained by this instance. */
  maxTrackedIdentities?: number
  /** Monotonic clock injection for deterministic tests. */
  now?: () => number
}

const identityKeyOf = (user: unknown): string | null => {
  try {
    if (!user || typeof user !== 'object') return null

    const id = (user as { id?: unknown }).id
    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
      return `number:${id}`
    }
    if (typeof id === 'string' && id.length > 0 && id.length <= 128 && id.trim() === id) {
      return `string:${id}`
    }
  } catch {
    // A malformed authenticated principal must fail closed, not skip per-user accounting.
  }

  return null
}

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`)
  }
}

const corsJsonResponse = async (
  configPromise: Promise<SanitizedConfig>,
  request: Request,
  status: number,
  message: string,
  extraHeaders: HeadersInit = {},
): Promise<Response> => {
  const config = await configPromise
  const headers = headersWithCors({
    headers: new Headers({
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      ...Object.fromEntries(new Headers(extraHeaders)),
    }),
    req: {
      headers: request.headers,
      payload: { config } as unknown as PayloadRequest['payload'],
    },
  })

  return Response.json({ error: message }, { headers, status })
}

/**
 * Create one in-memory token bucket store for an App Router route module instance.
 *
 * This is deliberately process/instance-scoped, not distributed: serverless cold starts, Node
 * workers, and horizontally scaled deployments have independent buckets. Do not treat it as a
 * cross-instance quota. An authenticated Payload user ID is the sole key; client IP and forwarding
 * headers are intentionally ignored.
 */
export function createGraphQLRequestRateLimiter(
  options: GraphQLRateLimiterOptions = {},
): (
  config: Promise<SanitizedConfig> | SanitizedConfig,
  handler: RouteHandler,
) => AuthenticatedRouteHandler {
  const burst = options.burst ?? GRAPHQL_RATE_LIMIT_BURST
  const refillWindowMs = options.refillWindowMs ?? GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS
  const maxTrackedIdentities = options.maxTrackedIdentities ?? GRAPHQL_RATE_LIMIT_MAX_IDENTITIES
  const now = options.now ?? (() => performance.now())

  assertPositiveInteger('burst', burst)
  assertPositiveInteger('refillWindowMs', refillWindowMs)
  assertPositiveInteger('maxTrackedIdentities', maxTrackedIdentities)

  const tokensPerMs = burst / refillWindowMs
  const buckets = new Map<string, Bucket>()
  let requestsSinceSweep = 0
  let lastSweepAt = Number.NEGATIVE_INFINITY

  const sweepExpiredBuckets = (currentTime: number): void => {
    for (const [identity, bucket] of buckets) {
      if (currentTime - bucket.lastSeenAt >= refillWindowMs) buckets.delete(identity)
    }
    requestsSinceSweep = 0
    lastSweepAt = currentTime
  }

  const retryAfterWhenAtCapacity = (currentTime: number): number => {
    let earliestExpiry = Number.POSITIVE_INFINITY
    for (const bucket of buckets.values()) {
      earliestExpiry = Math.min(earliestExpiry, bucket.lastSeenAt + refillWindowMs)
    }
    const waitMs = Number.isFinite(earliestExpiry)
      ? Math.max(0, earliestExpiry - currentTime)
      : 1000
    return Math.max(1, Math.ceil(waitMs / 1000))
  }

  const takeToken = (identity: string, currentTime: number): RateLimitDecision => {
    const existingBucket = buckets.get(identity)
    requestsSinceSweep += 1
    const unknownIdentityAtCapacity = !existingBucket && buckets.size >= maxTrackedIdentities
    if (
      requestsSinceSweep >= 128 ||
      (unknownIdentityAtCapacity && currentTime - lastSweepAt >= 1000)
    ) {
      sweepExpiredBuckets(currentTime)
    }

    const bucket = buckets.get(identity)
    if (!bucket) {
      if (buckets.size >= maxTrackedIdentities) {
        return { allowed: false, retryAfterSeconds: retryAfterWhenAtCapacity(currentTime) }
      }

      buckets.set(identity, {
        tokens: burst - 1,
        updatedAt: currentTime,
        lastSeenAt: currentTime,
      })
      return { allowed: true }
    }

    const effectiveTime = Math.max(currentTime, bucket.updatedAt)
    const elapsedMs = effectiveTime - bucket.updatedAt
    bucket.tokens = Math.min(burst, bucket.tokens + elapsedMs * tokensPerMs)
    bucket.updatedAt = effectiveTime
    bucket.lastSeenAt = effectiveTime

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return { allowed: true }
    }

    const waitMs = (1 - bucket.tokens) / tokensPerMs
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) }
  }

  return (config, handler) => {
    const configPromise = Promise.resolve(config)

    return async (request, authenticatedUser) => {
      const identity = identityKeyOf(authenticatedUser)
      if (identity === null) {
        return corsJsonResponse(configPromise, request, 503, IDENTITY_UNAVAILABLE_MESSAGE)
      }

      const currentTime = now()
      if (!Number.isFinite(currentTime)) {
        return corsJsonResponse(configPromise, request, 503, RATE_LIMIT_UNAVAILABLE_MESSAGE)
      }

      const decision = takeToken(identity, currentTime)
      if (!decision.allowed) {
        return corsJsonResponse(configPromise, request, 429, RATE_LIMIT_MESSAGE, {
          'Retry-After': String(decision.retryAfterSeconds),
        })
      }

      return handler(request)
    }
  }
}
