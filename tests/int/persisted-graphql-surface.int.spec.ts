// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSchema, Kind, parse, validate, visit, type OperationDefinitionNode } from 'graphql'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import configPromise from '@payload-config'
import { MAX_GRAPHQL_REQUEST_BODY_BYTES } from '@/auth/graphqlRequestBodyLimit'
import {
  createAnonymousGraphQLRequestRateLimiter,
  GRAPHQL_RATE_LIMIT_BURST,
  GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS,
} from '@/auth/publicGraphQLRateLimit'
import {
  executePersistedQuery,
  handlePersistedGraphQLHttpRequest,
} from '@/fgql/executePersistedQuery'
import { normalizeGraphQLUnionAliases } from '@/fgql/normalize'
import {
  MAX_PERSISTED_SLUG_LENGTH,
  PERSISTED_QUERY_IDS,
  PERSISTED_QUERY_REGISTRY,
  validatePersistedEnvelope,
} from '@/fgql/persistedQueryRegistry'
import {
  logPersistedQueryFallback,
  logPersistedQueryFallbackFailure,
  readCompleteGraphQLList,
  readGraphQLList,
  readGraphQLObject,
} from '@/fgql/response'

let schema: ReturnType<typeof buildSchema>

beforeAll(() => {
  schema = buildSchema(readFileSync(resolve(process.cwd(), 'schema.graphql'), 'utf8'))
})

describe('persisted GraphQL registry contract', () => {
  it('registers the exact 16 single-query read operations valid against schema.graphql', () => {
    expect(PERSISTED_QUERY_IDS).toHaveLength(16)
    expect(Object.keys(PERSISTED_QUERY_REGISTRY)).toEqual([...PERSISTED_QUERY_IDS])

    const forbiddenRootQueries = new Set([
      'CustomCode',
      'docAccessCustomCode',
      'versionCustomCode',
      'versionsCustomCode',
      'FormSubmission',
      'FormSubmissions',
      'countFormSubmissions',
      'docAccessFormSubmission',
      'Media',
      'allMedia',
      'countallMedia',
      'docAccessMedia',
      'PayloadFolder',
      'PayloadFolders',
      'countPayloadFolders',
      'docAccessPayloadFolder',
      'User',
      'Users',
      'meUser',
      'Role',
      'Roles',
      'AuditLog',
      'AuditLogs',
    ])

    for (const id of PERSISTED_QUERY_IDS) {
      const entry = PERSISTED_QUERY_REGISTRY[id]
      expect(entry.id).toBe(id)

      const ast = parse(entry.query)
      const errors = validate(schema, ast)
      expect(errors, `${id}: ${errors.map((err) => err.message).join('; ')}`).toEqual([])

      const operations = ast.definitions.filter(
        (def): def is OperationDefinitionNode => def.kind === Kind.OPERATION_DEFINITION,
      )
      expect(operations).toHaveLength(1)
      expect(operations[0]?.operation).toBe('query')
      expect(operations[0]?.name?.value).toBe(entry.operationName)

      for (const selection of operations[0]!.selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
          expect(
            forbiddenRootQueries.has(selection.name.value),
            `${id}.${selection.name.value}`,
          ).toBe(false)
        }
      }

      visit(ast, {
        Field(node) {
          expect(node.name.value).not.toBe('__schema')
          expect(node.name.value).not.toBe('__type')
          expect(node.name.value).not.toBe('emails')
          expect(node.name.value).not.toBe('folder')
          expect(node.name.value).not.toBe('_objectKey')
        },
      })
    }
  })

  it('rejects arbitrary query text, batching, unknown keys, unknown ids, and malformed slug variables', () => {
    expect(validatePersistedEnvelope([])).toMatchObject({ ok: false, status: 400 })
    expect(validatePersistedEnvelope(null)).toMatchObject({ ok: false, status: 400 })
    expect(
      validatePersistedEnvelope({
        id: 'public.footer.v1',
        query: '{ Footer { copyRight { year } } }',
      }),
    ).toMatchObject({ ok: false, status: 400 })
    expect(
      validatePersistedEnvelope({ id: 'public.footer.v1', operationName: 'PublicFooter' }),
    ).toMatchObject({ ok: false, status: 400 })
    expect(validatePersistedEnvelope({ id: 'public.unknown.v1' })).toMatchObject({
      ok: false,
      status: 404,
    })
    expect(
      validatePersistedEnvelope({ id: 'public.footer.v1', variables: { slug: 'nope' } }),
    ).toMatchObject({ ok: false, status: 400 })
    expect(validatePersistedEnvelope({ id: 'public.article-detail.v1' })).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(
      validatePersistedEnvelope({
        id: 'public.article-detail.v1',
        variables: { slug: 'a'.repeat(MAX_PERSISTED_SLUG_LENGTH + 1) },
      }),
    ).toMatchObject({ ok: false, status: 400 })
    expect(
      validatePersistedEnvelope({
        id: 'public.article-detail.v1',
        variables: { slug: ' bad-whitespace ' },
      }),
    ).toMatchObject({ ok: false, status: 400 })
    expect(
      validatePersistedEnvelope({
        id: 'public.article-detail.v1',
        variables: { slug: 'bad\u0000control' },
      }),
    ).toMatchObject({ ok: false, status: 400 })

    const validDetail = validatePersistedEnvelope({
      id: 'public.article-detail.v1',
      variables: { slug: 'valid-article-slug' },
    })
    expect(validDetail).toMatchObject({
      ok: true,
      variables: { slug: 'valid-article-slug' },
    })
  })
})

