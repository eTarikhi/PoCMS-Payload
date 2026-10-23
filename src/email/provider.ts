import type { EmailAdapter } from 'payload'

import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { resendAdapter } from '@payloadcms/email-resend'

import { loggedEmailAdapter } from './adapter'
import { consoleEmailAdapter } from './consoleAdapter'
import { emailConfig } from './settings'

/**
 * The adapter Payload sends through: the provider's own, wrapped in the one that logs every send and
 * applies the two development guards.
 *
 * The wrapper is what makes the log complete — Payload's own auth emails (password reset, address
 * verification) go through `payload.sendEmail` too, and a log that only held this site's templates
 * would be missing the messages that matter most when somebody cannot sign in.
 */
export const buildEmailAdapter = (): EmailAdapter<unknown> | Promise<EmailAdapter<unknown>> => {
  const config = emailConfig()

  const inner = (): EmailAdapter<unknown> | Promise<EmailAdapter<unknown>> => {
    if (config.provider === 'resend') {
      return resendAdapter({
        defaultFromAddress: config.fromAddress,
        defaultFromName: config.fromName,
        apiKey: process.env.RESEND_API_KEY || '',
      })
    }
    if (config.provider === 'nodemailer') {
      // The nodemailer adapter builds its transport asynchronously (it can create a test account),
      // and Payload's `email` accepts a promise.
      return nodemailerAdapter({
        defaultFromAddress: config.fromAddress,
        defaultFromName: config.fromName,
        ...(config.smtp
          ? {
              transportOptions: {
                host: config.smtp.host,
                port: config.smtp.port,
                secure: config.smtp.secure,
                ...(config.smtp.user
                  ? { auth: { user: config.smtp.user, pass: process.env.SMTP_PASS || '' } }
                  : {}),
              },
            }
          : {}),
      }) as unknown as Promise<EmailAdapter<unknown>>
    }
    return consoleEmailAdapter({
      defaultFromAddress: config.fromAddress,
      defaultFromName: config.fromName,
    })
  }

  const built = inner()
  // Keep the promise a promise: awaiting it here would make the config build wait on a transport.
  return built instanceof Promise
    ? built.then((adapter) => loggedEmailAdapter(adapter))
    : loggedEmailAdapter(built)
}
