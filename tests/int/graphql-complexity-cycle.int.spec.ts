// @vitest-environment node
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { configToSchema } from '@payloadcms/graphql'
import type { GraphQLObjectType as GraphQLObjectTypeInstance } from 'graphql'
import type { GraphQLSchema, ValidationRule } from 'graphql'
import type { SanitizedConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'

const projectRequire = createRequire(resolve(process.cwd(), 'package.json'))
// Reuse the GraphQL peer loaded by Payload's external Node modules instead of Vite's ESM copy.
const payloadGraphQLRequire = createRequire(projectRequire.resolve('@payloadcms/graphql'))
const { GraphQLObjectType, GraphQLString } = payloadGraphQLRequire(
  'graphql',
) as typeof import('graphql')
const payloadNextRequire = createRequire(projectRequire.resolve('@payloadcms/next/routes'))
const createFetchHandler = payloadNextRequire('graphql-http/lib/use/fetch').createHandler as (
  options: Record<string, unknown>,
) => GraphQLHandler

type GraphQLHandler = (request: Request) => Promise<Response>
type PayloadValidationRules = (args: {
  variableValues?: Record<string, unknown>
}) => ValidationRule[]
type GraphQLResponse = {
  data?: { root?: { next?: { value?: string | null } | null; value?: string | null } }
  errors?: Array<{ message: string }>
}

const createPayloadGraphQLHandler = (
  maxComplexity = 1000,
  trackValueComplexity = false,
  typeName = 'GraphQLComplexityNode',
) => {
  const rootResolver = vi.fn(() => ({
    next: { next: null, value: 'nested' },
    value: 'root',
  }))
  const valueComplexityEstimator = vi.fn(() => 1)
  const nodeType: GraphQLObjectTypeInstance = new GraphQLObjectType({
    name: typeName,
    fields: () => ({
      next: { type: nodeType },
      value: {
        type: GraphQLString,
        ...(trackValueComplexity ? { extensions: { complexity: valueComplexityEstimator } } : {}),
      },
    }),
  })

  const config = {
    collections: [],
    globals: [],
    graphQL: {
      disableIntrospectionInProduction: false,
      maxComplexity,
      mutations: () => ({
        noop: { type: GraphQLString },
      }),
      queries: () => ({
        root: {
          resolve: rootResolver,
          type: nodeType,
        },
      }),
      validationRules: () => [],
    },
    localization: false,
  } as unknown as SanitizedConfig
  const { schema, validationRules } = configToSchema(config)
  const payloadValidationRules = validationRules as PayloadValidationRules
  const handler = createFetchHandler({
    context: { req: {} },
    schema: schema as GraphQLSchema,
    // Match Payload's graphql-http integration: append Payload's rules to the standard rules.
    validationRules: (
      _request: unknown,
      args: { variableValues?: Record<string, unknown> },
      defaultRules: ValidationRule[],
    ) => defaultRules.concat(payloadValidationRules(args)),
  })

  return { handler, rootResolver, valueComplexityEstimator }
}

const sendQuery = async (
  handler: GraphQLHandler,
  query: string,
  operationName?: string,
): Promise<Response> =>
  handler(
    new Request('https://cms.example.test/api/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/graphql-response+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operationName, query }),
    }),
  )

const repeatedValueSelection = (count: number): string => Array(count).fill('value').join(' ')

const fragmentChainQuery = (
  fragmentCount: number,
  typeName = 'GraphQLComplexityNode',
  operationName = 'FragmentChain',
): string => {
  const fragments = Array.from({ length: fragmentCount }, (_, index) => {
    const selection = index === fragmentCount - 1 ? 'value' : `...F${index + 1}`
    return `fragment F${index} on ${typeName} { ${selection} }`
  })
  return `query ${operationName} { root { ...F0 } }\n${fragments.join('\n')}`
}

const cyclicDocuments = [
  {
    label: 'direct',
    query: `
      query DirectCycle { root { ...CycleA } }
      fragment CycleA on GraphQLComplexityNode { value ...CycleA }
    `,
  },
  {
    label: 'indirect',
    query: `
      query IndirectCycle { root { ...CycleA } }
      fragment CycleA on GraphQLComplexityNode { value ...CycleB }
      fragment CycleB on GraphQLComplexityNode { value ...CycleA }
    `,
  },
  {
    label: 'longer cycle traversing nested fields',
    query: `
      query LongerCycle { root { ...CycleA } }
      fragment CycleA on GraphQLComplexityNode { next { ...CycleB } }
      fragment CycleB on GraphQLComplexityNode { next { ...CycleC } }
      fragment CycleC on GraphQLComplexityNode { value ...CycleA }
    `,
  },
]

