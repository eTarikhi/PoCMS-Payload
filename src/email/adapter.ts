import type { EmailAdapter, Payload, SendEmailOptions } from 'payload'

import type { EmailLog } from '@/payload-types'

import { emailConfig } from './settings'
import { stringifyTo } from './consoleAdapter'
import { templateMarkerOf } from './layout'

/**
 * The wrapper that makes the email log complete.
 *
 * Payload sends through one adapter, and everything goes through it: this site's templates *and*
 * Payload's own auth emails — the password reset somebody asks for, the address verification a new
 * account needs. A log written only where this site calls `sendEmail` would be missing exactly the
 * messages that matter when a person cannot sign in, so the logging happens here, around the
 * provider, the way the Payload docs describe an adapter: a function of `{ payload }` returning
 * `{ name, defaultFromAddress, defaultFromName, sendEmail }`.
 *
 * What it adds around the provider:
 *
 *   - **A log row per attempt**, written whatever happened: `sent`, `redirected` (a development
 *     override took the place of the real recipient), `skipped` (`EMAIL_DISABLED`) or `failed`. A
 *     failure is recorded and then re-thrown, because swallowing it would turn "the provider is
 *     down" into "the password reset worked" — and Payload's own operations report send failures to
 *     the caller for a reason.
 *   - **The two development guards**, applied to every message rather than to the ones this site
 *     remembers to guard: `EMAIL_OVERRIDE_RECIPIENT` redirects and records the original address, and
 *     `EMAIL_DISABLED` sends nothing.
 *
 * What it deliberately does not store is the message body. A password reset email carries a live
 * token in its HTML, so a log that kept bodies would be a way to take over an account for anybody
 * who can read the log — which is a wider audience than "somebody who can read a user's password
 * reset token" is supposed to be. The subject, the recipient, the provider's id and the failure are
 * recorded; the body is not, and no flag turns that on.
 */

/** Headers this site uses to tell the wrapper what it is sending. Stripped before the provider sees them. */
export const TEMPLATE_HEADER = 'X-PoCMS-Template'
export const TRIGGER_HEADER = 'X-PoCMS-Trigger'
export const CONTEXT_HEADER = 'X-PoCMS-Context'

export type EmailStatus = 'sent' | 'redirected' | 'skipped' | 'failed'

/**
 * Which template produced a message.
 *
 * The log's `template` is a select, so a header this site does not recognise cannot be written into
 * it as an arbitrary string. Payload's own auth emails carry no header of ours and land on `payload`,
 * which is what that option is for.
 */
const EMAIL_LOG_TEMPLATES = [
  'forgot-password',
  'verify-email',
  'welcome',
  'test',
  'digest',
  'payload',
] as const satisfies readonly NonNullable<EmailLog['template']>[]

const templateOf = (name: string | undefined | null): EmailLog['template'] =>
  EMAIL_LOG_TEMPLATES.includes(name as (typeof EMAIL_LOG_TEMPLATES)[number])
    ? (name as EmailLog['template'])
    : 'payload'

/**
 * Which template a message came from.
 *
 * This site's own sends say so in a header. Payload's auth emails cannot — it builds the message
 * itself — so the templates leave a marker in the document (`data-pocms-template`), and a message
 * with neither is one of Payload's defaults, which is what the log's `payload` option means.
 */
const templateOfMessage = (message: SendEmailOptions, header: string | undefined): EmailLog['template'] =>
  templateOf(header || templateMarkerOf(message.html))

export type SendRecord = {
  to: string
  /** The address the message was really for, when a development override took its place. */
  redirectedFrom: string | null
  from: string | null
  subject: string
  template: EmailLog['template']
  status: EmailStatus
  error: string | null
  provider: string
  messageId: string | null
  bytes: number
  durationMs: number
  triggeredBy: string | null
  context: string | null
}

/** Headers arrive in a few shapes; this reads ours out of any of them and leaves the rest alone. */
const readHeaders = (
  headers: SendEmailOptions['headers'],
): { ours: Record<string, string>; rest: Record<string, unknown> } => {
  const ours: Record<string, string> = {}
  const rest: Record<string, unknown> = {}
  const entries = Array.isArray(headers)
    ? headers.map((entry) => Object.entries(entry ?? {})).flat()
    : Object.entries((headers ?? {}) as Record<string, unknown>)

  for (const [key, value] of entries) {
    const text = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : ''
    if (key === TEMPLATE_HEADER || key === TRIGGER_HEADER || key === CONTEXT_HEADER) {
      ours[key] = text
      continue
    }
    rest[key] = value
  }
  return { ours, rest }
}

