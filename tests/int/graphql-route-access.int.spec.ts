// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, getPayloadMock, graphqlHandlerMock, optionsHandlerMock, playgroundHandlerMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    getPayloadMock: vi.fn(),
    graphqlHandlerMock: vi.fn(),
    optionsHandlerMock: vi.fn(),
    playgroundHandlerMock: vi.fn(),
  }))

vi.mock('payload', async (importOriginal) => {
  const payload = await importOriginal<typeof import('payload')>()
  return { ...payload, getPayload: getPayloadMock }
})

vi.mock('@payloadcms/next/routes', () => ({
  GRAPHQL_PLAYGROUND_GET: vi.fn(() => playgroundHandlerMock),
  GRAPHQL_POST: vi.fn(() => graphqlHandlerMock),
  REST_OPTIONS: vi.fn(() => optionsHandlerMock),
}))

import { NO_PERMISSIONS } from '@/access/permissions'
import { MAX_GRAPHQL_QUERY_NESTING } from '@/auth/graphqlQueryNestingLimit'
import { MAX_GRAPHQL_REQUEST_BODY_BYTES } from '@/auth/graphqlRequestBodyLimit'
import { OPTIONS, POST } from '@/app/(payload)/api/graphql/route'
import { GET as playgroundGET } from '@/app/(payload)/api/graphql-playground/route'

const editor = {
  id: 17,
  permissions: { ...NO_PERMISSIONS, roles: ['Content editor'] },
}

const rolelessUser = {
  id: 18,
  permissions: { ...NO_PERMISSIONS },
}

const makePostRequest = () =>
  new Request('https://cms.example.test/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'payload-token=session' },
    body: JSON.stringify({ query: 'query { articles { docs { id } } }' }),
  })

const makeOversizedPostRequest = () =>
  new Request('https://cms.example.test/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'payload-token=session' },
    body: new Uint8Array(MAX_GRAPHQL_REQUEST_BODY_BYTES + 1),
  })

const makeDeepPostRequest = (depth: number) =>
  new Request('https://cms.example.test/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'payload-token=session' },
    body: JSON.stringify({
      query: `query Deep { root { ${'next {'.repeat(depth)}value${' }'.repeat(depth)} } }`,
    }),
  })

beforeEach(() => {
  authMock.mockReset()
  getPayloadMock.mockReset().mockResolvedValue({ auth: authMock })
  graphqlHandlerMock
    .mockReset()
    .mockResolvedValue(new Response('GraphQL response', { status: 200 }))
  optionsHandlerMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  playgroundHandlerMock.mockReset().mockResolvedValue(new Response('Playground', { status: 200 }))
  authMock.mockResolvedValue({ user: null })
})

