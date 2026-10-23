import type { Payload } from 'payload'

/**
 * What an email from this site looks like, and where it comes from.
 *
 * The name, the address a reader writes back to and the public URL are content, not configuration:
 * they live in **Site settings** (`siteName`, `supportEmail`) beside everything else an editor
 * changes, and are read at send time so a rename does not need a deploy. `NEXT_PUBLIC_SITE_URL` and
 * Vercel's production domain fill the gaps, in that order, because a token link that points at
 * `localhost` is a token link nobody can use.
 *
 * Every field has a fallback and none of them can throw: an email that cannot be branded is still
 * worth sending, and a password reset that fails because a global was unreadable is a lockout.
 */

export type EmailBrand = {
  siteName: string
  siteUrl: string
  /** Where a reader writes back: the reply-to, and the address named in the footer. */
  supportEmail: string | null
  /** The From address the adapter is configured with, for the footer's "sent to you because" line. */
  fromAddress: string
  fromName: string
  /** Accent colour, from the site settings' theme when it has one. */
  accent: string
}

export const DEFAULT_ACCENT = '#4f46e5'

/** The public origin: the configured one, then Vercel's, then nothing. */
export const siteOrigin = (): string => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel}`.replace(/\/+$/, '')
  const deployment = process.env.VERCEL_BRANCH_URL?.trim()
  if (deployment) return `https://${deployment}`.replace(/\/+$/, '')
  return ''
}

/**
 * Read the brand. `payload` is optional so a template can be rendered in a test, or before the
 * config is built, without a database.
 */
export const emailBrand = async (
  payload?: Payload,
  options: {
    fromAddress?: string
    fromName?: string
    accent?: string
    /** Used when the site settings cannot be read, or before the config exists. */
    supportAddress?: string | null
  } = {},
): Promise<EmailBrand> => {
  const fallbackName = options.fromName || process.env.EMAIL_FROM_NAME || 'PoCMS'
  const fallbackUrl = siteOrigin()

  if (!payload) {
    return {
      siteName: fallbackName,
      siteUrl: fallbackUrl,
      supportEmail: options.supportAddress || process.env.EMAIL_SUPPORT_ADDRESS?.trim() || null,
      fromAddress: options.fromAddress || process.env.EMAIL_FROM_ADDRESS || '',
      fromName: fallbackName,
      accent: options.accent || DEFAULT_ACCENT,
    }
  }

  try {
    const settings = await payload.findGlobal({
      slug: 'site-settings',
      // The brand is read on every send, including a password reset from somebody who is not
      // signed in: access is not the question here.
      overrideAccess: true,
      depth: 0,
    })
    const name = typeof settings?.siteName === 'string' && settings.siteName.trim()
      ? settings.siteName.trim()
      : fallbackName
    const support =
      typeof settings?.supportEmail === 'string' && settings.supportEmail.trim()
        ? settings.supportEmail.trim()
        : (options.supportAddress || process.env.EMAIL_SUPPORT_ADDRESS?.trim() || null)
    return {
      siteName: name,
      siteUrl: fallbackUrl,
      supportEmail: support,
      fromAddress: options.fromAddress || process.env.EMAIL_FROM_ADDRESS || '',
      fromName: name,
      accent: options.accent || DEFAULT_ACCENT,
    }
  } catch {
    return {
      siteName: fallbackName,
      siteUrl: fallbackUrl,
      supportEmail: options.supportAddress || process.env.EMAIL_SUPPORT_ADDRESS?.trim() || null,
      fromAddress: options.fromAddress || process.env.EMAIL_FROM_ADDRESS || '',
      fromName: fallbackName,
      accent: options.accent || DEFAULT_ACCENT,
    }
  }
}

/**
 * The URL a token link points at.
 *
 * Payload's own auth emails build this from `req`'s origin, which behind a proxy can be the internal
 * one; the configured public origin is the address a reader's browser can actually reach.
 */
export const tokenUrl = (brand: EmailBrand, path: string, token?: string): string => {
  const base = brand.siteUrl.replace(/\/+$/, '')
  const clean = path.startsWith('/') ? path : `/${path}`
  return token ? `${base}${clean}${clean.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : `${base}${clean}`
}
