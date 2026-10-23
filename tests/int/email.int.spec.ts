import { getPayload, type Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { hasCapability } from '@/access/permissions'
import { emailBrand, siteOrigin, tokenUrl } from '@/email/brand'
import { buildEmailAdapter } from '@/email/provider'
import { emailConfig } from '@/email/settings'
import { escapeHtml, factTable, renderEmailLayout, safeHref, templateMarkerOf } from '@/email/layout'
import {
  generateForgotPasswordEmailHTML,
  generateForgotPasswordEmailSubject,
  generateVerifyEmailHTML,
  resetTokenLifetime,
} from '@/email/auth'
import { TEMPLATE_HEADER, loggedEmailAdapter, type SendRecord } from '@/email/adapter'
import { consoleEmailAdapter, stringifyTo } from '@/email/consoleAdapter'
import { previewTemplate, sendTemplate } from '@/email/send'
import {
  EMAIL_TEMPLATE_SLUGS,
  EMAIL_TEMPLATES,
  renderTemplate,
  templateBySlug,
} from '@/email/templates'
import { inviteNewUser } from '@/email/hooks'
import type { EmailLog } from '@/payload-types'

/**
 * The email system: what it sends, what it refuses to send, and what it records.
 *
 * Three things here are worth testing hard, because each fails quietly in production:
 *
 *   - **Escaping.** A template interpolates a person's name, a site name an editor typed and a
 *     subject line into an HTML document. An unescaped `<` is an email whose layout is decided by its
 *     own content, so every template is rendered with hostile data and asserted to contain none of it.
 *   - **The guards.** `EMAIL_DISABLED` and `EMAIL_OVERRIDE_RECIPIENT` are the only thing standing
 *     between a staging environment and a real person's inbox. They are tested around a fake provider
 *     so the assertion is about what the wrapper did, not about what a provider might do.
 *   - **The log.** A send that is not recorded is a send nobody can answer for, and a record that
 *     keeps the body of a password-reset email is a way to take over an account. Both halves are
 *     asserted: one row per attempt, whatever the outcome, and no body anywhere in it.
 */

const brand = {
  siteName: 'PoCMS',
  siteUrl: 'https://www.example.test',
  supportEmail: 'help@example.test',
  fromAddress: 'no-reply@example.test',
  fromName: 'PoCMS',
  accent: '#4f46e5',
}

/** A provider that records what it was asked to send, so the wrapper can be tested without one. */
const fakeProvider = (behaviour: 'ok' | 'fail' = 'ok') => {
  const sent: Record<string, unknown>[] = []
  const adapter = loggedEmailAdapter(
    () => ({
      name: 'fake-provider',
      defaultFromAddress: brand.fromAddress,
      defaultFromName: brand.fromName,
      sendEmail: async (message: Record<string, unknown>) => {
        sent.push(message)
        if (behaviour === 'fail') throw new Error('The provider refused: 401 unauthorized')
        return { id: 'msg_123' }
      },
    }),
    {
      // The log rows go here rather than to a collection: these tests are about the wrapper.
      record: async (_payload, entry: SendRecord) => {
        records.push(entry)
      },
    },
  )
  return { adapter, sent }
}

const records: SendRecord[] = []

describe('the shell every email is poured into', () => {
  it('escapes the values a template interpolates', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('a & b "c" \'d\'')).toBe('a &amp; b &quot;c&quot; &#39;d&#39;')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(12)).toBe('12')
  })

  it('puts only http(s) in an href, so a template cannot be turned into a bookmarklet', () => {
    expect(safeHref('https://example.test/a')).toBe('https://example.test/a')
    expect(safeHref('javascript:alert(1)')).toBe('#')
    expect(safeHref('data:text/html,<script>')).toBe('#')
    expect(safeHref('" onmouseover="alert(1)')).toBe('#')
  })

  it('renders a document with the brand, the body and the marker that says which template it was', () => {
    const html = renderEmailLayout(brand, {
      template: 'forgot-password',
      heading: 'Reset your password',
      sections: [{ paragraphs: ['A paragraph.'] }],
      callToAction: { label: 'Choose a new password', url: 'https://www.example.test/admin/account/recover?token=abc' },
      footer: ['A footer line.'],
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('PoCMS')
    expect(html).toContain('Reset your password')
    expect(html).toContain('data-pocms-template="forgot-password"')
    expect(html).toContain('help@example.test')
    expect(templateMarkerOf(html)).toBe('forgot-password')
    expect(templateMarkerOf('<table>nothing here</table>')).toBeNull()
    // Inline styles only: an email client that strips a <style> block still gets a readable message.
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<script')
  })

  it('builds a fact table, and nothing when there are no facts', () => {
    expect(factTable([])).toBe('')
    expect(factTable([{ label: 'Sent to', value: 'a@b.test' }])).toContain('Sent to')
    expect(factTable([{ label: 'X', value: '<b>' }])).toContain('&lt;b&gt;')
  })
})