/** The provider's own id for the message, wherever it puts it. */
const messageIdOf = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  for (const key of ['id', 'messageId', 'message_id']) {
    const value = record[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

const sizeOf = (message: SendEmailOptions): number =>
  Buffer.byteLength(String(message.html ?? '')) + Buffer.byteLength(String(message.text ?? ''))

export type LoggedAdapterOptions = {
  /** Where the log rows go. Overridden in tests, which have no collection to write to. */
  record?: (payload: Payload, entry: SendRecord) => Promise<void> | void
}

/** Write one row to the `email-logs` collection, and never let that failure change the send. */
export const defaultRecord = async (payload: Payload, entry: SendRecord): Promise<void> => {
  try {
    await payload.create({
      collection: 'email-logs',
      overrideAccess: true,
      data: {
        to: entry.to,
        ...(entry.redirectedFrom ? { redirectedFrom: entry.redirectedFrom } : {}),
        ...(entry.from ? { from: entry.from } : {}),
        subject: entry.subject,
        ...(entry.template ? { template: entry.template } : {}),
        status: entry.status,
        ...(entry.error ? { error: entry.error.slice(0, 1000) } : {}),
        provider: entry.provider,
        ...(entry.messageId ? { messageId: entry.messageId } : {}),
        bytes: entry.bytes,
        durationMs: entry.durationMs,
        ...(entry.triggeredBy ? { triggeredBy: entry.triggeredBy } : {}),
        ...(entry.context ? { context: entry.context.slice(0, 2000) } : {}),
      },
    })
  } catch (error) {
    // The email went (or did not) either way: a log that cannot be written is a log line, not a
    // failed send. The usual cause is a database without the collection yet.
    payload.logger.error({
      msg: 'An email send could not be recorded in the email log',
      err: error,
      status: entry.status,
      template: entry.template,
    })
  }
}

/**
 * Wrap a provider's adapter so every send is logged and the development guards apply.
 *
 * Composition is at the factory level — `(inner: EmailAdapter) => EmailAdapter` — because that is
 * where Payload hands over the `payload` instance, and the log rows need it. `buildEmailAdapter`
 * picks the provider, this wraps whatever it picked.
 */
export const loggedEmailAdapter =
  (inner: EmailAdapter<unknown>, options: LoggedAdapterOptions = {}): EmailAdapter<unknown> =>
  ({ payload }) => {
    const initialized = inner({ payload })
    const record = options.record ?? defaultRecord

    return {
      ...initialized,
      sendEmail: async (message: SendEmailOptions) => {
        const started = Date.now()
        const { ours, rest } = readHeaders(message.headers)
        const settings = emailConfig()

        const originalTo = stringifyTo(message.to)
        // A development override takes the place of every recipient, and the log keeps the address
        // the message was really for: an email that reached the wrong person is the one failure this
        // guard exists to prevent, and it should be visible when it happens anyway.
        const redirected =
          settings.overrideRecipient && !settings.disabled ? settings.overrideRecipient : null
        const outgoing: SendEmailOptions = {
          ...message,
          ...(redirected ? { to: redirected } : {}),
          // Ours are instructions to this wrapper, not part of what anybody should receive.
          headers: Object.keys(rest).length > 0 ? (rest as SendEmailOptions['headers']) : undefined,
        }

        const base: SendRecord = {
          to: redirected ?? originalTo,
          redirectedFrom: redirected ? originalTo : null,
          from:
            typeof message.from === 'string'
              ? message.from
              : (message.from?.address ?? initialized.defaultFromAddress),
          subject: String(message.subject ?? ''),
          template: templateOfMessage(message, ours[TEMPLATE_HEADER]),
          status: 'sent',
          error: null,
          provider: initialized.name,
          messageId: null,
          bytes: sizeOf(message),
          durationMs: 0,
          triggeredBy: ours[TRIGGER_HEADER] || null,
          context: ours[CONTEXT_HEADER] || null,
        }

        if (settings.disabled) {
          // Awaited before returning: the caller reports what happened, so the row has to exist.
          // `record` never throws (see defaultRecord), so this cannot turn a skip into a failure.
          await record(payload, {
            ...base,
            status: 'skipped',
            error: 'EMAIL_DISABLED is set, so nothing was sent.',
            durationMs: Date.now() - started,
          })
          return { skipped: true, to: base.to }
        }

        try {
          const result = await initialized.sendEmail(outgoing)
          await record(payload, {
            ...base,
            status: redirected ? 'redirected' : 'sent',
            messageId: messageIdOf(result),
            durationMs: Date.now() - started,
          })
          return result
        } catch (error) {
          await record(payload, {
            ...base,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - started,
          })
          // Re-thrown: Payload's own operations tell the caller a send failed, and a password reset
          // that silently did not arrive is worse than an error.
          throw error
        }
      },
    }
  }
