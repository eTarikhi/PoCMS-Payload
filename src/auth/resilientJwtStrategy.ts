import crypto from 'node:crypto'

import {
  JWT_AUTH_VERSION,
  type AuthStrategy,
  type AuthStrategyFunctionArgs,
  type AuthStrategyResult,
  type CollectionAfterLoginHook,
  type CollectionAfterLogoutHook,
  type Payload,
  type TypedUser,
} from 'payload'

type VerifiedJwtCandidate = {
  token: string
  id: number | string
  collection: string
  sid?: string
  iat: number
  exp?: number
}

const RECENT_LOGIN_GRACE_MS = 30_000
const MAX_RECENT_SESSIONS = 256
const TRANSIENT_FIND_DELAYS_MS = [100, 250] as const

// Scoped per `Payload` instance so isolated test instances never share state.
const recentLoginSessions = new WeakMap<object, Map<string, number>>()

function getRecentSessionMap(payload: Payload): Map<string, number> {
  let map = recentLoginSessions.get(payload)
  if (!map) {
    map = new Map()
    recentLoginSessions.set(payload, map)
  }
  return map
}

function makeSessionKey(collection: string, userId: number | string, sid: string): string {
  return `${collection}:${String(userId)}:${sid}`
}

export function recordRecentLoginSession(
  payload: Payload,
  collection: string,
  userId: number | string,
  sid: string,
  ttlMs: number = RECENT_LOGIN_GRACE_MS,
): void {
  const map = getRecentSessionMap(payload)
  const now = Date.now()
  if (map.size >= MAX_RECENT_SESSIONS) {
    for (const [k, exp] of map) {
      if (exp <= now) map.delete(k)
    }
    if (map.size >= MAX_RECENT_SESSIONS) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
  }
  map.set(makeSessionKey(collection, userId, sid), now + ttlMs)
}

export function clearRecentLoginSession(
  payload: Payload,
  collection: string,
  userId: number | string,
  sid?: string | null,
): void {
  const map = recentLoginSessions.get(payload)
  if (!map) return
  if (sid) {
    map.delete(makeSessionKey(collection, userId, sid))
    return
  }
  const prefix = `${collection}:${String(userId)}:`
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) map.delete(key)
  }
}

export function hasRecentLoginSessionGrace(
  payload: Payload,
  collection: string,
  userId: number | string,
  sid: string,
): boolean {
  const map = recentLoginSessions.get(payload)
  if (!map) return false
  const expiresAt = map.get(makeSessionKey(collection, userId, sid))
  if (!expiresAt) return false
  if (expiresAt <= Date.now()) {
    map.delete(makeSessionKey(collection, userId, sid))
    return false
  }
  return true
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Verifies a Payload HS256 JWT using `node:crypto` constant-time HMAC comparison, validating
 * `alg === 'HS256'`, `authVersion === JWT_AUTH_VERSION`, `exp`, `nbf`, and `id`/`collection`/`sid`.
 */
export function verifyPayloadHs256Jwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifiedJwtCandidate | null {
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  if (!headerB64 || !payloadB64 || !sigB64) return null

  const header = decodeBase64UrlJson(headerB64)
  if (!header || header.alg !== 'HS256' || header.authVersion !== JWT_AUTH_VERSION) {
    return null
  }

  let providedSig: Buffer
  try {
    providedSig = Buffer.from(sigB64, 'base64url')
  } catch {
    return null
  }
  const expectedSig = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`${headerB64}.${payloadB64}`)
    .digest()

  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return null
  }

  const claims = decodeBase64UrlJson(payloadB64)
  if (!claims) return null

  if (typeof claims.exp === 'number' && nowSeconds >= claims.exp) {
    return null
  }
  if (typeof claims.nbf === 'number' && nowSeconds < claims.nbf) {
    return null
  }

  const { id, collection, sid } = claims
  if (
    typeof collection !== 'string' ||
    (typeof id !== 'number' && typeof id !== 'string') ||
    (typeof sid !== 'undefined' && typeof sid !== 'string')
  ) {
    return null
  }

  const iat = typeof claims.iat === 'number' && Number.isFinite(claims.iat) ? claims.iat : 0
  const exp = typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp : undefined

  return {
    token,
    id,
    collection,
    ...(sid ? { sid } : {}),
    iat,
    ...(exp !== undefined ? { exp } : {}),
  }
}

