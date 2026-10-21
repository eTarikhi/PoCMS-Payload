import { resendAdapter } from '@payloadcms/email-resend'
import type { EmailAdapter } from 'payload'

/** Never attempt a provider request with an empty key, or log password-reset message bodies. */
export function createEmailAdapter(
  env: Record<string, string | undefined> = process.env,
): EmailAdapter {
  const apiKey = env.RESEND_API_KEY?.trim()
  const defaultFromAddress = env.EMAIL_FROM_ADDRESS?.trim() || 'dev@vtarikhi.com'
  const defaultFromName = env.EMAIL_FROM_NAME?.trim() || 'PoCMS'
  if (
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(defaultFromAddress) ||
    /[\r\n]/.test(defaultFromName)
  ) {
    throw new Error('Invalid transactional email sender configuration.')
  }
  if (!apiKey) {
    return () => ({
      name: 'unconfigured',
      defaultFromAddress,
      defaultFromName,
      sendEmail: async () => {
        throw new Error('Transactional email is not configured. Set RESEND_API_KEY.')
      },
    })
  }
  return resendAdapter({ apiKey, defaultFromAddress, defaultFromName })
}

/** Reset links use a trusted configured origin, never an attacker-supplied request Host. */
export function passwordResetEmail(
  token: string | undefined,
  adminRoute: string,
  resetRoute: string,
  site = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  let origin: URL
  try {
    origin = new URL(site || '')
  } catch {
    throw new Error('Password reset requires NEXT_PUBLIC_SITE_URL to be a valid public origin.')
  }
  if (
    !token ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    !(
      origin.protocol === 'https:' ||
      (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))
    )
  ) {
    throw new Error(
      'Password reset requires a trusted HTTPS origin (HTTP loopback is allowed locally) and a token.',
    )
  }
  const path = `${adminRoute.replace(/\/$/, '')}/${resetRoute.replace(/^\/+|\/+$/g, '')}/${encodeURIComponent(token)}`
  const href = new URL(path, origin).href
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>A password reset was requested for your account.</p><p><a href="${href}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`
}
