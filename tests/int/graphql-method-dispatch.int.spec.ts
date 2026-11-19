// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * HTTP method regression coverage for the Payload GraphQL route handlers.
 *
 * These tests load the real `route.ts` modules into Next.js's App Router route module
 * (`next/dist/server/route-modules/app-route/module`) and drive its real `handle()` entry point.
 * The GraphQL route explicitly exports no-store 405 handlers for unsupported standard methods,
 * while OPTIONS remains delegated to Payload's CORS handler. Next.js dispatches to those real
 * exports; authentication and Payload handlers are test doubles, so this is route-dispatch
 * coverage rather than database-backed GraphQL integration coverage.
 */

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

import { AppRouteRouteModule } from 'next/dist/server/route-modules/app-route/module.js'
import type {
  AppRouteHandlerFn,
  AppRouteRouteHandlerContext,
  AppRouteUserlandModule,
} from 'next/dist/server/route-modules/app-route/module.js'
import type { AppRouteRouteDefinition } from 'next/dist/server/route-definitions/app-route-route-definition.d.ts'
import { addRequestMeta } from 'next/dist/server/request-meta.js'
import { NextRequest } from 'next/dist/server/web/spec-extension/request.js'

import { NO_PERMISSIONS } from '@/access/permissions'
import * as graphqlRoute from '@/app/(payload)/api/graphql/route'
import * as playgroundRoute from '@/app/(payload)/api/graphql-playground/route'

const ORIGIN = 'https://cms.example.test'

const editor = {
  id: 17,
  permissions: { ...NO_PERMISSIONS, roles: ['Content editor'] },
}

type MountedRoute = {
  /** URL the route is served from, used as the request pathname and route definition page. */
  path: string
  /** The real exports of `route.ts`, exactly as Next.js would consume them. */
  module: Record<string, unknown>
}

const graphql: MountedRoute = { path: '/api/graphql', module: graphqlRoute }
const playground: MountedRoute = { path: '/api/graphql-playground', module: playgroundRoute }

/**
 * Mount the route's real exports in Next.js's App Route module, the same way Next.js wires a
 * `route.ts` file into a request handler at build time.
 */
const mountRouteModule = async ({ path, module }: MountedRoute): Promise<AppRouteRouteModule> => {
  const definition = {
    kind: 'APP_ROUTE',
    pathname: path,
    page: path,
    filename: `${path}/route`,
    bundlePath: `app${path}/route`,
  } as unknown as AppRouteRouteDefinition

  const routeModule = new AppRouteRouteModule({
    userland: () => module as unknown as AppRouteUserlandModule,
    definition,
    distDir: '.next',
    relativeProjectDir: '',
    resolvedPagePath: `src/app/(payload)${path}/route.ts`,
    nextConfigOutput: undefined,
  })

  await routeModule.ensureUserland()
  return routeModule
}

const dispatch = async (route: MountedRoute, method: string): Promise<Response> => {
  const routeModule = await mountRouteModule(route)
  const url = `${ORIGIN}${route.path}`
  const request = new NextRequest(url, { method })
  // Next.js reads request metadata that its own server normally populates before dispatch.
  addRequestMeta(request, 'initURL', url)

  const context = {
    renderOpts: {
      experimental: {},
      onInstrumentationRequestError: (): void => {},
      supportsDynamicResponse: true,
      params: {},
      routeModule,
    },
    previewProps: {},
    sharedContext: { buildId: 'graphql-method-dispatch-test', deploymentId: 'test' },
    waitUntil: (): void => {},
    onClose: (): void => {},
  } as unknown as AppRouteRouteHandlerContext

  return routeModule.handle(request, context)
}

const UNSUPPORTED_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'] as const

beforeEach(() => {
  authMock.mockReset()
  getPayloadMock.mockReset().mockResolvedValue({ auth: authMock })
  authMock.mockResolvedValue({ user: null })
  graphqlHandlerMock
    .mockReset()
    .mockResolvedValue(new Response('GraphQL response', { status: 200 }))
  optionsHandlerMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  playgroundHandlerMock.mockReset().mockResolvedValue(new Response('Playground', { status: 200 }))
})