describe('Admin-authorized Payload GraphQL routes', () => {
  it('rejects unauthenticated GraphQL POSTs before delegating to the Payload handler', async () => {
    const request = makePostRequest()
    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Authentication required.' })
    expect(authMock).toHaveBeenCalledWith({ headers: request.headers })
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
  })

  it('fails closed for an authorized principal without a stable rate-limit identity', async () => {
    authMock.mockResolvedValue({
      user: { permissions: { ...NO_PERMISSIONS, roles: ['Content editor'] } },
    })
    const request = makePostRequest()

    const response = await POST(request)

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'GraphQL request identity is unavailable.' })
    expect(request.bodyUsed).toBe(false)
    expect(authMock).toHaveBeenCalledWith({ headers: request.headers })
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'unauthenticated requests',
      status: 401,
      user: null,
      error: 'Authentication required.',
    },
    {
      name: 'roleless requests',
      status: 403,
      user: rolelessUser,
      error: 'Admin access required.',
    },
  ])(
    'checks authorization before reading the body of oversized $name',
    async ({ status, user, error }) => {
      if (user) authMock.mockResolvedValue({ user })
      const request = makeOversizedPostRequest()

      const response = await POST(request)

      expect(response.status).toBe(status)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ error })
      expect(request.bodyUsed).toBe(false)
      expect(graphqlHandlerMock).not.toHaveBeenCalled()
    },
  )

  it('rejects an authorized oversized GraphQL POST before delegating to Payload', async () => {
    authMock.mockResolvedValue({ user: editor })

    const response = await POST(makeOversizedPostRequest())

    expect(response.status).toBe(413)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
  })

  it('rejects an authorized deeply nested query before Payload parses it', async () => {
    authMock.mockResolvedValue({ user: editor })
    const request = makeDeepPostRequest(MAX_GRAPHQL_QUERY_NESTING + 1500)

    const response = await POST(request)
    const body = (await response.json()) as { errors?: Array<{ message: string }> }

    expect(response.status).toBe(400)
    expect(body.errors?.[0]?.message).toContain('maximum supported nesting')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
    expect(authMock).toHaveBeenCalledWith({ headers: request.headers })
  })

  it('allows a user with any assigned role without caching or dropping Payload response headers', async () => {
    authMock.mockResolvedValue({ user: editor })
    const request = makePostRequest()
    const requestBody = await request.clone().text()
    graphqlHandlerMock.mockImplementation(async (forwardedRequest: Request) => {
      expect(await forwardedRequest.clone().text()).toBe(requestBody)
      return new Response('Payload GraphQL result', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': 'https://cms.example.test',
          'Cache-Control': 'private, max-age=60',
          Vary: 'Origin',
        },
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test')
    expect(response.headers.get('vary')).toBe('Origin')
    expect(await response.text()).toBe('Payload GraphQL result')
    const forwardedRequest = graphqlHandlerMock.mock.calls[0]?.[0] as Request
    expect(forwardedRequest).not.toBe(request)
    expect(forwardedRequest.url).toBe(request.url)
    expect(forwardedRequest.method).toBe(request.method)
    expect(forwardedRequest.headers.get('cookie')).toBe(request.headers.get('cookie'))
    expect(graphqlHandlerMock).toHaveBeenCalledTimes(1)
    expect(getPayloadMock).toHaveBeenCalledTimes(1)
  })

  it('successfully delegates an authorized GraphQL request at the exact body-size limit', async () => {
    authMock.mockResolvedValue({ user: editor })
    const prefix = '{"query":"query { __typename }","padding":"'
    const suffix = '"}'
    const requestBody = `${prefix}${'x'.repeat(MAX_GRAPHQL_REQUEST_BODY_BYTES - prefix.length - suffix.length)}${suffix}`
    const requestBytes = new TextEncoder().encode(requestBody)
    expect(requestBytes.byteLength).toBe(MAX_GRAPHQL_REQUEST_BODY_BYTES)

    const request = new Request('https://cms.example.test/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'payload-token=session',
        Origin: 'https://cms.example.test',
      },
      body: requestBytes,
    })
    graphqlHandlerMock.mockImplementation(async (forwardedRequest: Request) => {
      expect(await forwardedRequest.text()).toBe(requestBody)
      return Response.json(
        { data: { __typename: 'Query' } },
        {
          headers: {
            'Access-Control-Allow-Origin': 'https://cms.example.test',
            Vary: 'Origin',
          },
        },
      )
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test')
    expect(response.headers.get('vary')).toBe('Origin')
    expect(await response.json()).toEqual({ data: { __typename: 'Query' } })
    expect(graphqlHandlerMock).toHaveBeenCalledTimes(1)
  })

  it('also disables caching on authorized GraphQL error responses', async () => {
    authMock.mockResolvedValue({ user: editor })
    graphqlHandlerMock.mockResolvedValue(
      new Response('GraphQL error', {
        status: 500,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      }),
    )

    const response = await POST(makePostRequest())

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('GraphQL error')
  })

  it('uses the same Admin policy to protect the development GraphQL Playground', async () => {
    const request = new Request('https://cms.example.test/api/graphql-playground')
    const denied = await playgroundGET(request)

    expect(denied.status).toBe(401)
    expect(playgroundHandlerMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue({ user: editor })
    const allowed = await playgroundGET(request)

    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('cache-control')).toBe('no-store')
    expect(await allowed.text()).toBe('Playground')
    expect(playgroundHandlerMock).toHaveBeenCalledWith(request)
  })

  it('preserves Payload GraphQL CORS preflight headers while disabling caching', async () => {
    optionsHandlerMock.mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Origin': 'https://cms.example.test',
          Vary: 'Origin',
        },
      }),
    )
    const request = new Request('https://cms.example.test/api/graphql', { method: 'OPTIONS' })
    const routeContext = { params: Promise.resolve({}) }
    const response = await OPTIONS(request, routeContext)

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test')
    expect(response.headers.get('vary')).toBe('Origin')
    expect(optionsHandlerMock).toHaveBeenCalledWith(request, routeContext)
    expect(getPayloadMock).not.toHaveBeenCalled()
  })
})