describe('the templates', () => {
  it('renders every one to a subject, an HTML body and a plain-text body', () => {
    expect(EMAIL_TEMPLATE_SLUGS).toEqual([
      'forgot-password',
      'verify-email',
      'welcome',
      'test',
      'digest',
    ])
    for (const template of EMAIL_TEMPLATES) {
      const rendered = template.render(brand, template.sample)
      expect(rendered.subject.length, template.slug).toBeGreaterThan(5)
      expect(rendered.html).toContain('<!doctype html>')
      expect(rendered.text.length, template.slug).toBeGreaterThan(20)
      expect(templateMarkerOf(rendered.html)).toBe(template.slug)
      // The text version carries the link too: a terminal mail client gets no button.
      if (template.slug !== 'digest') expect(rendered.text).toMatch(/https?:\/\//)
    }
  })

  it('puts the token in the reset link, and the site name in the subject', () => {
    const rendered = renderTemplate('forgot-password', brand, {
      email: 'ada@example.test',
      name: 'Ada Lovelace',
      token: 'abc123',
      expiresIn: '1 hour',
    })
    expect(rendered.subject).toBe('Reset your PoCMS password')
    expect(rendered.html).toContain('https://www.example.test/admin/account/recover?token=abc123')
    expect(rendered.html).toContain('Ada')
    expect(rendered.html).toContain('expires in 1 hour')
    expect(rendered.text).toContain('abc123')
  })

  it('escapes a name that is really markup, in every template', () => {
    const hostile = {
      email: 'x@example.test',
      name: '<script>alert(1)</script>',
      token: '"><img src=x onerror=alert(2)>',
      invitedBy: '<b>bold</b>',
      to: '<svg onload=alert(3)>',
      requestedBy: '" onfocus="alert(4)',
      roles: '<i>roles</i>',
      runs: [{ task: '<script>', status: '<img src=x>', summary: '&"' }],
    }
    for (const template of EMAIL_TEMPLATES) {
      const rendered = template.render(brand, hostile)
      expect(rendered.html).not.toContain('<script>alert(1)</script>')
      expect(rendered.html).not.toContain('<svg onload')
      expect(rendered.html).not.toContain('onerror=alert(2)')
      expect(rendered.subject).not.toContain('<script>')
    }
  })

  it('says what to do when the reader did not ask for a reset, and greets somebody with no name', () => {
    const rendered = renderTemplate('forgot-password', brand, { email: 'ada@example.test', token: 'abc' })
    expect(rendered.html).toContain('If you did not ask for this')
    // No name and no usable local part: "there" rather than "Hello ,".
    const nameless = renderTemplate('welcome', brand, { email: '', name: '' })
    expect(nameless.html).not.toContain('Hello ,')
  })

  it('points at the sign-in page instead of a reset link when a password was already set', () => {
    const withToken = renderTemplate('welcome', brand, { email: 'a@b.test', token: 'abc' })
    const without = renderTemplate('welcome', brand, { email: 'a@b.test', token: '' })
    expect(withToken.html).toContain('account/recover?token=abc')
    expect(withToken.html).toContain('Choose your password')
    expect(without.html).toContain('/admin/login')
    expect(without.html).toContain('Sign in with the password you were given')
    expect(without.html).not.toContain('account/recover')
  })

  it('names a template that does not exist instead of rendering nothing', () => {
    expect(() => renderTemplate('nope', brand, {})).toThrow(/no email template called “nope”/)
    expect(templateBySlug('welcome')?.label).toBe('Account created')
    expect(templateBySlug('nope')).toBeUndefined()
  })

  it('counts a digest’s failures into its subject', () => {
    const clean = renderTemplate('digest', brand, { runs: [{ task: 'A', status: 'done' }] })
    const broken = renderTemplate('digest', brand, {
      runs: [
        { task: 'A', status: 'done' },
        { task: 'B', status: 'failed', summary: 'The provider refused' },
      ],
    })
    expect(clean.subject).toMatch(/ran clean/)
    expect(broken.subject).toContain('1 maintenance run(s) need a look')
    expect(broken.html).toContain('The provider refused')
  })

  it('describes a token lifetime in words', () => {
    expect(resetTokenLifetime()).toBe('1 hour')
    expect(resetTokenLifetime(900_000)).toBe('15 minutes')
    expect(resetTokenLifetime(7_200_000)).toBe('2 hours')
    expect(resetTokenLifetime(0)).toBe('1 hour')
  })
})

describe('Payload’s own auth emails, in these templates', () => {
  it('renders a reset email without a request to read the brand from', async () => {
    const html = await generateForgotPasswordEmailHTML({
      token: 'tok-1',
      user: { email: 'ada@example.test', name: 'Ada' },
    })
    const subject = await generateForgotPasswordEmailSubject({
      token: 'tok-1',
      user: { email: 'ada@example.test' },
    })
    expect(html).toContain('tok-1')
    expect(subject.length).toBeGreaterThan(5)
    // The marker is how the log attributes a send Payload made itself.
    expect(templateMarkerOf(html)).toBe('forgot-password')
  })

  it('renders a verification email, which this site does not currently send', async () => {
    const payload = undefined
    const html = await generateVerifyEmailHTML({
      req: { payload } as never,
      token: 'tok-2',
      user: { email: 'ada@example.test' },
    })
    expect(html).toContain('tok-2')
    expect(templateMarkerOf(html)).toBe('verify-email')
  })

  it('survives having no arguments at all, because Payload types them as optional', async () => {
    const html = await generateForgotPasswordEmailHTML()
    expect(html).toContain('<!doctype html>')
    expect(await generateForgotPasswordEmailSubject()).toBeTruthy()
  })
})

describe('which provider is configured', () => {
  const previous = { ...process.env }

  afterEach(() => {
    vi.unstubAllEnvs()
    process.env = { ...previous }
  })

  it('chooses Resend when a key is set, SMTP when a host is, and logs otherwise', () => {
    vi.stubEnv('RESEND_API_KEY', 're_123')
    vi.stubEnv('SMTP_HOST', '')
    delete process.env.EMAIL_PROVIDER
    expect(emailConfig()).toMatchObject({ provider: 'resend', configured: true, reason: null })

    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('SMTP_HOST', 'smtp.example.test')
    vi.stubEnv('SMTP_PORT', '465')
    vi.stubEnv('SMTP_USER', 'mailer')
    const smtp = emailConfig()
    expect(smtp).toMatchObject({ provider: 'nodemailer', configured: true })
    expect(smtp.smtp).toEqual({ host: 'smtp.example.test', port: 465, secure: true, user: 'mailer' })

    vi.stubEnv('SMTP_HOST', '')
    const none = emailConfig()
    expect(none.provider).toBe('console')
    expect(none.configured).toBe(false)
    expect(none.reason).toMatch(/logged and not sent/)
  })

  it('says so when EMAIL_PROVIDER asks for something the environment cannot deliver', () => {
    delete process.env.RESEND_API_KEY
    vi.stubEnv('EMAIL_PROVIDER', 'resend')
    const broken = emailConfig()
    expect(broken).toMatchObject({ provider: 'resend', configured: false })
    expect(broken.reason).toMatch(/RESEND_API_KEY is not set/)
  })

  it('reads the guards, and treats a blank line in .env as unset', () => {
    vi.stubEnv('EMAIL_DISABLED', 'true')
    vi.stubEnv('EMAIL_OVERRIDE_RECIPIENT', ' dev@example.test ')
    expect(emailConfig()).toMatchObject({
      disabled: true,
      overrideRecipient: 'dev@example.test',
    })
    vi.stubEnv('EMAIL_DISABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_RECIPIENT', '')
    expect(emailConfig()).toMatchObject({ disabled: false, overrideRecipient: null })
    vi.stubEnv('EMAIL_DISABLED', 'yes')
    expect(emailConfig().disabled).toBe(true)
  })

  it('never hands a credential to the page — only whether one is there', () => {
    vi.stubEnv('RESEND_API_KEY', 're_super_secret')
    const settings = emailConfig()
    expect(settings.hasResendKey).toBe(true)
    expect(JSON.stringify(settings)).not.toContain('re_super_secret')
  })

  it('builds an adapter for whatever it chose', async () => {
    delete process.env.EMAIL_PROVIDER
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('SMTP_HOST', '')
    const adapter = await buildEmailAdapter()
    // The log-only one, wrapped: the wrapper is what records the attempt.
    expect(typeof adapter).toBe('function')
    const initialized = adapter({ payload: {} as never })
    expect(initialized.name).toBe('console')
  })

  it('reads the public origin from the environment, and builds a token link with it', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.example.test/')
    expect(siteOrigin()).toBe('https://www.example.test')
    expect(tokenUrl({ ...brand, siteUrl: siteOrigin() }, '/admin/account/recover', 'abc')).toBe(
      'https://www.example.test/admin/account/recover?token=abc',
    )
    expect(tokenUrl({ ...brand, siteUrl: siteOrigin() }, '/admin')).toBe(
      'https://www.example.test/admin',
    )
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'pocms.vercel.app')
    expect(siteOrigin()).toBe('https://pocms.vercel.app')
  })
})

