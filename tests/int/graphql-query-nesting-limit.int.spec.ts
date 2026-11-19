// @vitest-environment node
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { configToSchema } from '@payloadcms/graphql'
import type { GraphQLObjectType as GraphQLObjectTypeInstance } from 'graphql'
import type { DocumentNode, GraphQLSchema, ValidationRule } from 'graphql'
import type { Payload, SanitizedConfig } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import configPromise from '@payload-config'
import {
  MAX_GRAPHQL_QUERY_NESTING,
  measureGraphQLQueryNesting,
  withGraphQLQueryNestingLimit,
} from '@/auth/graphqlQueryNestingLimit'
import { documentQuery, MAX_GRAPHQL_DEPTH } from '@/components/admin/views/GraphQL/query'

const projectRequire = createRequire(resolve(process.cwd(), 'package.json'))
// Reuse the GraphQL peer loaded by Payload's external Node modules instead of Vite's ESM copy.
const payloadGraphQLRequire = createRequire(projectRequire.resolve('@payloadcms/graphql'))
const graphql = payloadGraphQLRequire('graphql') as typeof import('graphql')
const payloadNextRequire = createRequire(projectRequire.resolve('@payloadcms/next/routes'))
const createFetchHandler = payloadNextRequire('graphql-http/lib/use/fetch').createHandler as (
  options: Record<string, unknown>,
) => GraphQLHandler

type GraphQLHandler = (request: Request) => Promise<Response>
type PayloadValidationRules = (args: {
  variableValues?: Record<string, unknown>
}) => ValidationRule[]
type GraphQLResponse = {
  data?: unknown
  errors?: Array<{ message: string }>
}

const testCorsOrigin = 'https://cms.example.test'
const configWithoutCors = {} as unknown as SanitizedConfig
let applicationConfig: SanitizedConfig

beforeAll(async () => {
  applicationConfig = (await configPromise) as SanitizedConfig
})

const deepSelectionQuery = (depth: number): string =>
  `query DeepSelection { root { ${'next {'.repeat(depth)}value${' }'.repeat(depth)} } }`

const generatedAdminQueries = (): string[] => {
  const payload = { config: applicationConfig } as unknown as Payload
  return [
    ...applicationConfig.collections.map((collectionConfig) =>
      documentQuery({ collectionConfig, payload }),
    ),
    ...applicationConfig.globals.map((globalConfig) => documentQuery({ globalConfig, payload })),
  ].flatMap((result) => result?.queries ?? [])
}

