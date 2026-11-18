// @vitest-environment node
import { buildSchema, graphql } from 'graphql'
import type { SanitizedConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  MAX_GRAPHQL_REQUEST_BODY_BYTES,
  withGraphQLRequestBodyLimit,
} from '@/auth/graphqlRequestBodyLimit'

const configWithoutCors = {} as unknown as SanitizedConfig

const requestWithBody = (body: BodyInit, headers?: HeadersInit) =>
  new Request('https://cms.example.test/api/graphql', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      ...Object.fromEntries(new Headers(headers)),
    }),
    body,
  })

const handlerThatReadsBytes = async (request: Request) => {
  const body = await request.arrayBuffer()
  return new Response(String(body.byteLength), {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': 'https://cms.example.test', Vary: 'Origin' },
  })
}

describe('authenticated GraphQL request body limit', () => {
  it('accepts exactly the configured byte limit and replays every byte to the handler', async () => {
    const body = new Uint8Array(MAX_GRAPHQL_REQUEST_BODY_BYTES)
    body.fill(0x61)
    const request = requestWithBody(body)
    const handler = vi.fn(handlerThatReadsBytes)
    const limitedHandler = withGraphQLRequestBodyLimit(configWithoutCors, handler)

    const response = await limitedHandler(request)

    expect(request.headers.has('content-length')).toBe(false)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(String(MAX_GRAPHQL_REQUEST_BODY_BYTES))
    expect(response.headers.get('vary')).toBe('Origin')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([
    { description: 'a false short length', contentLength: '1' },
    { description: 'a malformed length', contentLength: 'not-a-number' },
    { description: 'a missing length', contentLength: undefined },
  ])('rejects over-limit stream bytes despite $description', async ({ contentLength }) => {
    const body = new Uint8Array(MAX_GRAPHQL_REQUEST_BODY_BYTES + 1)
    const handler = vi.fn(handlerThatReadsBytes)
    const origin = 'https://cms.example.test'
    const config = { cors: [origin] } as unknown as SanitizedConfig
    const limitedHandler = withGraphQLRequestBodyLimit(config, handler)
    const headers = new Headers({ Origin: origin })
    if (contentLength !== undefined) headers.set('Content-Length', contentLength)
    const request = requestWithBody(body, headers)

    const response = await limitedHandler(request)

    expect(response.status).toBe(413)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('vary')).toBe('Origin')
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(await response.json()).toEqual({
      error: `GraphQL request body exceeds the ${MAX_GRAPHQL_REQUEST_BODY_BYTES}-byte limit.`,
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing Content-Length', undefined],
    ['a malformed Content-Length', 'not-a-number'],
    ['a Content-Length larger than the body', String(MAX_GRAPHQL_REQUEST_BODY_BYTES + 100)],
  ])('uses actual bytes rather than %s', async (_description, contentLength) => {
    const headers = new Headers()
    if (contentLength !== undefined) headers.set('Content-Length', contentLength)
    const body = new TextEncoder().encode('{"query":"query { __typename }"}')
    const request = requestWithBody(body, headers)
    const handler = vi.fn(async (forwarded: Request) => new Response(await forwarded.text()))
    const limitedHandler = withGraphQLRequestBodyLimit(configWithoutCors, handler)

    const response = await limitedHandler(request)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(new TextDecoder().decode(body))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('executes a successful GraphQL operation after bounded request replay without a database', async () => {
    const schema = buildSchema('type Query { message: String! }')
    const request = requestWithBody(JSON.stringify({ query: 'query { message }' }))
    const handler = withGraphQLRequestBodyLimit(configWithoutCors, async (forwarded) => {
      const params = (await forwarded.json()) as { query: string }
      const result = await graphql({
        schema,
        source: params.query,
        rootValue: { message: 'ok' },
      })
      return Response.json(result)
    })

    const response = await handler(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { message: 'ok' } })
  })

  it('reads and replays a streaming body when the actual byte count is within the limit', async () => {
    const source = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"query":'))
          controller.enqueue(new TextEncoder().encode('"query { __typename }"}'))
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const request = new Request('https://cms.example.test/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: source,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const handler = vi.fn(async (forwarded: Request) => new Response(await forwarded.text()))
    const limitedHandler = withGraphQLRequestBodyLimit(configWithoutCors, handler)

    const response = await limitedHandler(request)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"query":"query { __typename }"}')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('cancels an over-limit stream immediately instead of reading the remainder', async () => {
    const cancel = vi.fn()
    const chunks = [new Uint8Array(MAX_GRAPHQL_REQUEST_BODY_BYTES), new Uint8Array([0x61])]
    let pulls = 0
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks.shift()
          if (chunk) {
            pulls += 1
            controller.enqueue(chunk)
          } else {
            // Keep the body open so the limiter's cancel call remains observable.
            controller.enqueue(new Uint8Array([0x61]))
          }
        },
        cancel,
      },
      { highWaterMark: 0 },
    )
    const request = new Request('https://cms.example.test/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: source,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const handler = vi.fn(handlerThatReadsBytes)
    const limitedHandler = withGraphQLRequestBodyLimit(configWithoutCors, handler)

    const response = await limitedHandler(request)

    expect(response.status).toBe(413)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(pulls).toBe(2)
    expect(handler).not.toHaveBeenCalled()
  })
})