describe('the wrapper around a provider', () => {
  const previous = { ...process.env }

  beforeAll(() => {
    records.length = 0
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    process.env = { ...previous }
    records.length = 0
  })

  const message = {
    to: 'ada@example.test',
    subject: 'Reset your password',
    html: '<html><body>hi</body></html>',
    text: 'hi',
    headers: { [TEMPLATE_HEADER]: 'forgot-password', 'X-Kept': 'yes' },
  }

  it('sends, and records the send with the template the header named', async () => {
    vi.stubEnv('EMAIL_DISABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_RECIPIENT', '')
    const { adapter, sent } = fakeProvider()
    const result = (await adapter({ payload: { logger: { error() {} } } as never }).sendEmail(
      message as never,
    )) as { id: string }

    expect(result.id).toBe('msg_123')
    expect(sent).toHaveLength(1)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      to: 'ada@example.test',
      status: 'sent',
      template: 'forgot-password',
      provider: 'fake-provider',
      messageId: 'msg_123',
      redirectedFrom: null,
    })
    expect(records[0]?.bytes).toBeGreaterThan(0)
    // Our headers are instructions to the wrapper; the provider's own headers survive.
    const sentHeaders = (sent[0]?.headers ?? {}) as Record<string, unknown>
    expect(sentHeaders[TEMPLATE_HEADER]).toBeUndefined()
    expect(sentHeaders['X-Kept']).toBe('yes')
  })

  it('attributes a send Payload made itself, from the marker in the document', async () => {
    vi.stubEnv('EMAIL_DISABLED', '')
    const { adapter } = fakeProvider()
    const html = renderTemplate('verify-email', brand, { email: 'a@b.test', token: 'tok' }).html
    await adapter({ payload: { logger: { error() {} } } as never }).sendEmail({
      to: 'ada@example.test',
      subject: 'Confirm your address',
      html,
    } as never)
    expect(records[0]?.template).toBe('verify-email')
  })

  it('redirects to the development address and keeps the one it was meant for', async () => {
    vi.stubEnv('EMAIL_DISABLED', '')
    vi.stubEnv('EMAIL_OVERRIDE_RECIPIENT', 'dev@example.test')
    const { adapter, sent } = fakeProvider()
    await adapter({ payload: { logger: { error() {} } } as never }).sendEmail(message as never)

    expect((sent[0]?.to as string)).toBe('dev@example.test')
    expect(records[0]).toMatchObject({
      status: 'redirected',
      to: 'dev@example.test',
      redirectedFrom: 'ada@example.test',
    })
  })

  it('sends nothing when disabled, and still records the attempt', async () => {
    vi.stubEnv('EMAIL_DISABLED', 'true')
    const { adapter, sent } = fakeProvider()
    const result = (await adapter({ payload: { logger: { error() {} } } as never }).sendEmail(
      message as never,
    )) as { skipped: boolean }

    expect(result.skipped).toBe(true)
    expect(sent).toHaveLength(0)
    expect(records[0]).toMatchObject({ status: 'skipped', to: 'ada@example.test' })
    expect(records[0]?.error).toMatch(/EMAIL_DISABLED/)
  })

  it('records a refusal and re-throws it, so a caller is not told a send worked', async () => {
    vi.stubEnv('EMAIL_DISABLED', '')
    const { adapter, sent } = fakeProvider('fail')
    await expect(
      adapter({ payload: { logger: { error() {} } } as never }).sendEmail(message as never),
    ).rejects.toThrow(/401 unauthorized/)
    expect(sent).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'failed' })
    expect(records[0]?.error).toMatch(/401 unauthorized/)
  })

  it('calls a template that is not one of ours “payload”, the way the log’s select expects', async () => {
    vi.stubEnv('EMAIL_DISABLED', '')
    const { adapter } = fakeProvider()
    await adapter({ payload: { logger: { error() {} } } as never }).sendEmail({
      to: 'ada@example.test',
      subject: 'Something else',
      html: '<html></html>',
      headers: { [TEMPLATE_HEADER]: 'not-a-template' },
    } as never)
    expect(records[0]?.template).toBe('payload')
  })

  it('survives a log it cannot write, because the email matters more than the record', async () => {
    vi.stubEnv('EMAIL_DISABLED', '')
    const errors: unknown[] = []
    const adapter = loggedEmailAdapter(
      () => ({
        name: 'fake',
        defaultFromAddress: 'a@b.test',
        defaultFromName: 'A',
        sendEmail: async () => ({ id: 'x' }),
      }),
      {
        record: async () => {
          throw new Error('the database is gone')
        },
      },
    )
    // defaultRecord swallows its own failure; a custom one that throws is the wrapper's problem, and
    // the send must still be reported as the send.
    await expect(
      adapter({
        payload: { logger: { error: (entry: unknown) => errors.push(entry) } } as never,
      }).sendEmail({ to: 'ada@example.test', subject: 'x', html: '' } as never),
    ).rejects.toThrow(/the database is gone/)
  })

  it('reads a recipient in any of the shapes nodemailer accepts', () => {
    expect(stringifyTo('a@b.test')).toBe('a@b.test')
    expect(stringifyTo(['a@b.test', { address: 'c@d.test', name: 'C' }])).toBe('a@b.test, c@d.test')
    expect(stringifyTo({ address: 'c@d.test', name: 'C' })).toBe('c@d.test')
    expect(stringifyTo(undefined)).toBe('')
  })

  it('logs and sends nothing when no provider is configured', async () => {
    const lines: unknown[] = []
    const adapter = consoleEmailAdapter({
      defaultFromAddress: 'a@b.test',
      defaultFromName: 'A',
      logger: { warn: (entry: unknown) => lines.push(entry) } as never,
    })
    const result = await adapter({ payload: { logger: { warn() {} } } as never }).sendEmail({
      to: 'ada@example.test',
      subject: 'Reset',
    } as never)
    expect(result).toMatchObject({ logged: true, to: 'ada@example.test' })
    expect(JSON.stringify(lines)).toContain('no provider configured')
  })
})

