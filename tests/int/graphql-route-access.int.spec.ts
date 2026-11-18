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

  it('rejects authenticated users who do not satisfy Users.access.admin', async () => {
    authMock.mockResolvedValue({ user: rolelessUser })

    const response = await POST(makePostRequest())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Admin access required.' })
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
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
    expect(graphqlHandlerMock).toHaveBeenCalledWith(request)
    expect(getPayloadMock).toHaveBeenCalledTimes(1)
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

  it('leaves Payload GraphQL CORS preflight on the existing REST_OPTIONS handler', async () => {
    const request = new Request('https://cms.example.test/api/graphql', { method: 'OPTIONS' })
    const routeContext = { params: Promise.resolve({}) }
    const response = await OPTIONS(request, routeContext)

    expect(response.status).toBe(204)
    expect(optionsHandlerMock).toHaveBeenCalledWith(request, routeContext)
    expect(getPayloadMock).not.toHaveBeenCalled()
  })
})
