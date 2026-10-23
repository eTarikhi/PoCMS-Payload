import type { CollectionAfterChangeHook } from 'payload'

import { sendTemplate } from './send'

/**
 * The email a new account gets.
 *
 * Payload creates a user and says nothing: the person only finds out if somebody tells them out of
 * band, and if the administrator typed a password into the form, that password has now travelled
 * through a chat window. This hook closes both gaps, and it is the one place the two cases are told
 * apart:
 *
 *   - **No password was supplied** (a user created through the API, a seed, an integration). The hook
 *     asks Payload for a reset token with `disableEmail: true` — so Payload's own email does not go
 *     out beside this one — and sends the `welcome` template with a link to choose a password. The
 *     password never exists in anybody's head or inbox.
 *   - **A password was supplied** (the admin panel's create form asks for one). The hook sends the
 *     same template without a token, which tells the person to sign in with what they were given and
 *     change it. Overriding an administrator's choice with a reset link would be surprising, and
 *     silently not sending anything is how people end up with accounts nobody told them about.
 *
 * When it stays quiet, and why each case matters:
 *
 *   - anything but a create (an update is not an invitation, and a password change already has its
 *     own email);
 *   - a person creating their own account, who needs no invitation;
 *   - a create with no signed-in person behind it — the `admin:create` script, the first-user setup,
 *     a seed, a job or a test, where either a human chose the password at a terminal or there is
 *     nobody to invite. This is the case that matters most: Payload's Local API builds a request for
 *     every `payload.create`, so "there is a `req`" says nothing about whether a person did this, and
 *     treating it as an invitation emails every account a script ever made;
 *   - a collection with `auth.verify` turned on, because Payload sends the verification email and two
 *     emails about one account is one too many. This project does not verify; the check is here so
 *     turning verification on does not start double-sending.
 *
 * The send never throws (`sendTemplate` returns its outcome), so a provider that is down cannot stop
 * an administrator creating an account. The failure is in the email log, where the next person to
 * look will find it.
 */
export const inviteNewUser: CollectionAfterChangeHook = async ({ doc, req, operation, collection }) => {
  if (operation !== 'create') return doc

  const email = typeof doc?.email === 'string' ? doc.email.trim() : ''
  if (!email) return doc

  // An invitation needs somebody doing the inviting. Payload's Local API supplies a `req` for every
  // create, so the request's *user* is the signal: no user means a script, a seed, the CLI or a test.
  if (!req?.user) return doc
  // Somebody creating their own account is not being invited to it.
  if (String(req.user.id) === String(doc.id)) return doc
  // Payload's verification email covers this account already.
  const auth = collection?.auth
  if (auth && typeof auth === 'object' && 'verify' in auth && Boolean(auth.verify)) return doc

  const payload = req.payload
  const suppliedPassword = Boolean(
    (req.data as Record<string, unknown> | undefined)?.password ??
      (req.data as Record<string, unknown> | undefined)?.['password'],
  )

  let token: string | null = null
  if (!suppliedPassword) {
    try {
      // `disableEmail` is the point: Payload generates the token without sending its own message, so
      // the person gets one email rather than two about the same account.
      const generated = await payload.forgotPassword({
        collection: 'users',
        data: { email },
        disableEmail: true,
        overrideAccess: true,
        req,
      })
      token = typeof generated === 'string' && generated ? generated : null
    } catch (error) {
      // Without a token the email still goes out and tells the person to use “Forgot password”:
      // an account nobody can enter is worse than an email with one more step in it.
      payload.logger.error({ msg: 'A password token for a new account could not be created', err: error, email })
    }
  }

  const invitedBy =
    typeof req.user.email === 'string' && req.user.email
      ? req.user.email
      : ((req.user.name as string | undefined) ?? '')

  const result = await sendTemplate(payload, {
    template: 'welcome',
    to: email,
    req,
    data: {
      email,
      name: typeof doc?.name === 'string' ? doc.name : '',
      token: token ?? '',
      invitedBy,
      roles: Array.isArray(doc?.roles)
        ? (doc.roles as { name?: string }[])
            .map((role) => role?.name ?? '')
            .filter(Boolean)
            .join(', ')
        : '',
    },
    context: {
      collection: 'users',
      userId: doc?.id ?? null,
      reason: suppliedPassword ? 'account-created-with-password' : 'account-created',
    },
  })

  if (!result.ok) {
    payload.logger.warn({
      msg: 'A new account was created but its invitation email did not go out',
      email,
      status: result.status,
      error: result.error,
    })
  }

  return doc
}
