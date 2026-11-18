// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * HTTP method regression coverage for the Payload GraphQL route handlers.
 *
 * These tests do not assert on the shape of the route module's exports. They load the real
 * `route.ts` modules and hand them to Next.js's own App Router route module
 * (`next/dist/server/route-modules/app-route/module`), then drive its real `handle()` entry
 * point. That `handle()` implementation is what turns a request method into a handler:
 * `resolveHandler(method)` reads the table produced by `autoImplementMethods()`, which fills
 * every unimplemented method with a 405 response and only delegates HEAD to GET when a GET
 * export exists.
 *
 * So the 405 responses asserted below are produced by Next.js's dispatch code, not by this
 * test. Payload authentication and the Payload route handlers are still test doubles, so this
 * is route-dispatch coverage, not database-backed GraphQL integration coverage.
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
  it('mounts the real route exports, so dispatch sees only POST and OPTIONS', async () => {
    const routeModule = await mountRouteModule(graphql)

    // Sanity check that this test is exercising the production route file rather than a
    // reconstructed handler map. If a GET export were ever added, this assertion fails and the
    // 405 expectations below must be re-audited.
    const userland = routeModule.userland as Record<string, unknown>
    expect(Object.keys(userland).sort()).toEqual(['OPTIONS', 'POST'])
    expect(userland.POST).toBe(graphqlRoute.POST)
    expect(userland.OPTIONS).toBe(graphqlRoute.OPTIONS)
  })

  it.each(UNSUPPORTED_METHODS)(
    'answers %s /api/graphql with the Next.js 405 response and never reaches Payload',
    async (method) => {
      const response = await dispatch(graphql, method)

      expect(response.status).toBe(405)
      expect(graphqlHandlerMock).not.toHaveBeenCalled()
      expect(optionsHandlerMock).not.toHaveBeenCalled()
      // Next.js must not even authenticate, because it resolves the 405 handler before running
      // any userland code for the requested method.
      expect(getPayloadMock).not.toHaveBeenCalled()
      expect(authMock).not.toHaveBeenCalled()
    },
  )

  it('does not delegate HEAD to a GET handler because the route has no GET export', async () => {
    const routeModule = await mountRouteModule(graphql)
    const allowed = (routeModule.userland as Record<string, unknown>).GET

    expect(allowed).toBeUndefined()
    await expect(dispatch(graphql, 'HEAD')).resolves.toMatchObject({ status: 405 })
  })

  it('keeps OPTIONS on the existing Payload REST_OPTIONS delegation', async () => {
    const response = await dispatch(graphql, 'OPTIONS')

    expect(response.status).toBe(204)
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