function isCookieAllowedByCsrf(headers: Headers, payload: Payload): boolean {
  const origin = headers.get('Origin')
  const csrf = payload.config.csrf ?? []
  if (origin) {
    return csrf.length === 0 || csrf.includes(origin)
  }
  if (csrf.length === 0) {
    return true
  }
  const secFetchSite = headers.get('Sec-Fetch-Site')
  return (
    secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none'
  )
}

/**
 * Extracts all candidate JWT strings in `payload.config.auth.jwtOrder` order, preserving ALL
 * `${cookiePrefix}-token` values when a browser sends multiple cookies (e.g. a stale path-scoped or
 * `Domain=localhost` cookie alongside a newly issued `Path=/` login cookie).
 */
export function extractCandidateJwts(headers: Headers, payload: Payload): string[] {
  const order = payload.config.auth?.jwtOrder ?? ['Bearer', 'JWT', 'cookie']
  const out: string[] = []
  const tokenCookieName = `${payload.config.cookiePrefix || 'payload'}-token`

  for (const method of order) {
    if (method === 'Bearer') {
      const auth = headers.get('Authorization')
      if (auth?.startsWith('Bearer ')) {
        const val = auth.slice('Bearer '.length).trim()
        if (val) out.push(val)
      }
    } else if (method === 'JWT') {
      const auth = headers.get('Authorization')
      if (auth?.startsWith('JWT ')) {
        const val = auth.slice('JWT '.length).trim()
        if (val) out.push(val)
      }
    } else if (method === 'cookie') {
      if (!isCookieAllowedByCsrf(headers, payload)) continue
      const rawCookie = headers.get('Cookie')
      if (!rawCookie) continue
      const cookieMatches: string[] = []
      for (const entry of rawCookie.split(';')) {
        const eq = entry.indexOf('=')
        if (eq <= 0) continue
        const key = entry.slice(0, eq).trim()
        if (key !== tokenCookieName) continue
        const rawVal = entry.slice(eq + 1).trim()
        if (!rawVal) continue
        try {
          cookieMatches.push(decodeURIComponent(rawVal))
        } catch {
          cookieMatches.push(rawVal)
        }
      }
      // Payload's `parseCookies` normally keeps the last matching cookie; try reverse order first
      // and then sort verified candidates by newest `iat`.
      for (let i = cookieMatches.length - 1; i >= 0; i--) {
        out.push(cookieMatches[i])
      }
    }
  }

  return Array.from(new Set(out))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function findUserByIdWithRetry(args: {
  payload: Payload
  collectionSlug: string
  id: number | string
  depth: number
  fallbackLocale: AuthStrategyFunctionArgs['req'] extends { fallbackLocale?: infer F } ? F : unknown
  locale: AuthStrategyFunctionArgs['req'] extends { locale?: infer L } ? L : unknown
  req: AuthStrategyFunctionArgs['req']
}): Promise<Record<string, unknown> | null> {
  let lastError: unknown = null
  const maxAttempts = TRANSIENT_FIND_DELAYS_MS.length + 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const doc = await args.payload.findByID({
        id: args.id,
        collection: args.collectionSlug as 'users',
        depth: args.depth,
        disableErrors: true,
        fallbackLocale: args.fallbackLocale as never,
        locale: args.locale as never,
        overrideAccess: true,
        req: args.req,
      })
      return (doc as unknown as Record<string, unknown> | null) ?? null
    } catch (err) {
      lastError = err
      if (attempt < TRANSIENT_FIND_DELAYS_MS.length) {
        await sleep(TRANSIENT_FIND_DELAYS_MS[attempt])
      }
    }
  }

  args.payload.logger?.warn?.({
    err: lastError,
    msg: '[auth] Resilient JWT lookup failed after transient retries',
  })
  return null
}

