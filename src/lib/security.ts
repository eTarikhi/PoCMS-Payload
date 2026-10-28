/**
 * Production security helpers (Milestone 4.3):
 * - Fail-fast startup check when `PAYLOAD_SECRET` is missing or weak in production.
 * - Hardened HTTP response headers for `next.config.ts` (deliberately omitting `X-Frame-Options: DENY`
 *   so Payload Admin Live Preview and cloud preview iframes continue to work).
 */

export const MIN_PRODUCTION_SECRET_LENGTH = 16

export function resolvePayloadSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env.PAYLOAD_SECRET?.trim() ?? ''
  if (env.NODE_ENV === 'production') {
    if (!secret || secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `FATAL: PAYLOAD_SECRET environment variable must be set to at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
      )
    }
  }
  return secret
}

export type SecurityHeaderEntry = {
  key: string
  value: string
}

export const SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
] as const
