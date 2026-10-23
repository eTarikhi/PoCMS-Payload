import type { EmailAdapter, Payload, SendEmailOptions } from 'payload'

/**
 * The adapter that sends nothing: it logs the message and reports that it did not send it.
 *
 * Payload ships one of these internally (`payload/dist/email/consoleEmailAdapter.js`) and falls back
 * to it when `email` is not configured, but it is not exported from any public entry point, so this
 * is the same ten lines written against the documented `EmailAdapter` interface — which is also the
 * shape a test can stand in for a provider with.
 *
 * It exists so that "no provider configured" is a decision with a visible consequence rather than an
 * exception at startup: a laptop without `RESEND_API_KEY` still runs, still renders the templates,
 * still records every send in the email log, and the admin panel's Email page says in one red line
 * that nothing is being delivered.
 */

export const stringifyTo = (to: SendEmailOptions['to']): string => {
  if (!to) return ''
  if (typeof to === 'string') return to
  if (Array.isArray(to)) {
    return to
      .map((entry) => (typeof entry === 'string' ? entry : entry?.address ?? ''))
      .filter(Boolean)
      .join(', ')
  }
  return typeof to === 'object' && 'address' in to ? String(to.address ?? '') : ''
}

export type ConsoleAdapterOptions = {
  defaultFromAddress: string
  defaultFromName: string
  /** Where the message goes instead of the log. Tests capture it here. */
  sink?: (message: SendEmailOptions) => void
  logger?: Payload['logger']
}

export const consoleEmailAdapter =
  (options: ConsoleAdapterOptions): EmailAdapter<{ logged: true; to: string }> =>
  ({ payload }) => ({
    name: 'console',
    defaultFromAddress: options.defaultFromAddress,
    defaultFromName: options.defaultFromName,
    sendEmail: async (message) => {
      const to = stringifyTo(message.to)
      const line = `Email not sent (no provider configured): to ${to || '(nobody)'}, subject “${String(message.subject ?? '')}”`
      options.sink?.(message)
      ;(options.logger ?? payload.logger).warn({ msg: line, to, subject: String(message.subject ?? '') })
      return { logged: true, to }
    },
  })
