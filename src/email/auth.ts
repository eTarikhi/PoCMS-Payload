import type { PayloadRequest } from 'payload'

import { emailBrand } from './brand'
import { emailConfig } from './settings'
import { forgotPasswordTemplate, verifyEmailTemplate } from './templates'

/**
 * Payload's own auth emails, in this site's templates.
 *
 * Payload generates the verification and password-reset messages itself and offers two hooks per
 * collection to replace them — `auth.verify.generateEmailHTML` / `generateEmailSubject` and
 * `auth.forgotPassword.generateEmailHTML` / `generateEmailSubject`. They are config options, not a
 * patch: `src/collections/Users.ts` passes the four functions below and Payload sends whatever they
 * return through the configured adapter, which means the logging wrapper records them like any other
 * send (the templates leave a marker in the document, since Payload builds the message and there is
 * no header to attach).
 *
 * What the defaults lack, and what these add:
 *
 *   - Payload's forgot-password email is a bare `<p>` with a link built from the *request's* origin,
 *     which behind a proxy or on a preview deployment can be an address the reader cannot reach.
 *     These use the configured public origin (`NEXT_PUBLIC_SITE_URL`, then Vercel's), the site's own
 *     name, and a button that survives Outlook.
 *   - Neither default has a plain-text body, so a reader in a terminal mail client gets the HTML
 *     source. Both of these send one, written by hand rather than stripped from the markup.
 *   - Neither says what to do if the reader did not ask for it. Both of these do.
 *
 * Both generators are tolerant of missing arguments, because Payload types them as optional: no
 * `req` means no payload instance to read the site settings from, so the brand falls back to the
 * environment, and no token means the email cannot carry a link — it says so instead of sending a
 * button that goes nowhere.
 */

type ForgotPasswordArgs = {
  req?: PayloadRequest
  token?: string
  user?: { id?: number | string; email?: string; name?: string | null }
}

type VerifyArgs = {
  req: PayloadRequest
  token: string
  user: { id?: number | string; email?: string; name?: string | null }
}

/** The brand for one send: the site settings when there is a payload instance, the environment when not. */
const brandFor = async (req?: PayloadRequest) => {
  const settings = emailConfig()
  return emailBrand(req?.payload, {
    fromAddress: settings.fromAddress,
    fromName: settings.fromName,
    supportAddress: settings.supportAddress,
  })
}

/** How long a reset token lives, in the words the email uses. Payload's default is an hour. */
export const resetTokenLifetime = (expirationMs?: number): string => {
  const ms = expirationMs && expirationMs > 0 ? expirationMs : 3_600_000
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

export const generateForgotPasswordEmailHTML = async (
  args?: ForgotPasswordArgs,
): Promise<string> => {
  const brand = await brandFor(args?.req)
  return forgotPasswordTemplate.render(brand, {
    email: args?.user?.email ?? '',
    name: args?.user?.name ?? '',
    token: args?.token ?? '',
    expiresIn: resetTokenLifetime(),
  }).html
}

export const generateForgotPasswordEmailSubject = async (
  args?: ForgotPasswordArgs,
): Promise<string> => {
  const brand = await brandFor(args?.req)
  return forgotPasswordTemplate.render(brand, {
    email: args?.user?.email ?? '',
    name: args?.user?.name ?? '',
    token: args?.token ?? '',
    expiresIn: resetTokenLifetime(),
  }).subject
}

export const generateVerifyEmailHTML = async (args: VerifyArgs): Promise<string> => {
  const brand = await brandFor(args.req)
  return verifyEmailTemplate.render(brand, {
    email: args.user?.email ?? '',
    name: args.user?.name ?? '',
    token: args.token ?? '',
  }).html
}

export const generateVerifyEmailSubject = async (args: VerifyArgs): Promise<string> => {
  const brand = await brandFor(args.req)
  return verifyEmailTemplate.render(brand, {
    email: args.user?.email ?? '',
    name: args.user?.name ?? '',
    token: args.token ?? '',
  }).subject
}
