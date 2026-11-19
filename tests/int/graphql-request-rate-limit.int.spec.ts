// @vitest-environment node
import { buildSchema, graphql } from 'graphql'
import type { SanitizedConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { createGraphQLRequestRateLimiter } from '@/auth/graphqlRequestRateLimit'

const testOrigin = 'https://cms.example.test'
const configWithCors = { cors: [testOrigin] } as unknown as SanitizedConfig

const makeRequest = (headers: HeadersInit = {}): Request =>
  new Request('https://cms.example.test/api/graphql', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      ...Object.fromEntries(new Headers(headers)),
    }),
    body: JSON.stringify({ query: '{ ping }' }),
  })

describe('authenticated GraphQL request rate limit', () => {
  it('enforces the configured token-bucket threshold and returns a useful Retry-After', async () => {
    let currentTime = 0
    const handler = vi.fn(async () => new Response('ok'))
    const limited = createGraphQLRequestRateLimiter({
      burst: 2,
      refillWindowMs: 1000,
      now: () => currentTime,
    })(configWithCors, handler)

    expect((await limited(makeRequest(), { id: 17 })).status).toBe(200)
    expect((await limited(makeRequest(), { id: 17 })).status).toBe(200)
    const rejectedRequest = makeRequest({ Origin: testOrigin })
    const rejected = await limited(rejectedRequest, { id: 17 })

    expect(rejected.status).toBe(429)
    expect(rejected.headers.get('cache-control')).toBe('no-store')
    expect(rejected.headers.get('retry-after')).toBe('1')
    expect(rejected.headers.get('access-control-allow-origin')).toBe(testOrigin)
    expect(rejected.headers.get('access-control-allow-credentials')).toBe('true')
    expect(rejected.headers.get('vary')).toContain('Origin')
    expect(rejectedRequest.bodyUsed).toBe(false)
    expect(await rejected.json()).toEqual({ error: 'GraphQL request rate limit exceeded.' })

    currentTime = 500
    expect((await limited(makeRequest(), { id: 17 })).status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('isolates authenticated user identities and ignores client-supplied forwarding headers', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const limited = createGraphQLRequestRateLimiter({ burst: 1, now: () => 0 })(
      configWithCors,
      handler,
    )

    expect(
      (await limited(makeRequest({ 'X-Forwarded-For': '203.0.113.10' }), { id: 17 })).status,
    ).toBe(200)
    expect(
      (
        await limited(
          makeRequest({
            'X-Forwarded-For': '198.51.100.99, 203.0.113.10',
            'X-Real-IP': '192.0.2.44',
          }),
          { id: 17 },
        )
      ).status,
    ).toBe(429)
    expect(
      (await limited(makeRequest({ 'X-Forwarded-For': '203.0.113.10' }), { id: 18 })).status,
    ).toBe(200)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing principal', undefined],
    ['missing ID', {}],
    ['empty ID', { id: '' }],
    ['whitespace ID', { id: '  ' }],
    ['oversized ID', { id: 'x'.repeat(129) }],
    ['zero numeric ID', { id: 0 }],
    ['fractional numeric ID', { id: 1.5 }],
    ['unsafe numeric ID', { id: Number.MAX_SAFE_INTEGER + 1 }],
    ['object ID', { id: { value: 17 } }],
  ])('fails closed for a %s instead of bypassing accounting', async (_description, user) => {
    const handler = vi.fn(async () => new Response('executed'))
    const limited = createGraphQLRequestRateLimiter({ burst: 1 })(configWithCors, handler)

    const response = await limited(makeRequest({ Origin: testOrigin }), user)

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(testOrigin)
    expect(await response.json()).toEqual({ error: 'GraphQL request identity is unavailable.' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses independent buckets for independent route-module instances', async () => {
    const options = { burst: 1, now: () => 0 }
    const firstHandler = vi.fn(async () => new Response('first'))
    const secondHandler = vi.fn(async () => new Response('second'))
    const firstInstance = createGraphQLRequestRateLimiter(options)(configWithCors, firstHandler)
    const secondInstance = createGraphQLRequestRateLimiter(options)(configWithCors, secondHandler)

    expect((await firstInstance(makeRequest(), { id: 'user-17' })).status).toBe(200)
    expect((await firstInstance(makeRequest(), { id: 'user-17' })).status).toBe(429)
    expect((await secondInstance(makeRequest(), { id: 'user-17' })).status).toBe(200)
    expect(firstHandler).toHaveBeenCalledTimes(1)
    expect(secondHandler).toHaveBeenCalledTimes(1)
  })

  it('rejects GraphQL resolver execution after the authenticated caller exhausts its bucket', async () => {
    const schema = buildSchema('type Query { ping: String! }')
    const resolver = vi.fn(() => 'pong')
    const handler = vi.fn(async (request: Request) => {
      const body = (await request.json()) as { query: string }
      const result = await graphql({ schema, source: body.query, rootValue: { ping: resolver } })
      return Response.json(result)
    })
    const limited = createGraphQLRequestRateLimiter({ burst: 1, now: () => 0 })(
      configWithCors,
      handler,
    )

    const allowed = await limited(makeRequest(), { id: 17 })
    const secondRequest = makeRequest()
    const rejected = await limited(secondRequest, { id: 17 })

    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toEqual({ data: { ping: 'pong' } })
    expect(rejected.status).toBe(429)
    expect(secondRequest.bodyUsed).toBe(false)
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('bounds active identity storage and releases an expired slot after its refill window', async () => {
    let currentTime = 0
    const handler = vi.fn(async () => new Response('ok'))
    const limited = createGraphQLRequestRateLimiter({
      burst: 1,
      refillWindowMs: 1000,
      maxTrackedIdentities: 1,
      now: () => currentTime,
    })(configWithCors, handler)

    expect((await limited(makeRequest(), { id: 17 })).status).toBe(200)
    expect((await limited(makeRequest(), { id: 18 })).status).toBe(429)
    currentTime = 1000
    expect((await limited(makeRequest(), { id: 18 })).status).toBe(200)
  })
})