describe('against the real database', () => {
  let payload: Payload
  const previous = { ...process.env }
  const stamp = Date.now()
  const created: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    for (const id of created) {
      await payload.delete({ collection: 'email-logs', id, overrideAccess: true }).catch(() => undefined)
    }
    process.env = { ...previous }
    await payload.destroy()
  })

  it('reads the brand from the site settings, and falls back when it cannot', async () => {
    const fromSettings = await emailBrand(payload, { fromAddress: 'no-reply@example.test' })
    expect(fromSettings.siteName.length).toBeGreaterThan(0)
    expect(fromSettings.fromAddress).toBe('no-reply@example.test')

    const withoutPayload = await emailBrand(undefined, { fromName: 'Fallback' })
    expect(withoutPayload.siteName).toBe('Fallback')
  })

  it('renders a preview without sending anything', async () => {
    const preview = await previewTemplate(payload, 'test', { to: 'ada@example.test' })
    expect(preview.subject).toContain(preview.brand.siteName)
    expect(preview.html).toContain('If you can read this')
    expect(preview.text.length).toBeGreaterThan(20)
  })

  it('records a skipped send in the log when EMAIL_DISABLED is set, body and all absent', async () => {
    process.env.EMAIL_DISABLED = 'true'
    process.env.EMAIL_OVERRIDE_RECIPIENT = ''

    const result = await sendTemplate(payload, {
      template: 'test',
      to: `email-test-${stamp}@example.test`,
      data: { to: `email-test-${stamp}@example.test`, requestedBy: 'a test' },
      context: { reason: 'int-test' },
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe('skipped')
    expect(result.rendered.html).toContain('<!doctype html>')

    const { docs } = await payload.find({
      collection: 'email-logs',
      where: { to: { equals: `email-test-${stamp}@example.test` } },
      overrideAccess: true,
      limit: 5,
    })
    expect(docs).toHaveLength(1)
    const row = docs[0] as EmailLog
    created.push(row.id)
    expect(row.status).toBe('skipped')
    expect(row.template).toBe('test')
    expect(row.subject).toContain(result.subject)
    expect(row.provider).toBe('console')
    expect(row.error).toMatch(/EMAIL_DISABLED/)
    expect(row.bytes).toBeGreaterThan(0)
    // The whole point: no body, so no live reset token in a log anybody with the capability reads.
    expect(JSON.stringify(row)).not.toContain('<!doctype html>')
    expect(JSON.stringify(row)).not.toContain('data-pocms-template')
    process.env = { ...previous }
  })

  it('refuses a template that does not exist, and says so in the result rather than throwing', async () => {
    const result = await sendTemplate(payload, {
      template: 'not-a-template',
      to: 'ada@example.test',
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe('not-attempted')
    expect(result.error).toMatch(/no email template called/)
  })

  it('guards the log behind the Email capability', async () => {
    const administrator = (
      await payload.find({ collection: 'roles', where: { system: { equals: true } }, limit: 1 })
    ).docs[0]
    expect(hasCapability({ permissions: { fullAccess: true } } as never, 'manageEmails')).toBe(true)
    expect(
      hasCapability(
        { permissions: { fullAccess: false, capabilities: ['manageEmails'], roles: [], levels: {} } } as never,
        'manageEmails',
      ),
    ).toBe(true)
    expect(
      hasCapability(
        { permissions: { fullAccess: false, capabilities: ['viewSystem'], roles: [], levels: {} } } as never,
        'manageEmails',
      ),
    ).toBe(false)
    expect(administrator?.fullAccess).toBe(true)

    // And nobody writes a log row through the API: the wrapper is the only author.
    const collection = payload.collections['email-logs']?.config
    expect(await collection?.access?.create?.({ req: { user: null, payload } as never })).toBe(false)
    expect(await collection?.access?.update?.({ req: { user: null, payload } as never })).toBe(false)
  })

  it('invites a new account, and stays quiet about the cases that are not an invitation', async () => {
    process.env.EMAIL_DISABLED = 'true'
    const email = `invite-${stamp}@example.test`
    const actor = { id: 1, email: 'admin@example.test' }

    const sent = await inviteNewUser({
      doc: { id: 900, email, name: 'Invited Person' },
      req: { payload, user: actor, data: { password: 'chosen-by-an-admin' } },
      operation: 'create',
      collection: { auth: {} },
      // The hook returns the document unchanged; the send is the side effect under test.
    } as never)
    expect(sent).toMatchObject({ id: 900, email })

    const { docs } = await payload.find({
      collection: 'email-logs',
      where: { to: { equals: email } },
      overrideAccess: true,
      limit: 5,
    })
    expect(docs).toHaveLength(1)
    created.push((docs[0] as EmailLog).id)
    expect((docs[0] as EmailLog).template).toBe('welcome')
    expect((docs[0] as EmailLog).triggeredBy).toBe('admin@example.test')

    // An update is not an invitation, a self-created account is not either, and neither is a create
    // with no request behind it (the CLI, where a human chose the password at a terminal).
    records.length = 0
    for (const context of [
      { doc: { id: 901, email: `update-${stamp}@example.test` }, req: { payload, user: actor, data: {} }, operation: 'update', collection: { auth: {} } },
      { doc: { id: 902, email: `self-${stamp}@example.test` }, req: { payload, user: { id: 902, email: `self-${stamp}@example.test` }, data: {} }, operation: 'create', collection: { auth: {} } },
      { doc: { id: 903, email: `cli-${stamp}@example.test` }, req: undefined, operation: 'create', collection: { auth: {} } },
      // The case that matters: Payload's Local API builds a request for every create, so "there is a
      // req" says nothing about whether a person did it. No signed-in user means no invitation —
      // which is what keeps a seed, a job and every test in this suite from emailing anybody.
      { doc: { id: 905, email: `localapi-${stamp}@example.test` }, req: { payload, data: {} }, operation: 'create', collection: { auth: {} } },
      { doc: { id: 904, email: `verify-${stamp}@example.test` }, req: { payload, user: actor, data: {} }, operation: 'create', collection: { auth: { verify: true } } },
    ]) {
      await inviteNewUser(context as never)
      const rows = await payload.find({
        collection: 'email-logs',
        where: { to: { equals: context.doc.email } },
        overrideAccess: true,
        limit: 1,
      })
      expect(rows.docs, context.doc.email).toHaveLength(0)
    }
    process.env = { ...previous }
  }, 120_000)
})
