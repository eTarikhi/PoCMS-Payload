/**
 * Which provider sends this site's email, and whether it can.
 *
 * This module only *reads* the environment: it imports no provider package, so anything that needs
 * to describe the configuration — the admin page, the endpoints, the logging wrapper — can import it
 * without dragging `nodemailer` (and `node:fs`) into a graph Next.js bundles for the browser.
 * Building the adapter is `src/email/provider.ts`, which only `payload.config.ts` imports.
 *
 * Payload's own answer to "no email configured" is a warning at startup and a `console` adapter that
 * logs every message and delivers none — which is right for a fresh install and wrong for a
 * production site whose `RESEND_API_KEY` failed to be set: the password reset looks like it worked,
 * and the person waits for an email that was printed to a log nobody reads. So this module works out
 * what is actually configured, and says so on the admin panel's Email page, where a missing key is a
 * red line rather than a log entry.
 *
 * The provider is chosen once, when the config is built:
 *
 *   1. `EMAIL_PROVIDER` when it names one (`resend`, `nodemailer`, `console`);
 *   2. otherwise Resend when `RESEND_API_KEY` is set — it is a REST call, which is what a serverless
 *      function wants, and the Payload docs recommend it for Vercel;
 *   3. otherwise SMTP through nodemailer when `SMTP_HOST` is set;
 *   4. otherwise the log-only adapter, with `configured: false` so the page says why.
 *
 * Two development guards sit on top of every provider, because the alternative is a staging
 * environment emailing real people:
 *
 *   - `EMAIL_OVERRIDE_RECIPIENT` redirects every message to one address and records the original in
 *     the log — the payload adapters have their own version of this, and doing it here means the
 *     redirect is logged rather than invisible;
 *   - `EMAIL_DISABLED` sends nothing at all and records the attempt as `skipped`, which is what a
 *     test run and a laptop without a key want.
 */

export type EmailProvider = 'resend' | 'nodemailer' | 'console'

export type EmailConfig = {
  provider: EmailProvider
  /** The provider's own name for itself (`resend-rest`, `nodemailer`, `console`). */
  fromAddress: string
  fromName: string
  /** True when a real provider is configured with the credential it needs. */
  configured: boolean
  /** Why it is not, when it is not. One sentence, for the admin panel. */
  reason: string | null
  disabled: boolean
  overrideRecipient: string | null
  /** The address a reader writes back to, from the site settings or `EMAIL_SUPPORT_ADDRESS`. */
  supportAddress: string | null
  smtp: { host: string; port: number; secure: boolean; user: string | null } | null
  /**
   * Whether each credential is present — never the credential. An admin panel that shows a key is an
   * admin panel that leaks one to everybody who can open it, so the page says "set" or "missing".
   */
  hasResendKey: boolean
  hasSmtpPassword: boolean
  environment: string
}

const truthy = (value: string | undefined): boolean =>
  ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())

export const DEFAULT_FROM_ADDRESS = 'dev@vtarikhi.com'
export const DEFAULT_FROM_NAME = 'PoCMS'

/** What the environment asks for. Read on every call, so a test can change it. */
export const emailConfig = (): EmailConfig => {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || DEFAULT_FROM_ADDRESS
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME
  const disabled = truthy(process.env.EMAIL_DISABLED)
  const overrideRecipient = process.env.EMAIL_OVERRIDE_RECIPIENT?.trim() || null
  const supportAddress = process.env.EMAIL_SUPPORT_ADDRESS?.trim() || null
  const requested = process.env.EMAIL_PROVIDER?.trim().toLowerCase()

  const resendKey = process.env.RESEND_API_KEY?.trim() || ''
  const smtpHost = process.env.SMTP_HOST?.trim() || ''
  const smtpPort = Number(process.env.SMTP_PORT ?? '') || 587
  const smtpUser = process.env.SMTP_USER?.trim() || null
  const smtp = smtpHost
    ? {
        host: smtpHost,
        port: smtpPort,
        // 465 is implicit TLS; 587 and 2525 start plain and upgrade with STARTTLS.
        secure: smtpPort === 465 || truthy(process.env.SMTP_SECURE),
        user: smtpUser,
      }
    : null

  const provider: EmailProvider =
    requested === 'resend' || requested === 'nodemailer' || requested === 'console'
      ? requested
      : resendKey
        ? 'resend'
        : smtp
          ? 'nodemailer'
          : 'console'

  const reason =
    provider === 'resend' && !resendKey
      ? 'EMAIL_PROVIDER says Resend but RESEND_API_KEY is not set, so nothing can be sent.'
      : provider === 'nodemailer' && !smtp
        ? 'EMAIL_PROVIDER says SMTP but SMTP_HOST is not set, so nothing can be sent.'
        : provider === 'console'
          ? 'No provider is configured (no RESEND_API_KEY, no SMTP_HOST), so email is logged and not sent. Set RESEND_API_KEY, or SMTP_HOST with SMTP_USER and SMTP_PASS.'
          : null

  return {
    provider,
    fromAddress,
    fromName,
    configured: reason === null,
    reason,
    disabled,
    overrideRecipient,
    supportAddress,
    smtp,
    hasResendKey: Boolean(resendKey),
    hasSmtpPassword: Boolean(process.env.SMTP_PASS?.trim()),
    environment: process.env.NODE_ENV,
  }
}
