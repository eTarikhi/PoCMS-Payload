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