describe('persisted GraphQL response & normalization helpers', () => {
  it('enforces list completeness against totalDocs and rejects missing object roots', () => {
    expect(readGraphQLList({ articles: { docs: [{ id: 1 }], totalDocs: 1 } }, 'articles')).toEqual({
      docs: [{ id: 1 }],
      totalDocs: 1,
    })
    expect(
      readCompleteGraphQLList({ articles: { docs: [{ id: 1 }], totalDocs: 1 } }, 'articles'),
    ).toEqual([{ id: 1 }])
    expect(() =>
      readCompleteGraphQLList({ articles: { docs: [{ id: 1 }], totalDocs: 2 } }, 'articles'),
    ).toThrow(/returned 1 of 2 rows/)
    expect(() => readGraphQLObject({ Header: null }, 'Header')).toThrow(/no object/)
  })

  it('restores aliased union fields, formatted select enum values, and logs fallback outcomes outside test mode', () => {
    const normalized = normalizeGraphQLUnionAliases([
      {
        categories: ['front_end', 'back_end', 'cms_crm'],
        type: '_302',
        articlesHeader: {
          backgroundPreset: 'aurora_grain',
          accentTone: 'gold_copper',
        },
        contactInfo: [{ className: 'text_white', type: 'email' }],
        fields: [
          {
            __typename: 'Text',
            Text_name: 'email',
            Text_label: 'Email address',
            Text_defaultValue: 'person@example.test',
            Text_id: 'field-1',
          },
        ],
        redirect: {
          reference: {
            relationTo: 'articles',
            value: {
              __typename: 'Article',
              Article_id: 4,
              Article_slug: 'a-story',
              Article_title: 'A story',
            },
          },
        },
      },
    ])

    expect(normalized).toEqual([
      {
        categories: ['front-end', 'back-end', 'cms-crm'],
        type: '302',
        articlesHeader: {
          backgroundPreset: 'aurora-grain',
          accentTone: 'gold-copper',
        },
        contactInfo: [{ className: 'text-white', type: 'email' }],
        fields: [
          {
            blockType: 'text',
            name: 'email',
            label: 'Email address',
            defaultValue: 'person@example.test',
            id: 'field-1',
          },
        ],
        redirect: {
          reference: {
            relationTo: 'articles',
            value: { id: 4, slug: 'a-story', title: 'A story' },
          },
        },
      },
    ])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubEnv('NODE_ENV', 'development')
    try {
      logPersistedQueryFallback('public.forms.v1', new Error('primary failed'))
      logPersistedQueryFallbackFailure('public.forms.v1', new Error('fallback failed'))
      expect(errorSpy).toHaveBeenCalledTimes(2)
      expect(errorSpy.mock.calls[0]?.[0]).toContain('using the authorized Local API fallback')
      expect(errorSpy.mock.calls[1]?.[0]).toContain('Local API fallback failed')
    } finally {
      vi.unstubAllEnvs()
      errorSpy.mockRestore()
    }
  })
})

describe('anonymous persisted GraphQL rate limiter', () => {
  it('uses one process-local bucket across untrusted forwarded-address headers and refills it', async () => {
    let now = 0
    const handler = vi.fn(async () => new Response('allowed', { status: 200 }))
    const limited = createAnonymousGraphQLRequestRateLimiter({ now: () => now })(
      configPromise,
      handler,
    )
    const requestFrom = (address: string): Request =>
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: { 'x-forwarded-for': address },
      })

    for (let index = 0; index < GRAPHQL_RATE_LIMIT_BURST; index += 1) {
      expect((await limited(requestFrom(`203.0.113.${index % 255}`))).status).toBe(200)
    }

    const blocked = await limited(requestFrom('198.51.100.44'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('1')
    expect(blocked.headers.get('cache-control')).toBe('no-store')
    expect(handler).toHaveBeenCalledTimes(GRAPHQL_RATE_LIMIT_BURST)

    now += GRAPHQL_RATE_LIMIT_REFILL_WINDOW_MS
    expect((await limited(requestFrom('198.51.100.45'))).status).toBe(200)
  })
})

