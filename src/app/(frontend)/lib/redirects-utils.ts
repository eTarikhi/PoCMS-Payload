import { articlePagePath } from './article-page'
import { projectPagePath } from './project-page'

/**
 * Framework-free URL normalization and redirect resolution helpers.
 * Safe to import from Payload hooks, Next.js server components, and unit tests.
 */

export type RedirectStatusCode = 301 | 302

export type RedirectReferenceDoc = {
  slug?: string | null
}

export type RedirectLike = {
  from?: string | null
  type?: string | null
  to?: {
    type?: 'reference' | 'custom' | null
    url?: string | null
    reference?: {
      relationTo?: string | null
      value?: number | string | RedirectReferenceDoc | null
    } | null
  } | null
}

export type ResolvedRedirect = {
  from: string
  destination: string
  statusCode: RedirectStatusCode
}

/**
 * Normalizes a redirect `from` path (or incoming request pathname/URL) into a canonical path:
 * - Strips query strings and hashes for path comparison
 * - If an absolute URL is supplied, extracts `pathname` when it matches `site` (or keeps normalized URL)
 * - Ensures leading `/` and removes trailing slashes (except root `'/'`)
 */
export const normalizeRedirectPath = (raw: string, site?: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (site) {
        const siteOrigin = new URL(site).origin
        if (parsed.origin.toLowerCase() === siteOrigin.toLowerCase()) {
          return cleanPathname(parsed.pathname)
        }
      }
      const cleanPath = cleanPathname(parsed.pathname)
      return `${parsed.origin.toLowerCase()}${cleanPath === '/' ? '' : cleanPath}`
    } catch {
      // Fall through to relative normalization.
    }
  }

  const withoutHashOrQuery = trimmed.split('#')[0]?.split('?')[0] ?? ''
  return cleanPathname(withoutHashOrQuery)
}

const cleanPathname = (pathname: string): string => {
  const trimmed = pathname.trim()
  if (!trimmed) return ''
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/')
  if (collapsed === '/') return '/'
  return collapsed.replace(/\/+$/, '')
}

/**
 * Resolves the destination URL or path of a Payload `redirects` document.
 * Returns `null` when the destination is incomplete or points to an unpopulated reference without a slug.
 */
export const resolveRedirectDestination = (doc: RedirectLike): string | null => {
  const to = doc.to
  if (!to) return null

  if (to.type === 'custom') {
    const customUrl = to.url?.trim() ?? ''
    if (!customUrl) return null
    if (/^https?:\/\//i.test(customUrl)) return customUrl
    return customUrl.startsWith('/') ? customUrl : `/${customUrl}`
  }

  if (to.type === 'reference' && to.reference) {
    const relationTo = to.reference.relationTo
    const value = to.reference.value
    const slug =
      value && typeof value === 'object' && typeof value.slug === 'string'
        ? value.slug.trim()
        : ''
    if (!slug) return null

    if (relationTo === 'articles') return articlePagePath(slug)
    if (relationTo === 'projects') return projectPagePath(slug)
    return `/${slug}`
  }

  return null
}

/** Parses `'301'` / `'302'` into numeric HTTP redirect status codes (defaulting to `301`). */
export const parseRedirectStatusCode = (type: string | null | undefined): RedirectStatusCode =>
  type === '302' ? 302 : 301

/**
 * Finds the first matching redirect for an incoming pathname or URL.
 * Guards against self-redirect loops (`from === destination`).
 */
export const matchRedirect = (
  requestPathOrUrl: string,
  redirects: readonly RedirectLike[],
  site?: string,
): ResolvedRedirect | null => {
  const candidatePath = normalizeRedirectPath(requestPathOrUrl, site)
  if (!candidatePath) return null

  for (const item of redirects) {
    if (!item.from) continue
    const normalizedFrom = normalizeRedirectPath(item.from, site)
    if (!normalizedFrom) continue

    const matchesExact =
      normalizedFrom === candidatePath ||
      normalizedFrom.toLowerCase() === candidatePath.toLowerCase()
    if (!matchesExact) continue

    const destination = resolveRedirectDestination(item)
    if (!destination) continue

    const normalizedDestination = normalizeRedirectPath(destination, site)
    if (normalizedDestination.toLowerCase() === candidatePath.toLowerCase()) {
      continue
    }

    return {
      from: normalizedFrom,
      destination,
      statusCode: parseRedirectStatusCode(item.type),
    }
  }

  return null
}
