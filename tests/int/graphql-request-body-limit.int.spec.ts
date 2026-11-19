// @vitest-environment node
import { buildSchema, graphql } from 'graphql'
import type { SanitizedConfig } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GRAPHQL_REQUEST_BODY_DEADLINE_MS,
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

const requestWithStream = (body: ReadableStream<Uint8Array>, signal?: AbortSignal) =>
  new Request('https://cms.example.test/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://cms.example.test',
    },
    body,
    signal,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

afterEach(() => {
  vi.useRealTimers()
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
    expect(request.body?.locked).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns a CORS-enabled 408 for a never-completing upload without waiting for cancel', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const source = new ReadableStream<Uint8Array>({ pull() {}, cancel }, { highWaterMark: 0 })
    const request = requestWithStream(source)
    const schema = buildSchema('type Query { ping: String! }')
    const resolver = vi.fn(() => 'pong')
    const handler = vi.fn(async () => {
      const result = await graphql({ schema, source: '{ ping }', rootValue: { ping: resolver } })
      return Response.json(result)
    })
    const limitedHandler = withGraphQLRequestBodyLimit(
      { cors: ['https://cms.example.test'] } as unknown as SanitizedConfig,
      handler,
    )
    const pendingResponse = limitedHandler(request)

    await vi.advanceTimersByTimeAsync(GRAPHQL_REQUEST_BODY_DEADLINE_MS)
    const response = await pendingResponse

    expect(response.status).toBe(408)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('vary')).toContain('Origin')
    expect(await response.json()).toEqual({
      error: `GraphQL request body exceeded its ${GRAPHQL_REQUEST_BODY_DEADLINE_MS}-millisecond deadline.`,
    })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(request.body?.locked).toBe(false)
    expect(handler).not.toHaveBeenCalled()
    expect(resolver).not.toHaveBeenCalled()
  })

  it('uses one total deadline across a slow trickle instead of resetting it per chunk', async () => {
    vi.useFakeTimers()
    let cancelled = false
    let chunksSent = 0
    let pendingPullTimer: ReturnType<typeof setTimeout> | undefined
    let resolvePendingPull: (() => void) | undefined
    const cancel = vi.fn(() => {
      cancelled = true
      if (pendingPullTimer !== undefined) clearTimeout(pendingPullTimer)
      resolvePendingPull?.()
    })
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          return new Promise<void>((resolve) => {
            resolvePendingPull = resolve
            pendingPullTimer = setTimeout(() => {
              pendingPullTimer = undefined
              if (!cancelled) {
                controller.enqueue(new Uint8Array([0x61]))
                chunksSent += 1
              }
              resolve()
            }, 6000)
          })
        },
        cancel,
      },
      { highWaterMark: 0 },
    )
    const request = requestWithStream(source)
    const handler = vi.fn(handlerThatReadsBytes)
    const limitedHandler = withGraphQLRequestBodyLimit(
      { cors: ['https://cms.example.test'] } as unknown as SanitizedConfig,
      handler,
    )
    const pendingResponse = limitedHandler(request)

    await vi.advanceTimersByTimeAsync(GRAPHQL_REQUEST_BODY_DEADLINE_MS)
    const response = await pendingResponse

    expect(chunksSent).toBe(2)
    expect(response.status).toBe(408)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(request.body?.locked).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('treats request disconnects and AbortError stream failures as client timeouts', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({ pull() {}, cancel }, { highWaterMark: 0 })
    const request = requestWithStream(source, controller.signal)
    const handler = vi.fn(handlerThatReadsBytes)
    const limitedHandler = withGraphQLRequestBodyLimit(
      { cors: ['https://cms.example.test'] } as unknown as SanitizedConfig,
      handler,
    )
    const pendingResponse = limitedHandler(request)
    controller.abort()
    const disconnected = await pendingResponse

    expect(disconnected.status).toBe(408)
    expect(await disconnected.json()).toEqual({ error: 'GraphQL request body was interrupted.' })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(request.body?.locked).toBe(false)
    expect(handler).not.toHaveBeenCalled()

    const abortingSource = new ReadableStream<Uint8Array>(
      {
        pull(streamController) {
          streamController.error(new DOMException('Client disconnected', 'AbortError'))
        },
      },
      { highWaterMark: 0 },
    )
    const abortingRequest = requestWithStream(abortingSource)
    const abortingResponse = await limitedHandler(abortingRequest)

    expect(abortingResponse.status).toBe(408)
    expect(await abortingResponse.json()).toEqual({
      error: 'GraphQL request body was interrupted.',
    })
    expect(abortingRequest.body?.locked).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns a controlled 400 when the body stream fails for a non-abort reason', async () => {
    const failedSource = new ReadableStream<Uint8Array>(
      {
        pull(streamController) {
          streamController.error(new Error('client body stream failure'))
        },
      },
      { highWaterMark: 0 },
    )
    const request = requestWithStream(failedSource)
    const handler = vi.fn(handlerThatReadsBytes)
    const limitedHandler = withGraphQLRequestBodyLimit(
      { cors: ['https://cms.example.test'] } as unknown as SanitizedConfig,
      handler,
    )

    const response = await limitedHandler(request)

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test')
    expect(await response.json()).toEqual({ error: 'Unable to read GraphQL request body.' })
    expect(request.body?.locked).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })
})