describe('Next.js App Route dispatch for the Admin-gated GraphQL route', () => {
  it('mounts explicit no-store handlers for unsupported methods and Payload handlers for POST/OPTIONS', async () => {
    const routeModule = await mountRouteModule(graphql)
    const userland = routeModule.userland as Record<string, unknown>
    const methodExports = Object.keys(userland)
      .filter((name) => ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(name))
      .sort()

    expect(methodExports).toEqual(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'])
    expect(userland.runtime).toBe('nodejs')
    expect(userland.GET).toBe(userland.HEAD)
    expect(userland.GET).toBeDefined()
    expect(userland.POST).toBe(graphqlRoute.POST)
    expect(userland.OPTIONS).toBe(graphqlRoute.OPTIONS)
  })

  it.each(UNSUPPORTED_METHODS)(
    'answers %s /api/graphql with a no-store 405 before reaching Payload',
    async (method) => {
      const response = await dispatch(graphql, method)

      expect(response.status).toBe(405)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(graphqlHandlerMock).not.toHaveBeenCalled()
      expect(optionsHandlerMock).not.toHaveBeenCalled()
      // Next.js must not even authenticate, because it resolves the 405 handler before running
      // any userland code for the requested method.
      expect(getPayloadMock).not.toHaveBeenCalled()
      expect(authMock).not.toHaveBeenCalled()
    },
  )

  it('keeps GET and HEAD unavailable for GraphQL through explicit no-store 405 exports', async () => {
    const routeModule = await mountRouteModule(graphql)
    const userland = routeModule.userland as Record<string, unknown>

    expect(userland.GET).toBeDefined()
    expect(userland.HEAD).toBe(userland.GET)

    const getResponse = await dispatch(graphql, 'GET')
    const headResponse = await dispatch(graphql, 'HEAD')
    expect(getResponse.status).toBe(405)
    expect(headResponse.status).toBe(405)
    expect(getResponse.headers.get('cache-control')).toBe('no-store')
    expect(headResponse.headers.get('cache-control')).toBe('no-store')
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
  })

  it('keeps OPTIONS on Payload REST_OPTIONS, preserves CORS headers, and disables caching', async () => {
    optionsHandlerMock.mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Origin': ORIGIN,
          Vary: 'Origin',
        },
      }),
    )
    const response = await dispatch(graphql, 'OPTIONS')

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(response.headers.get('vary')).toBe('Origin')
    expect(optionsHandlerMock).toHaveBeenCalledTimes(1)
    expect(optionsHandlerMock.mock.calls[0]?.[0]).toBeInstanceOf(NextRequest)
    expect(getPayloadMock).not.toHaveBeenCalled()
    expect(graphqlHandlerMock).not.toHaveBeenCalled()
  })

  it('still runs the Admin gate for POST through the same dispatch path', async () => {
    const denied = await dispatch(graphql, 'POST')

    expect(denied.status).toBe(401)
    expect(denied.headers.get('cache-control')).toBe('no-store')
    expect(graphqlHandlerMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue({ user: editor })
    const allowed = await dispatch(graphql, 'POST')

    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('cache-control')).toBe('no-store')
    expect(await allowed.text()).toBe('GraphQL response')
    expect(graphqlHandlerMock).toHaveBeenCalledTimes(1)
  })
})

describe('Next.js App Route dispatch for the Admin-gated GraphQL Playground', () => {
  it('mounts the real Playground route exports, so dispatch sees only GET', async () => {
    const routeModule = await mountRouteModule(playground)
    const userland = routeModule.userland as Record<string, unknown>

    expect(Object.keys(userland).sort()).toEqual(['GET'])
    expect(userland.GET).toBe(playgroundRoute.GET)
  })

  it.each(['PUT', 'PATCH', 'DELETE'] as const)(
    'answers %s /api/graphql-playground with the Next.js 405 response',
    async (method) => {
      const response = await dispatch(playground, method)

      expect(response.status).toBe(405)
      expect(playgroundHandlerMock).not.toHaveBeenCalled()
      expect(getPayloadMock).not.toHaveBeenCalled()
    },
  )

  it('does not expose the Playground to anonymous requests', async () => {
    const response = await dispatch(playground, 'GET')

    expect(response.status).toBe(401)
    expect(playgroundHandlerMock).not.toHaveBeenCalled()
  })

  it('keeps Next.js HEAD delegation, which reuses the Admin-gated GET handler', async () => {
    const anonymous = await dispatch(playground, 'HEAD')

    expect(anonymous.status).toBe(401)
    expect(playgroundHandlerMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue({ user: editor })
    const authorized = await dispatch(playground, 'HEAD')

    expect(authorized.status).toBe(200)
    expect(playgroundHandlerMock).toHaveBeenCalledTimes(1)
    // HEAD is served by the same userland handler object Next.js uses for GET.
    const getHandler: AppRouteHandlerFn = playgroundRoute.GET
    expect(playgroundHandlerMock.mock.calls[0]?.[0]).toBeInstanceOf(NextRequest)
    expect(getHandler).toBeTypeOf('function')
  })
})