export async function authenticateResilientJwt({
  headers,
  isGraphQL = false,
  payload,
  req,
}: AuthStrategyFunctionArgs): Promise<AuthStrategyResult> {
  const requestFallbackLocale = req?.fallbackLocale
  const requestLocale = req?.locale
  const requestDepth = req?.query?.depth

  try {
    const rawCandidates = extractCandidateJwts(headers, payload)
    if (rawCandidates.length === 0) {
      // Defer to Payload's built-in `local-jwt` strategy (e.g. when `admin.autoLogin` is enabled).
      return { user: null }
    }

    const verified = rawCandidates
      .map((tok) => verifyPayloadHs256Jwt(tok, payload.secret))
      .filter((c): c is VerifiedJwtCandidate => c !== null)
      // Prefer newest `iat` when multiple cookies are present.
      .sort((a, b) => b.iat - a.iat)

    if (verified.length === 0) {
      return { user: null }
    }

    for (const candidate of verified) {
      const collection = Object.prototype.hasOwnProperty.call(
        payload.collections,
        candidate.collection,
      )
        ? payload.collections[candidate.collection as 'users']
        : undefined

      if (!collection?.config.auth || collection.config.auth.disableLocalStrategy) {
        continue
      }

      const depth = isGraphQL ? 0 : (collection.config.auth.depth ?? 0)
      const user = await findUserByIdWithRetry({
        payload,
        collectionSlug: candidate.collection,
        id: candidate.id,
        depth,
        fallbackLocale: requestFallbackLocale,
        locale: requestLocale,
        req,
      })

      if (!user) continue
      if (collection.config.auth.verify && !user._verified) continue

      if (collection.config.auth.useSessions) {
        if (!candidate.sid) continue
        const sessions = Array.isArray(user.sessions)
          ? (user.sessions as Array<{ id?: string; expiresAt?: string | Date }>)
          : []
        const now = Date.now()
        const matchedSession = sessions.find((s) => {
          if (s?.id !== candidate.sid) return false
          if (!s.expiresAt) return true
          const expMs =
            s.expiresAt instanceof Date ? s.expiresAt.getTime() : new Date(s.expiresAt).getTime()
          return Number.isNaN(expMs) || expMs > now
        })

        if (
          !matchedSession &&
          !hasRecentLoginSessionGrace(payload, candidate.collection, candidate.id, candidate.sid)
        ) {
          continue
        }
        user._sid = candidate.sid
      }

      user.collection = collection.config.slug
      user._strategy = 'local-jwt'

      return {
        user: user as unknown as TypedUser,
      }
    }

    return { user: null }
  } finally {
    if (req) {
      req.fallbackLocale = requestFallbackLocale as never
      req.locale = requestLocale as never
      if (req.query) {
        req.query.depth = requestDepth
      }
    }
  }
}

export const resilientJwtStrategy: AuthStrategy = {
  name: 'resilient-jwt',
  authenticate: authenticateResilientJwt,
}

export const recordRecentSessionAfterLogin: CollectionAfterLoginHook = ({
  collection,
  req,
  token,
  user,
}) => {
  if (token && user?.id !== undefined) {
    const parsed = verifyPayloadHs256Jwt(token, req.payload.secret)
    if (parsed?.sid) {
      recordRecentLoginSession(req.payload, collection.slug, user.id, parsed.sid)
    }
  }
  return user
}

export const clearRecentSessionAfterLogout: CollectionAfterLogoutHook = ({ collection, req }) => {
  const authUser = req.user as { id?: number | string; _sid?: string } | null | undefined
  if (authUser?.id !== undefined) {
    clearRecentLoginSession(req.payload, collection.slug, authUser.id, authUser._sid)
  }
}
