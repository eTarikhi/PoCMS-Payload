import type { Payload, PayloadRequest, SendEmailOptions } from 'payload'

import { emailBrand, type EmailBrand } from './brand'
import { emailConfig } from './settings'
import { CONTEXT_HEADER, TEMPLATE_HEADER, TRIGGER_HEADER } from './adapter'
import { renderTemplate, type EmailData } from './templates'

/**
 * How this site sends an email.
 *
 * `payload.sendEmail(message)` is the whole of Payload's sending API — a transport, a From address
 * and a message — and it is deliberately thin: it does not know which template produced the message,
 * who asked for it, or whether it worked. This is the layer that does, and the reason it exists is
 * that the alternative is every call site repeating the same thirty lines and getting one of them
 * wrong:
 *
 *   - the brand (site name, public address, reply-to) is read once, from the site settings;
 *   - the template is rendered to a subject, an HTML body and a hand-written text body;
 *   - the template's slug and the caller travel as headers the logging adapter reads and strips, so
 *     the email log says *which* email this was rather than only that something was sent;
 *   - the outcome is returned, not thrown.
 *
 * That last one is a decision worth stating: a notification is almost always a side effect of
 * something else that mattered more — an account was created, an article was published, a job
 * finished. If the provider is down, the account should still exist and the caller should still
 * succeed, with the failure in the email log and in the returned result. Payload's own auth emails
 * are the exception and do not come through here: `forgotPassword` tells the caller when its email
 * failed, because "we sent you a link" would otherwise be a lie.
 */

export type SendResult = {
  /** True when a provider accepted the message. */
  ok: boolean
  /** What the logging adapter recorded: sent, redirected, skipped or failed. */
  status: 'sent' | 'redirected' | 'skipped' | 'failed' | 'not-attempted'
  to: string
  subject: string
  template: string
  /** The provider's own id, when it gave one. */
  messageId: string | null
  error: string | null
  /** The rendered email, so a caller can log or preview what was sent. */
  rendered: { subject: string; html: string; text: string }
}

export type SendTemplateOptions = {
  template: string
  /** One address, or several. Anything nodemailer accepts. */
  to: SendEmailOptions['to']
  data?: EmailData
  /** The request behind the send, when there is one: its user is recorded as who asked for it. */
  req?: PayloadRequest
  /** Anything worth keeping beside the log row — a document id, a job run. Never a body. */
  context?: Record<string, unknown>
  /** Override the From address for one message. */
  from?: SendEmailOptions['from']
  brand?: EmailBrand
}

/** The address a message went to, as one string, for the log. */
const toText = (to: SendEmailOptions['to']): string => {
  if (!to) return ''
  if (typeof to === 'string') return to
  if (Array.isArray(to)) {
    return to
      .map((entry) => (typeof entry === 'string' ? entry : (entry?.address ?? '')))
      .filter(Boolean)
      .join(', ')
  }
  return typeof to === 'object' && 'address' in to ? String(to.address ?? '') : ''
}

/**
 * Render a template and send it.
 *
 * Never throws: a failure comes back as `{ ok: false, status: 'failed', error }` and is in the email
 * log either way, because the logging sits around the provider (`src/email/adapter.ts`) rather than
 * in this function.
 */
export const sendTemplate = async (
  payload: Payload,
  options: SendTemplateOptions,
): Promise<SendResult> => {
  const settings = emailConfig()
  const brand =
    options.brand ??
    (await emailBrand(payload, {
      fromAddress: settings.fromAddress,
      fromName: settings.fromName,
      supportAddress: settings.supportAddress,
    }))

  let rendered: { subject: string; html: string; text: string }
  try {
    rendered = renderTemplate(options.template, brand, options.data ?? {})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    payload.logger.error({ msg: 'An email template failed to render', err: error, template: options.template })
    return {
      ok: false,
      status: 'not-attempted',
      to: toText(options.to),
      subject: '',
      template: options.template,
      messageId: null,
      error: message,
      rendered: { subject: '', html: '', text: '' },
    }
  }

  const triggeredBy = options.req?.user?.email ?? null
  const message: SendEmailOptions = {
    to: options.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(options.from ? { from: options.from } : {}),
    ...(brand.supportEmail ? { replyTo: brand.supportEmail } : {}),
    // Read and removed by the logging adapter; the provider never sees them.
    headers: {
      [TEMPLATE_HEADER]: options.template,
      ...(triggeredBy ? { [TRIGGER_HEADER]: triggeredBy } : {}),
      ...(options.context ? { [CONTEXT_HEADER]: JSON.stringify(options.context) } : {}),
    } as SendEmailOptions['headers'],
  }

  try {
    const result = (await payload.sendEmail(message)) as {
      id?: string
      messageId?: string
      skipped?: boolean
      to?: string
    } | void
    const skipped = settings.disabled || result?.skipped === true
    const redirected = Boolean(settings.overrideRecipient) && !skipped
    return {
      ok: !skipped,
      status: skipped ? 'skipped' : redirected ? 'redirected' : 'sent',
      to: toText(options.to),
      subject: rendered.subject,
      template: options.template,
      messageId:
        (typeof result?.id === 'string' && result.id) ||
        (typeof result?.messageId === 'string' && result.messageId) ||
        null,
      error: skipped ? 'Nothing was sent: EMAIL_DISABLED is set.' : null,
      rendered,
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    payload.logger.error({
      msg: 'Sending an email failed',
      err: error,
      template: options.template,
      to: toText(options.to),
    })
    return {
      ok: false,
      status: 'failed',
      to: toText(options.to),
      subject: rendered.subject,
      template: options.template,
      messageId: null,
      error: text,
      rendered,
    }
  }
}

/**
 * Render a template without sending it: what the admin panel's preview shows, and what a test asserts.
 */
export const previewTemplate = async (
  payload: Payload | undefined,
  template: string,
  data: EmailData,
): Promise<{ subject: string; html: string; text: string; brand: EmailBrand }> => {
  const settings = emailConfig()
  const brand = await emailBrand(payload, {
    fromAddress: settings.fromAddress,
    fromName: settings.fromName,
  })
  return { ...renderTemplate(template, brand, data), brand }
}