describe('Payload GraphQL complexity and fragment-cycle contract', () => {
  it.each(cyclicDocuments)(
    'returns a controlled validation error for a $label fragment cycle without invoking resolvers',
    async ({ query }) => {
      const { handler, rootResolver } = createPayloadGraphQLHandler()

      const response = await sendQuery(handler, query)
      const body = (await response.json()) as GraphQLResponse

      expect(response.status).toBe(400)
      expect(body.errors?.map(({ message }) => message).join('\n')).toContain(
        'Cannot spread fragment',
      )
      expect(body.errors?.some(({ message }) => message.includes('Maximum call stack size'))).toBe(
        false,
      )
      expect(rootResolver).not.toHaveBeenCalled()
    },
  )

  it('accepts valid nested fragments and counts a reused fragment at each spread', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler()
    const query = `
      query NestedAndReusedFragments {
        root {
          ...Nested
          ...Reusable
          ...Reusable
          ... on GraphQLComplexityNode { value }
        }
      }
      fragment Nested on GraphQLComplexityNode { next { ...Leaf } }
      fragment Leaf on GraphQLComplexityNode { value }
      fragment Reusable on GraphQLComplexityNode { value }
    `

    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse

    expect(response.status).toBe(200)
    expect(body).toEqual({
      data: {
        root: {
          next: { value: 'nested' },
          value: 'root',
        },
      },
    })
    expect(rootResolver).toHaveBeenCalledTimes(1)
  })

  it.each([63, 64])(
    'accepts a reachable fragment chain of %i spreads without changing complexity or resolution',
    async (fragmentDepth) => {
      const { handler, rootResolver } = createPayloadGraphQLHandler()
      const response = await sendQuery(handler, fragmentChainQuery(fragmentDepth))
      const body = (await response.json()) as GraphQLResponse

      expect(response.status).toBe(200)
      expect(body).toEqual({ data: { root: { value: 'root' } } })
      expect(rootResolver).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects an acyclic fragment chain above the independent depth bound before resolution', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler()
    const response = await sendQuery(handler, fragmentChainQuery(65))
    const body = (await response.json()) as GraphQLResponse
    const errorMessages = body.errors?.map(({ message }) => message).join(' ')

    expect(response.status).toBe(400)
    expect(errorMessages).toContain('maximum depth of 64 spreads')
    expect(errorMessages).not.toContain('Maximum call stack size')
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('applies the depth bound to a previously memoized fragment reused under a deeper parent', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler()
    const query = `${fragmentChainQuery(64).replace(
      'root { ...F0 }',
      'root { ...F0 ...Wrapper }',
    )}\nfragment Wrapper on GraphQLComplexityNode { ...F0 }`

    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse

    expect(response.status).toBe(400)
    expect(body.errors?.map(({ message }) => message).join(' ')).toContain(
      'maximum depth of 64 spreads',
    )
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('returns a controlled validation error for the 1,500-fragment, roughly 53 KB chain', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler(1000, false, 'Node')
    const query = fragmentChainQuery(1500, 'Node', 'Q')
    const requestBodyBytes = Buffer.byteLength(JSON.stringify({ query }))

    expect(requestBodyBytes).toBe(53_318)

    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse
    const errorMessages = body.errors?.map(({ message }) => message).join(' ')

    expect(response.status).toBe(400)
    expect(errorMessages).toContain('maximum depth of 64 spreads')
    expect(errorMessages).not.toContain('Maximum call stack size')
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('caps total reachable selection traversal work independently of depth and complexity', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler(1000, false, 'Node')
    const fragmentCount = 2048
    const spreadSelections = Array.from(
      { length: fragmentCount },
      (_, index) => `...F${index}`,
    ).join(' ')
    const fragments = Array.from(
      { length: fragmentCount },
      (_, index) => `fragment F${index} on Node { value${index}: value @skip(if: true) }`,
    ).join('\n')
    const query = `query WideTraversal { root { ${spreadSelections} } }\n${fragments}`

    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse
    const errorMessages = body.errors?.map(({ message }) => message).join(' ')

    expect(response.status).toBe(400)
    expect(errorMessages).toContain('maximum work of 4096 reachable selection nodes')
    expect(errorMessages).not.toContain('maximum complexity of 1000')
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('bounds deep field recursion even when the fragment and traversal-work limits are not reached', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler()
    const depth = 1024
    const query = `query DeepFields { root { ${'next { '.repeat(depth)}value${' }'.repeat(depth)} } }`

    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse

    expect(response.status).toBe(400)
    expect(body.errors?.map(({ message }) => message).join(' ')).toContain(
      'maximum depth of 1024 selection sets',
    )
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('memoizes acyclic fragment costs but charges every spread toward the existing threshold', async () => {
    const { handler, rootResolver, valueComplexityEstimator } = createPayloadGraphQLHandler(
      1000,
      true,
    )
    const doublingLevels = 15
    const fragments = Array.from({ length: doublingLevels + 1 }, (_, level) => {
      const selections = level === 0 ? 'value' : `...Fragment${level - 1} ...Fragment${level - 1}`
      return `fragment Fragment${level} on GraphQLComplexityNode { ${selections} }`
    })
    const query = `
      query RepeatedAcyclicFragments { root { ...Fragment${doublingLevels} } }
      ${fragments.join(' ')}
    `

    const response = await sendQuery(handler, query)
    const body = (await response.json()) as GraphQLResponse
    const errorMessages = body.errors?.map(({ message }) => message).join(' ')

    expect(response.status).toBe(400)
    expect(errorMessages).toContain('maximum complexity of 1000')
    expect(errorMessages).toContain('Actual complexity is 32769')
    expect(valueComplexityEstimator).toHaveBeenCalledTimes(1)
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('recomputes memoized fragment costs for each operation variable set', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler(3)
    const query = `
      query IncludeValue($include: Boolean! = true, $skip: Boolean! = false) {
        root { ...SharedValue }
      }
      query SkipValue($include: Boolean! = false, $skip: Boolean! = true) {
        root { ...SharedValue }
      }
      fragment SharedValue on GraphQLComplexityNode {
        value @include(if: $include) @skip(if: $skip)
      }
    `

    const response = await sendQuery(handler, query, 'IncludeValue')
    const body = (await response.json()) as GraphQLResponse

    expect(response.status).toBe(200)
    expect(body).toEqual({ data: { root: { value: 'root' } } })
    expect(rootResolver).toHaveBeenCalledTimes(1)
  })

  it('keeps the 1000 complexity threshold inclusive and rejects the next unit before execution', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler(1000)

    const atThreshold = await sendQuery(
      handler,
      `query AtThreshold { root { ${repeatedValueSelection(999)} } }`,
    )

    expect(atThreshold.status).toBe(200)
    expect(rootResolver).toHaveBeenCalledTimes(1)
    rootResolver.mockClear()

    const overThreshold = await sendQuery(
      handler,
      `query OverThreshold { root { ${repeatedValueSelection(1000)} } }`,
    )
    const body = (await overThreshold.json()) as GraphQLResponse

    expect(overThreshold.status).toBe(400)
    expect(body.errors?.map(({ message }) => message).join('\n')).toContain(
      'maximum complexity of 1000',
    )
    expect(rootResolver).not.toHaveBeenCalled()
  })

  it('preserves all-operation complexity accounting for a selected cheap operation and an unused expensive one', async () => {
    const { handler, rootResolver } = createPayloadGraphQLHandler()
    const query = `
      query SelectedCheap { root { value } }
      query UnusedExpensive { root { ${repeatedValueSelection(1000)} } }
    `

    const response = await sendQuery(handler, query, 'SelectedCheap')
    const body = (await response.json()) as GraphQLResponse

    // Payload 3.90.2 does not pass operationName into its complexity rule, so changing this
    // behavior is intentionally outside this fragment-complexity hardening increment.
    expect(response.status).toBe(400)
    expect(body.errors?.map(({ message }) => message).join('\n')).toContain(
      'maximum complexity of 1000',
    )
    expect(rootResolver).not.toHaveBeenCalled()
  })
})