const sendQuery = (
  handler: GraphQLHandler,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Response> =>
  handler(
    new Request('https://cms.example.test/api/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/graphql-response+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    }),
  )

const createRecursivePayloadHandler = () => {
  const rootResolver = vi.fn(() => null)
  const nodeType: GraphQLObjectTypeInstance = new graphql.GraphQLObjectType({
    name: 'GraphQLNestingNode',
    fields: () => ({
      next: { type: nodeType },
      value: { type: graphql.GraphQLString },
    }),
  })
  const testConfig = {
    collections: [],
    globals: [],
    graphQL: {
      disableIntrospectionInProduction: false,
      maxComplexity: 1000,
      mutations: () => ({ noop: { type: graphql.GraphQLString } }),
      queries: () => ({ root: { resolve: rootResolver, type: nodeType } }),
      validationRules: () => [],
    },
    localization: false,
  } as unknown as SanitizedConfig
  const { schema, validationRules } = configToSchema(testConfig)
  const payloadValidationRules = validationRules as PayloadValidationRules
  const parseDocument = vi.fn((source: string) => graphql.parse(source))
  const validateDocument = vi.fn(
    (schema: GraphQLSchema, document: DocumentNode, rules: ValidationRule[]) =>
      graphql.validate(schema, document, rules),
  )
  const handler = createFetchHandler({
    context: { req: {} },
    parse: parseDocument,
    schema: schema as GraphQLSchema,
    validate: validateDocument,
    // Match Payload's graphql-http integration: append Payload's rules to the standard rules.
    validationRules: (
      _request: unknown,
      args: { variableValues?: Record<string, unknown> },
      defaultRules: ValidationRule[],
    ) => defaultRules.concat(payloadValidationRules(args)),
  })

  return { handler, parseDocument, rootResolver, testConfig, validateDocument }
}

describe('GraphQL query nesting preflight', () => {
  it.each([2500, 4000])(
    'reproduces GraphQL.js parser stack exhaustion at %i nested fields before validation',
    async (depth) => {
      const { handler, parseDocument, rootResolver, validateDocument } =
        createRecursivePayloadHandler()

      const response = await sendQuery(handler, deepSelectionQuery(depth))
      const body = (await response.json()) as GraphQLResponse

      expect(response.status).toBe(400)
      expect(body.errors?.[0]?.message).toBe('Maximum call stack size exceeded')
      expect(parseDocument).toHaveBeenCalledTimes(1)
      expect(validateDocument).not.toHaveBeenCalled()
      expect(rootResolver).not.toHaveBeenCalled()
    },
  )

  it('reproduces GraphQL.js parser stack exhaustion at 1500 nested input objects before validation', async () => {
    const { handler, parseDocument, rootResolver, validateDocument } =
      createRecursivePayloadHandler()
    const depth = 1500
    const query = `query DeepObject { root(value: ${'{value:'.repeat(depth)} null ${'}'.repeat(depth)}) }`
    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse

    expect(response.status).toBe(400)
    expect(body.errors?.[0]?.message).toBe('Maximum call stack size exceeded')
    expect(parseDocument).toHaveBeenCalledTimes(1)
    expect(validateDocument).not.toHaveBeenCalled()
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it.each([
    [2500, 'application/graphql-response+json', 'application/graphql-response+json; charset=utf-8'],
    [4000, 'application/json', 'application/json; charset=utf-8'],
  ])(
    'returns a controlled client error before parsing a %i-level selection',
    async (depth, accept, responseContentType) => {
      const { handler, parseDocument, rootResolver, testConfig, validateDocument } =
        createRecursivePayloadHandler()
      const allowedCorsConfig = {
        ...testConfig,
        cors: [testCorsOrigin],
      } as unknown as SanitizedConfig
      const limitedHandler = withGraphQLQueryNestingLimit(allowedCorsConfig, handler)
      const response = await limitedHandler(
        new Request('https://cms.example.test/api/graphql', {
          method: 'POST',
          headers: {
            Accept: accept,
            'Content-Type': 'application/json; charset=UTF-8',
            Origin: testCorsOrigin,
          },
          body: JSON.stringify({ query: deepSelectionQuery(depth) }),
        }),
      )
      const body = (await response.json()) as GraphQLResponse

      expect(response.status).toBe(400)
      expect(body.errors?.[0]?.message).toContain(
        `maximum supported nesting of ${MAX_GRAPHQL_QUERY_NESTING}`,
      )
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-type')).toBe(responseContentType)
      expect(response.headers.get('access-control-allow-origin')).toBe(testCorsOrigin)
      expect(parseDocument).not.toHaveBeenCalled()
      expect(validateDocument).not.toHaveBeenCalled()
      expect(rootResolver).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      'nested input objects',
      `query { root(value: ${'{value:'.repeat(MAX_GRAPHQL_QUERY_NESTING - 1)} null ${'}'.repeat(MAX_GRAPHQL_QUERY_NESTING - 1)}) }`,
    ],
    [
      'nested list values',
      `query { root(value: ${'['.repeat(MAX_GRAPHQL_QUERY_NESTING - 1)} null ${']'.repeat(MAX_GRAPHQL_QUERY_NESTING - 1)}) }`,
    ],
  ])('rejects %s before invoking GraphQL.js parsing', async (_description, query) => {
    const { handler, parseDocument, rootResolver, testConfig, validateDocument } =
      createRecursivePayloadHandler()
    const limitedHandler = withGraphQLQueryNestingLimit(testConfig, handler)
    const response = await limitedHandler(
      new Request('https://cms.example.test/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    )
    const result = (await response.json()) as GraphQLResponse

    expect(measureGraphQLQueryNesting(query)).toBeGreaterThan(MAX_GRAPHQL_QUERY_NESTING)
    expect(response.status).toBe(400)
    expect(result.errors?.[0]?.message).toContain('maximum supported nesting')
    expect(parseDocument).not.toHaveBeenCalled()
    expect(validateDocument).not.toHaveBeenCalled()
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', '{"query":', 'Unparsable JSON body'],
    [
      'a non-string query parameter',
      JSON.stringify({ query: { text: 'query { root }' } }),
      'Invalid query',
    ],
    ['a missing query parameter', JSON.stringify({ variables: {} }), 'Missing query'],
  ])('preserves graphql-http handling for %s envelopes', async (_description, body, message) => {
    const { handler, parseDocument, rootResolver, testConfig, validateDocument } =
      createRecursivePayloadHandler()
    const limitedHandler = withGraphQLQueryNestingLimit(testConfig, handler)
    const response = await limitedHandler(
      new Request('https://cms.example.test/api/graphql', {
        method: 'POST',
        headers: {
          Accept: 'application/graphql-response+json',
          'Content-Type': 'application/json',
        },
        body,
      }),
    )
    const result = (await response.json()) as GraphQLResponse

    expect(response.status).toBe(400)
    expect(result.errors?.[0]?.message).toBe(message)
    expect(parseDocument).not.toHaveBeenCalled()
    expect(validateDocument).not.toHaveBeenCalled()
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it.each([
    ['application/graphql', deepSelectionQuery(2500)],
    ['application/x-www-form-urlencoded', `query=${encodeURIComponent(deepSelectionQuery(2500))}`],
    ['multipart/form-data; boundary=graphql-test', 'not a JSON GraphQL request'],
    ['application/json; charset=utf-16', JSON.stringify({ query: deepSelectionQuery(2500) })],
  ])('leaves unsupported POST format %s to graphql-http', async (contentType, body) => {
    const { handler, parseDocument, rootResolver, testConfig, validateDocument } =
      createRecursivePayloadHandler()
    const limitedHandler = withGraphQLQueryNestingLimit(testConfig, handler)
    const response = await limitedHandler(
      new Request('https://cms.example.test/api/graphql', {
        method: 'POST',
        headers: {
          Accept: 'application/graphql-response+json',
          'Content-Type': contentType,
        },
        body,
      }),
    )

    expect(response.status).toBe(415)
    expect(parseDocument).not.toHaveBeenCalled()
    expect(validateDocument).not.toHaveBeenCalled()
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('preserves graphql-http 406 negotiation for an unacceptable response media type', async () => {
    const { handler, parseDocument, rootResolver, testConfig, validateDocument } =
      createRecursivePayloadHandler()
    const limitedHandler = withGraphQLQueryNestingLimit(testConfig, handler)
    const response = await limitedHandler(
      new Request('https://cms.example.test/api/graphql', {
        method: 'POST',
        headers: { Accept: 'text/html', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: deepSelectionQuery(2500) }),
      }),
    )

    expect(response.status).toBe(406)
    expect(parseDocument).not.toHaveBeenCalled()
    expect(validateDocument).not.toHaveBeenCalled()
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('allows an operation at the current complexity boundary and its matching nesting boundary', async () => {
    const { handler, rootResolver, testConfig } = createRecursivePayloadHandler()
    const limitedHandler = withGraphQLQueryNestingLimit(testConfig, handler)
    // The two outer selection sets plus 998 `next` fields make 1000 nested delimiters.
    const query = deepSelectionQuery(MAX_GRAPHQL_QUERY_NESTING - 2)
    expect(measureGraphQLQueryNesting(query)).toBe(MAX_GRAPHQL_QUERY_NESTING)
    const response = await limitedHandler(
      new Request('https://cms.example.test/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { root: null } })
    expect(rootResolver).toHaveBeenCalledTimes(1)
  })

  it('does not count braces inside GraphQL strings or comments as nesting', async () => {
    const downstream = vi.fn(async () => new Response('delegated', { status: 200 }))
    const limitedHandler = withGraphQLQueryNestingLimit(configWithoutCors, downstream)
    const braces = '{'.repeat(MAX_GRAPHQL_QUERY_NESTING + 1)
    const query = `query Safe { field(text: "${braces}") } # ${braces}`

    const response = await sendQuery(limitedHandler, query)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('delegated')
    expect(downstream).toHaveBeenCalledTimes(1)
  })

  it('keeps all generated Admin GraphQL documents within the measured nesting ceiling', () => {
    const queries = generatedAdminQueries()
    const measuredNesting = queries.map(measureGraphQLQueryNesting)

    const validNesting = measuredNesting.filter((nesting): nesting is number => nesting !== null)
    expect(queries.length).toBeGreaterThan(0)
    expect(validNesting).toHaveLength(queries.length)

    const maximumNesting = Math.max(...validNesting)
    expect(maximumNesting).toBe(15)
    expect(maximumNesting).toBeLessThan(MAX_GRAPHQL_QUERY_NESTING)
  })

  it('allows a deeply nested generated Payload Admin query through standard validation', async () => {
    const payload = { config: applicationConfig } as unknown as Payload
    const articles = applicationConfig.collections.find(({ slug }) => slug === 'articles')
    expect(articles).toBeDefined()
    if (!articles)
      throw new Error('The Payload Admin query contract requires the articles collection.')

    const adminDocument = documentQuery({ collectionConfig: articles, payload })
    expect(adminDocument).not.toBeNull()
    if (!adminDocument) throw new Error('Could not generate the Articles Admin GraphQL query.')

    const query = adminDocument.queries[MAX_GRAPHQL_DEPTH]
    const document = graphql.parse(query)
    let selectionDepth = 0
    graphql.visit(document, {
      SelectionSet(_node, _key, _parent, _path, ancestors) {
        selectionDepth = Math.max(
          selectionDepth,
          1 +
            ancestors.filter(
              (ancestor) =>
                ancestor &&
                typeof ancestor === 'object' &&
                'kind' in ancestor &&
                ancestor.kind === 'SelectionSet',
            ).length,
        )
      },
    })
    expect(selectionDepth).toBeGreaterThan(MAX_GRAPHQL_DEPTH)
    expect(selectionDepth).toBeLessThan(MAX_GRAPHQL_QUERY_NESTING)

    const { schema, validationRules } = configToSchema(applicationConfig)
    const payloadValidationRules = validationRules as PayloadValidationRules
    const execute = vi.fn(() => ({ data: null }))
    const handler = createFetchHandler({
      context: { req: {} },
      execute,
      schema: schema as GraphQLSchema,
      validationRules: (
        _request: unknown,
        args: { variableValues?: Record<string, unknown> },
        defaultRules: ValidationRule[],
      ) => defaultRules.concat(payloadValidationRules(args)),
    })
    const limitedHandler = withGraphQLQueryNestingLimit(applicationConfig, handler)
    const response = await sendQuery(limitedHandler, query, { id: 1 })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
