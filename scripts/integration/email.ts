import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { assertIntegrationEnvironment } from './safety'

assertIntegrationEnvironment()
// Exercise the real configured Resend adapter with an in-process provider boundary.
// No real API key or outbound delivery is allowed in this harness.
process.env.RESEND_API_KEY = 'integration-capture-only'
process.env.EMAIL_FROM_ADDRESS = 'mail@example.test'
process.env.EMAIL_FROM_NAME = 'Integration mail'
const captured: { to: string; html: string; from: string }[] = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  if (String(input) !== 'https://api.resend.com/emails')
    throw new Error('Unexpected outbound request in isolated email verification.')
  captured.push(JSON.parse(String(init?.body)))
  return new Response(JSON.stringify({ id: 'isolated-message' }), { status: 200 })
}
const { getPayload } = await import('payload')
const { default: config } = await import('../../src/payload.config')
const payload = await getPayload({ config })
let id: number | undefined
try {
  const email = `reset-${randomBytes(8).toString('hex')}@example.test`
  const oldPassword = randomBytes(24).toString('hex')
  const newPassword = randomBytes(24).toString('hex')
  const user = await payload.create({
    collection: 'users',
    data: { email, password: oldPassword, name: 'Disposable reset verification' },
    overrideAccess: true,
  })
  id = user.id
  const token = await payload.forgotPassword({ collection: 'users', data: { email } })
  assert(typeof token === 'string' && token.length > 0, 'Expected a private reset token.')
  assert(captured.length === 1, 'Expected one captured provider message.')
  assert(captured[0].to === email, 'Reset message recipient mismatch.')
  assert(captured[0].from.includes('mail@example.test'), 'Configured sender was not used.')
  assert(
    captured[0].html.includes(`/reset/${token}`),
    'Reset message lacks the expected reset link.',
  )
  await payload.resetPassword({
    collection: 'users',
    data: { token, password: newPassword },
    overrideAccess: false,
  })
  const login = await payload.login({ collection: 'users', data: { email, password: newPassword } })
  assert(login.user?.id === id, 'New password must authenticate the temporary user.')
  let oldRejected = false
  try {
    await payload.login({ collection: 'users', data: { email, password: oldPassword } })
  } catch {
    oldRejected = true
  }
  assert(oldRejected, 'The previous password must no longer authenticate.')
  let replayRejected = false
  try {
    await payload.resetPassword({
      collection: 'users',
      data: { token, password: oldPassword },
      overrideAccess: false,
    })
  } catch {
    replayRejected = true
  }
  assert(replayRejected, 'A reset token must be single-use.')
  await payload.forgotPassword({
    collection: 'users',
    data: { email: `missing-${randomBytes(8).toString('hex')}@example.test` },
  })
  assert(captured.length === 1, 'Unknown users must not generate email.')
  console.log(
    'Isolated password-reset verification passed: configured adapter, reset, login, old-password rejection, single-use token and unknown user. No email left this process.',
  )
} finally {
  try {
    if (id !== undefined) await payload.delete({ collection: 'users', id, overrideAccess: true })
  } finally {
    await payload.destroy()
    globalThis.fetch = originalFetch
  }
}

// Payload/Next auth imports retain framework handles after teardown; this is a one-shot CLI.
process.exit(0)
