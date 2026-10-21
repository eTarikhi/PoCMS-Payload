import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmailAdapter } from '@/utilities/email'
import type { Payload } from 'payload'
const payload = {} as Payload
const message = {
  to: 'recipient@example.test',
  subject: 'Private reset',
  html: '<a>private-token</a>',
}
afterEach(() => vi.restoreAllMocks())
describe('Transactional email configuration', () => {
  it('fails closed without a key and never contacts a provider or logs the message', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const log = vi.spyOn(console, 'log')
    const adapter = createEmailAdapter({})({ payload })
    await expect(adapter.sendEmail(message)).rejects.toThrow(
      'Transactional email is not configured',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })
  it('uses a configurable sender with the installed Resend adapter', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'test-message' }), { status: 200 }))
    const adapter = createEmailAdapter({
      RESEND_API_KEY: 'fixture-only',
      EMAIL_FROM_ADDRESS: 'mail@example.test',
      EMAIL_FROM_NAME: 'Test Studio',
    })({ payload })
    await adapter.sendEmail(message)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(options?.body))).toMatchObject({
      from: 'Test Studio <mail@example.test>',
      to: 'recipient@example.test',
      subject: 'Private reset',
    })
  })
  it.each([
    { EMAIL_FROM_ADDRESS: 'invalid' },
    { EMAIL_FROM_ADDRESS: 'a@example.test\r\nBcc: other@example.test' },
    { EMAIL_FROM_NAME: 'Sender\r\nInjected' },
  ])('rejects malformed or injected sender configuration', (env) => {
    expect(() => createEmailAdapter(env)).toThrow(
      'Invalid transactional email sender configuration',
    )
  })
  it('propagates provider failures rather than claiming delivery', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 403,
          name: 'validation_error',
          message: 'Sender not verified',
        }),
        { status: 403 },
      ),
    )
    const adapter = createEmailAdapter({ RESEND_API_KEY: 'fixture-only' })({ payload })
    await expect(adapter.sendEmail(message)).rejects.toThrow('Sender not verified')
  })
})