describe('anonymous persisted GraphQL HTTP route and Payload dispatch', () => {
  it('strips credentials, rewrites pathname to /api/graphql, and stamps Cache-Control: no-store', async () => {
    let forwardedRequest: Request | null = null
    const mockGraphQLPost = vi.fn(async (req: Request) => {
      forwardedRequest = req
      return Response.json({ data: { Footer: { copyRight: { year: 2026 } } } })
    })

    const response = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'payload-token=secret-admin-jwt',
          Authorization: 'JWT secret-admin-jwt',
          Origin: 'https://portfolio.example.test',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        body: JSON.stringify({ id: 'public.footer.v1' }),
      }),
      { graphQLPostHandler: mockGraphQLPost },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mockGraphQLPost).toHaveBeenCalledTimes(1)
    expect(forwardedRequest).not.toBeNull()
    expect(new URL(forwardedRequest!.url).pathname).toBe('/api/graphql')
    expect(forwardedRequest!.headers.get('cookie')).toBeNull()
    expect(forwardedRequest!.headers.get('authorization')).toBeNull()
    expect(forwardedRequest!.headers.get('origin')).toBe('https://portfolio.example.test')
    expect(forwardedRequest!.headers.get('accept-language')).toBe('fr-FR,fr;q=0.9')

    const forwardedJson = (await forwardedRequest!.json()) as {
      query: string
      operationName: string
      variables?: Record<string, unknown>
    }
    expect(forwardedJson.operationName).toBe('PublicFooter')
    expect(forwardedJson.query).toContain('query PublicFooter')
    expect(forwardedJson.variables).toBeUndefined()
  })

  it('rejects unsupported HTTP methods, URL query params, non-JSON bodies, malformed JSON, and unknown operations without calling GRAPHQL_POST', async () => {
    const mockGraphQLPost = vi.fn(async () => Response.json({ data: {} }))

    const getRes = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql', { method: 'GET' }),
      { graphQLPostHandler: mockGraphQLPost },
    )
    expect(getRes.status).toBe(405)
    expect(getRes.headers.get('cache-control')).toBe('no-store')

    const urlQueryRes = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql?id=public.footer.v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'public.footer.v1' }),
      }),
      { graphQLPostHandler: mockGraphQLPost },
    )
    expect(urlQueryRes.status).toBe(400)

    const textBodyRes = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"id":"public.footer.v1"}',
      }),
      { graphQLPostHandler: mockGraphQLPost },
    )
    expect(textBodyRes.status).toBe(415)

    const badJsonRes = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad-json',
      }),
      { graphQLPostHandler: mockGraphQLPost },
    )
    expect(badJsonRes.status).toBe(400)

    const arbitraryQueryRes = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query { __schema { queryType { name } } }' }),
      }),
      { graphQLPostHandler: mockGraphQLPost },
    )
    expect(arbitraryQueryRes.status).toBe(400)

    const unknownIdRes = await handlePersistedGraphQLHttpRequest(
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'public.does-not-exist.v1' }),
      }),
      { graphQLPostHandler: mockGraphQLPost },
    )
    expect(unknownIdRes.status).toBe(404)

    expect(mockGraphQLPost).not.toHaveBeenCalled()
  })

  it('enforces the 1 MiB request body cap and POST-only exports on the /api/fgql route module', async () => {
    const fgqlRoute = await import('@/app/(payload)/api/fgql/route')

    expect((await fgqlRoute.GET()).status).toBe(405)
    expect((await fgqlRoute.HEAD()).status).toBe(405)
    expect((await fgqlRoute.PUT()).status).toBe(405)
    expect((await fgqlRoute.PATCH()).status).toBe(405)
    expect((await fgqlRoute.DELETE()).status).toBe(405)

    const oversized = await fgqlRoute.POST(
      new Request('https://cms.example.test/api/fgql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: new Uint8Array(MAX_GRAPHQL_REQUEST_BODY_BYTES + 1),
      }),
    )
    expect(oversized.status).toBe(413)
    expect(oversized.headers.get('cache-control')).toBe('no-store')
  })

  it('surfaces GraphQL errors from executePersistedQuery so callers trigger authorized Local API fallbacks', async () => {
    const failingHandler = vi.fn(async () =>
      Response.json({
        data: null,
        errors: [{ message: 'Simulated database error' }],
      }),
    )

    await expect(
      executePersistedQuery('public.navigation.v1', undefined, {
        graphQLPostHandler: failingHandler,
      }),
    ).rejects.toThrow(/Simulated database error/)
  })
})
