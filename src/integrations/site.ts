/**
 * The public site that outside services test, such as Google's PageSpeed Insights: the origin in
 * NEXT_PUBLIC_SITE_URL, or else the production domain Vercel gives every deployment
 * (VERCEL_PROJECT_PRODUCTION_URL, a system environment variable). Google's servers can't reach
 * local or private addresses, so those are skipped.
 */
export type PublicSite =
  | { status: 'ok'; origin: string; host: string }
  /** NEXT_PUBLIC_SITE_URL is set, but to an address Google can't reach (localhost, a LAN IP). */
  | { status: 'local'; configured: string }
  | { status: 'missing' }

const PRIVATE_HOSTS = [
  /^localhost$/,
  /\.(localhost|local|internal|test)$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[(::1?|f[cd][0-9a-f]{2}:.*|fe80:.*)\]$/i,
]

export const isPublicHost = (hostname: string): boolean =>
  (hostname.includes('.') || hostname.startsWith('[')) &&
  !PRIVATE_HOSTS.some((pattern) => pattern.test(hostname))

function parse(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

export function publicSite(): PublicSite {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  for (const candidate of [configured, production ? `https://${production}` : undefined]) {
    const url = parse(candidate)
    if (url && isPublicHost(url.hostname))
      return { status: 'ok', origin: url.origin, host: url.host }
  }
  return configured ? { status: 'local', configured } : { status: 'missing' }
}
