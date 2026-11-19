// @vitest-environment node
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { configToSchema } from '@payloadcms/graphql'
import { GraphQL } from '@payloadcms/graphql/types'
import type {
  ExecutionArgs,
  GraphQLFieldResolver,
  GraphQLObjectType as GraphQLObjectTypeInstance,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLSchema,
  ValidationRule,
} from 'graphql'
import type { Payload, SanitizedConfig } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import configPromise from '@payload-config'
import { createGraphQLListLimitRule, MAX_GRAPHQL_LIST_LIMIT } from '@/auth/graphqlListLimit'
import { documentQuery, MAX_GRAPHQL_DEPTH } from '@/components/admin/views/GraphQL/query'

const projectRequire = createRequire(resolve(process.cwd(), 'package.json'))
const payloadNextRequire = createRequire(projectRequire.resolve('@payloadcms/next/routes'))
const createFetchHandler = payloadNextRequire('graphql-http/lib/use/fetch').createHandler as (
  options: Record<string, unknown>,
) => GraphQLHandler

type GraphQLHandler = (request: Request) => Promise<Response>
type PayloadValidationRules = (args: ExecutionArgs) => ValidationRule[]
type PaginatedResult = {
  docs: Array<{ id: number }>
  hasNextPage: boolean
  hasPrevPage: boolean
  limit: number
  nextPage: number | null
  offset: number | null
  page: number
  pagingCounter: number
  prevPage: number | null
  totalDocs: number
  totalPages: number
}
type Context = {
  req: Record<string, unknown> & {
    payload?: Record<string, unknown>
    query?: Record<string, unknown>
  }
}
type Resolver = (
  parent: unknown,
  args: Record<string, unknown>,
  context: Context,
  info: GraphQLResolveInfo,
) => unknown | Promise<unknown>
type CollectionFieldResolver = GraphQLFieldResolver<
  unknown,
  unknown,
  Record<string, unknown>,
  PaginatedResult
>
type FindResult = { docs: Array<{ id: number }>; totalDocs: number }
type FindArgs = Record<string, unknown>
type FindMock = (args: FindArgs) => Promise<FindResult>
type CountMock = (args: FindArgs) => Promise<{ totalDocs: number }>
type JoinArgs = {
  args: Record<string, unknown>
  typeName: string
  fieldName: string
  find: Mock<FindMock>
  count: Mock<CountMock>
}
type AdminQuery = { field: string; idType?: string; query: string }

let applicationConfig: SanitizedConfig
let schema: GraphQLSchema
let payloadValidationRules: PayloadValidationRules
let articlesResolver: Mock<CollectionFieldResolver>
let skillsResolver: Mock<CollectionFieldResolver>
let versionsResolver: Mock<CollectionFieldResolver>

const pageResult = (docs: PaginatedResult['docs'] = []): PaginatedResult => ({
  docs,
  hasNextPage: false,
  hasPrevPage: false,
  limit: 10,
  nextPage: null,
  offset: null,
  page: 1,
  pagingCounter: docs.length === 0 ? 0 : 1,
  prevPage: null,
  totalDocs: docs.length,
  totalPages: docs.length === 0 ? 0 : 1,
})

const createHandler = (context: unknown = { req: {} }): GraphQLHandler =>
  createFetchHandler({
    context,
    schema,
    validationRules: (_request: unknown, args: ExecutionArgs, defaultRules: ValidationRule[]) =>
      defaultRules.concat(payloadValidationRules(args), createGraphQLListLimitRule(args)),
  })

const sendQuery = (
  handler: GraphQLHandler,
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string,
): Promise<Response> =>
  handler(
    new Request('https://cms.example.test/api/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/graphql-response+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operationName, query, variables }),
    }),
  )

const callJoinResolver = async ({
  args,
  typeName,
  fieldName,
  find,
  count,
}: JoinArgs): Promise<Record<string, unknown>> => {
  const type = schema.getType(typeName) as unknown as GraphQLObjectTypeInstance
  const field = type.getFields()[fieldName]
  if (!field || typeof field.resolve !== 'function') {
    throw new Error(`Expected join resolver ${typeName}.${fieldName}`)
  }

  const resolve = field.resolve as Resolver
  const payload = { count, find } as unknown as Record<string, unknown>
  return (await resolve(
    { id: 9 },
    args,
    { req: { payload, query: {} } },
    {} as GraphQLResolveInfo,
  )) as Record<string, unknown>
}

const executionArgsFor = (
  query: string,
  variableValues: Record<string, unknown> = {},
): ExecutionArgs => {
  const document = GraphQL.parse(query)
  const operation = GraphQL.getOperationAST(document)
  return {
    document,
    operationName: operation?.name?.value,
    schema,
    variableValues,
  }
}

const validateWithListLimit = (
  query: string,
  variableValues: Record<string, unknown> = {},
): readonly GraphQL.GraphQLError[] => {
  const args = executionArgsFor(query, variableValues)
  return GraphQL.validate(schema, args.document, [
    ...GraphQL.specifiedRules,
    ...payloadValidationRules(args),
    createGraphQLListLimitRule(args),
  ])
}

const unwrapNonNull = (type: GraphQLOutputType): GraphQLOutputType =>
  GraphQL.isNonNullType(type) ? unwrapNonNull(type.ofType) : type

const allAdminDocumentQueries = (): AdminQuery[] => {
  const payload = { config: applicationConfig } as unknown as Payload
  return [
    ...applicationConfig.collections.map((collectionConfig) =>
      documentQuery({ collectionConfig, payload }),
    ),
    ...applicationConfig.globals.map((globalConfig) => documentQuery({ globalConfig, payload })),
  ].flatMap(
    (document) =>
      document?.queries.map((query) => ({
        field: document.field,
        idType: document.idType,
        query,
      })) ?? [],
  )
}

const validateAdminDocument = ({ idType, query }: AdminQuery): readonly GraphQL.GraphQLError[] => {
  const document = GraphQL.parse(query)
  const operation = GraphQL.getOperationAST(document)
  const args: ExecutionArgs = {
    document,
    operationName: operation?.name?.value,
    schema,
    variableValues: idType ? { id: idType.startsWith('String') ? 'admin-document' : 1 } : {},
  }
  return GraphQL.validate(schema, document, [
    ...GraphQL.specifiedRules,
    ...payloadValidationRules(args),
    createGraphQLListLimitRule(args),
  ])
}

beforeAll(async () => {
  applicationConfig = (await configPromise) as SanitizedConfig
  const result = configToSchema(applicationConfig)
  schema = result.schema as unknown as GraphQLSchema
  payloadValidationRules = result.validationRules as PayloadValidationRules

  const queryFields = schema.getQueryType()?.getFields()
  if (!queryFields?.Articles || !queryFields.Skills || !queryFields.versionsArticles) {
    throw new Error('Expected generated Articles, Skills, and versionsArticles collection queries')
  }

  articlesResolver = vi.fn<CollectionFieldResolver>(() => pageResult())
  skillsResolver = vi.fn<CollectionFieldResolver>(() => pageResult([{ id: 1 }]))
  versionsResolver = vi.fn<CollectionFieldResolver>(() => pageResult())
  queryFields.Articles.resolve = articlesResolver
  queryFields.Skills.resolve = skillsResolver
  queryFields.versionsArticles.resolve = versionsResolver
})

beforeEach(() => {
  articlesResolver.mockReset().mockImplementation(() => pageResult())
  skillsResolver.mockReset().mockImplementation(() => pageResult([{ id: 1 }]))
  versionsResolver.mockReset().mockImplementation(() => pageResult())
})

describe('GraphQL collection list limit contract', () => {
  it('uses a maximum aligned with Payload Admin per-page options and the configured 100-message join default', () => {
    expect(MAX_GRAPHQL_LIST_LIMIT).toBe(100)
  })

  it.each([
    {
      name: 'omitted limit (Payload default)',
      query: '{ Articles { docs { id } } }',
      limit: undefined,
    },
    {
      name: 'pagination enabled with an omitted limit',
      query: '{ Articles(pagination: true) { docs { id } } }',
      limit: undefined,
    },
    {
      name: 'positive limit below maximum',
      query: '{ Articles(limit: 25) { docs { id } } }',
      limit: 25,
    },
    {
      name: 'maximum limit',
      query: `{ Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT}) { docs { id } } }`,
      limit: MAX_GRAPHQL_LIST_LIMIT,
    },
    {
      name: 'bounded pagination-disabled request',
      query: '{ Articles(limit: 25, pagination: false) { docs { id } } }',
      limit: 25,
    },
    {
      name: 'maximum pagination-disabled request',
      query: `{ Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT}, pagination: false) { docs { id } } }`,
      limit: MAX_GRAPHQL_LIST_LIMIT,
    },
    {
      name: 'explicit null uses the Payload default',
      query: '{ Articles(limit: null) { docs { id } } }',
      limit: null,
    },
  ])('allows $name without changing Payload resolver arguments', async ({ query, limit }) => {
    const response = await sendQuery(createHandler(), query)

    expect(response.status).toBe(200)
    expect(articlesResolver).toHaveBeenCalledTimes(1)
    const resolverArgs = articlesResolver.mock.calls[0]?.[1]
    if (limit === undefined) {
      expect(Object.hasOwn(resolverArgs ?? {}, 'limit')).toBe(false)
    } else {
      expect(resolverArgs?.limit).toBe(limit)
    }
  })

  it.each([
    ['omitted pagination and limit', '', undefined, undefined],
    ['pagination:true with an omitted limit', '(pagination: true)', undefined, true],
    ['pagination:false with a positive limit', '(pagination: false, limit: 25)', 25, false],
  ])('preserves Version-list behavior for %s', async (_name, args, limit, pagination) => {
    const response = await sendQuery(createHandler(), `{ versionsArticles${args} { docs { id } } }`)

    expect(response.status).toBe(200)
    expect(versionsResolver).toHaveBeenCalledTimes(1)
    const resolverArgs = versionsResolver.mock.calls[0]?.[1]
    if (limit === undefined) {
      expect(Object.hasOwn(resolverArgs ?? {}, 'limit')).toBe(false)
    } else {
      expect(resolverArgs?.limit).toBe(limit)
    }
    if (pagination === undefined) {
      expect(Object.hasOwn(resolverArgs ?? {}, 'pagination')).toBe(false)
    } else {
      expect(resolverArgs?.pagination).toBe(pagination)
    }
  })

  it.each([
    ['zero', '{ Articles(limit: 0) { docs { id } } }'],
    ['negative', '{ Articles(limit: -1) { docs { id } } }'],
    ['above the maximum', `{ Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { id } } }`],
    [
      'above maximum with page and sort',
      `{ Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}, page: 1, sort: "id") { docs { id } } }`,
    ],
    ['pagination:false without a limit', '{ Articles(pagination: false) { docs { id } } }'],
    [
      'pagination:false with a null limit',
      '{ Articles(limit: null, pagination: false) { docs { id } } }',
    ],
    [
      'pagination:false with a zero limit',
      '{ Articles(limit: 0, pagination: false) { docs { id } } }',
    ],
  ])('rejects %s before invoking the collection resolver', async (_name, query) => {
    const response = await sendQuery(createHandler(), query)
    const body = (await response.json()) as { errors?: Array<{ message: string }> }

    expect(response.status).toBe(400)
    expect(body.errors?.some(({ message }) => /limit|pagination/i.test(message))).toBe(true)
    expect(articlesResolver).not.toHaveBeenCalled()
  })

  it('rejects aliases with an excessive limit', async () => {
    const response = await sendQuery(
      createHandler(),
      `{ unsafe: Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { id } } }`,
    )

    expect(response.status).toBe(400)
    expect(articlesResolver).not.toHaveBeenCalled()
  })

  it.each([
    { rootName: 'Collection', fieldName: 'Articles', resolver: () => articlesResolver },
    { rootName: 'Version', fieldName: 'versionsArticles', resolver: () => versionsResolver },
  ])(
    'rejects explicit null pagination for $rootName roots with omitted, null, and positive limits',
    async ({ fieldName, resolver }) => {
      const cases = [
        ['omitted limit', 'pagination: null'],
        ['null limit', 'pagination: null, limit: null'],
        ['positive limit', 'pagination: null, limit: 25'],
      ] as const

      for (const [caseName, args] of cases) {
        const response = await sendQuery(
          createHandler(),
          `{ ${fieldName}(${args}) { docs { id } } }`,
        )
        const body = (await response.json()) as { errors?: Array<{ message: string }> }

        expect(response.status, `${fieldName} with ${caseName}`).toBe(400)
        expect(
          body.errors?.some(({ message }) => message.includes('explicit null is not allowed')),
          `${fieldName} with ${caseName}`,
        ).toBe(true)
        expect(resolver(), `${fieldName} with ${caseName}`).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    { rootName: 'Collection', fieldName: 'Articles', resolver: () => articlesResolver },
    { rootName: 'Version', fieldName: 'versionsArticles', resolver: () => versionsResolver },
  ])(
    'rejects runtime-null variables and null defaults for $rootName pagination',
    async ({ fieldName, resolver }) => {
      const runtimeNullQuery = `query RuntimeNull($pagination: Boolean) {
        ${fieldName}(pagination: $pagination) { docs { id } }
      }`
      const runtimeNull = await sendQuery(createHandler(), runtimeNullQuery, { pagination: null })
      const runtimeNullBody = (await runtimeNull.json()) as {
        errors?: Array<{ message: string }>
      }

      expect(runtimeNull.status).toBe(400)
      expect(runtimeNullBody.errors?.[0]?.message).toContain('explicit null is not allowed')
      expect(resolver()).not.toHaveBeenCalled()

      const nullDefaultQuery = `query NullDefault($pagination: Boolean = null) {
        ${fieldName}(pagination: $pagination) { docs { id } }
      }`
      const nullDefault = await sendQuery(createHandler(), nullDefaultQuery)
      const nullDefaultBody = (await nullDefault.json()) as {
        errors?: Array<{ message: string }>
      }

      expect(nullDefault.status).toBe(400)
      expect(nullDefaultBody.errors?.[0]?.message).toContain('explicit null is not allowed')
      expect(resolver()).not.toHaveBeenCalled()
    },
  )

  it('rejects explicit null pagination through aliases and reachable fragments', async () => {
    const handler = createHandler()
    const aliased = await sendQuery(
      handler,
      '{ unsafe: Articles(pagination: null) { docs { id } } }',
    )
    const aliasBody = (await aliased.json()) as { errors?: Array<{ message: string }> }
    expect(aliased.status).toBe(400)
    expect(aliasBody.errors?.[0]?.message).toContain('explicit null is not allowed')
    expect(articlesResolver).not.toHaveBeenCalled()

    const fragmented = await sendQuery(
      handler,
      `query FragmentedNull { ...UnsafePagination }
       fragment UnsafePagination on Query {
         Articles(pagination: null) { docs { id } }
       }`,
    )
    const fragmentBody = (await fragmented.json()) as { errors?: Array<{ message: string }> }
    expect(fragmented.status).toBe(400)
    expect(fragmentBody.errors?.[0]?.message).toContain('explicit null is not allowed')
    expect(articlesResolver).not.toHaveBeenCalled()
  })

  it('scopes explicit-null pagination validation to the selected operation and its fragments', async () => {
    const handler = createHandler()
    const query = `
      query Safe { Articles { docs { id } } }
      query NullPagination { ...UnsafePagination }
      fragment UnsafePagination on Query {
        Articles(pagination: null) { docs { id } }
      }
    `

    const safe = await sendQuery(handler, query, undefined, 'Safe')
    expect(safe.status).toBe(200)
    expect(articlesResolver).toHaveBeenCalledTimes(1)
    articlesResolver.mockClear()

    const unsafe = await sendQuery(handler, query, undefined, 'NullPagination')
    const unsafeBody = (await unsafe.json()) as { errors?: Array<{ message: string }> }
    expect(unsafe.status).toBe(400)
    expect(unsafeBody.errors?.[0]?.message).toContain('explicit null is not allowed')
    expect(articlesResolver).not.toHaveBeenCalled()
  })

  it('uses coerced variables and operation defaults for collection limits and pagination', async () => {
    const handler = createHandler()
    const overLimit = await sendQuery(
      handler,
      'query List($limit: Int = 101) { Articles(limit: $limit) { docs { id } } }',
    )
    const overLimitBody = (await overLimit.json()) as { errors?: Array<{ message: string }> }
    expect(overLimit.status).toBe(400)
    expect(overLimitBody.errors?.[0]?.message).toContain('1 and 100')
    expect(articlesResolver).not.toHaveBeenCalled()

    const unboundedPagination = await sendQuery(
      handler,
      'query List($pagination: Boolean = false) { Articles(pagination: $pagination) { docs { id } } }',
    )
    expect(unboundedPagination.status).toBe(400)
    expect(articlesResolver).not.toHaveBeenCalled()

    const allowed = await sendQuery(
      handler,
      'query List($limit: Int, $pagination: Boolean = false) { Articles(limit: $limit, pagination: $pagination) { docs { id } } }',
      { limit: MAX_GRAPHQL_LIST_LIMIT },
    )
    expect(allowed.status).toBe(200)
    expect(articlesResolver).toHaveBeenCalledTimes(1)
    expect(articlesResolver.mock.calls[0]?.[1]).toMatchObject({
      limit: MAX_GRAPHQL_LIST_LIMIT,
      pagination: false,
    })
  })

  it('rejects excessive limits in fragments reachable from the selected operation', async () => {
    const query = `
      query Selected { ...TooLarge }
      fragment TooLarge on Query { Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { id } } }
    `
    const response = await sendQuery(createHandler(), query)

    expect(response.status).toBe(400)
    expect(articlesResolver).not.toHaveBeenCalled()
  })

  it('scopes fragment limit validation to the selected operation', async () => {
    const query = `
      query Safe { Articles { docs { id } } }
      query Unused { ...TooLarge }
      fragment TooLarge on Query { Articles(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { id } } }
    `

    const response = await sendQuery(createHandler(), query, undefined, 'Safe')

    expect(response.status).toBe(200)
    expect(articlesResolver).toHaveBeenCalledTimes(1)
  })

  it('caps every collection and version list root and exposes no alternate page-size argument', () => {
    const queryFields = schema.getQueryType()?.getFields() ?? {}
    const listRoots = Object.entries(queryFields).filter(([, field]) => {
      const resultType = unwrapNonNull(field.type)
      if (!GraphQL.isObjectType(resultType)) return false
      const docsField = resultType.getFields().docs
      return Boolean(docsField && GraphQL.isListType(unwrapNonNull(docsField.type)))
    })

    expect(listRoots.some(([name]) => name === 'Articles')).toBe(true)
    expect(listRoots.some(([name]) => name === 'versionsArticles')).toBe(true)
    expect(listRoots.length).toBeGreaterThan(0)

    for (const [fieldName, field] of listRoots) {
      expect(
        field.args.some(({ name }) => name === 'limit'),
        `${fieldName} has a bounded limit arg`,
      ).toBe(true)
      expect(
        field.args.some(({ name }) => name === 'pagination'),
        `${fieldName} exposes pagination`,
      ).toBe(true)
      expect(
        field.args.some(({ name }) =>
          ['first', 'last', 'offset', 'perPage', 'pageSize', 'take'].includes(name),
        ),
        `${fieldName} has no alternate page-size arg`,
      ).toBe(false)
    }

    const countField = queryFields.countArticles
    expect(countField).toBeDefined()
    expect(countField?.args.some(({ name }) => name === 'limit')).toBe(false)
    expect(
      countField?.args.some(({ name }) => ['first', 'last', 'offset', 'take'].includes(name)),
    ).toBe(false)

    for (const [index, [fieldName]] of listRoots.entries()) {
      const query = `query ExcessiveList${index} { ${fieldName}(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { __typename } } }`
      const limitErrors = validateWithListLimit(query).filter(({ message }) =>
        message.includes('GraphQL list limits'),
      )
      expect(
        limitErrors,
        `${fieldName} must reject a limit over ${MAX_GRAPHQL_LIST_LIMIT}`,
      ).not.toHaveLength(0)

      const nullPaginationQuery = `query NullPagination${index} { ${fieldName}(pagination: null) { docs { __typename } } }`
      const nullPaginationErrors = validateWithListLimit(nullPaginationQuery).filter(
        ({ message }) => message.includes('explicit null is not allowed'),
      )
      expect(
        nullPaginationErrors,
        `${fieldName} must reject explicit null pagination`,
      ).not.toHaveLength(0)
    }
  })

  it('rejects an excessive limit on the alternate versions list field', async () => {
    const response = await sendQuery(
      createHandler(),
      `{ versionsArticles(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { id } } }`,
    )
    const body = (await response.json()) as { errors?: Array<{ message: string }> }

    expect(response.status).toBe(400)
    expect(body.errors?.some(({ message }) => message.includes('GraphQL list limits'))).toBe(true)
  })

  it('adds no list-limit errors to configured Admin document queries at all supported depths', () => {
    const queries = allAdminDocumentQueries()
    expect(queries.length).toBeGreaterThan(MAX_GRAPHQL_DEPTH)
    expect(queries.some(({ query }) => query.includes('relatedProjects'))).toBe(true)

    for (const { field, query, idType } of queries) {
      const errors = validateAdminDocument({ field, query, idType })
      const listLimitErrors = errors.filter(({ message }) =>
        /GraphQL list limits|GraphQL limit: 0|GraphQL pagination: false/.test(message),
      )
      expect(
        listLimitErrors,
        `Admin query for ${field}: ${listLimitErrors.map(({ message }) => message).join('; ')}`,
      ).toEqual([])
    }

    const articles = applicationConfig.collections.find(({ slug }) => slug === 'articles')
    expect(articles).toBeDefined()
    if (!articles)
      throw new Error('Expected the Articles collection for the Admin compatibility check')
    const payload = { config: applicationConfig } as unknown as Payload
    const articleDocument = documentQuery({ collectionConfig: articles, payload })
    const articleQuery = articleDocument?.queries[MAX_GRAPHQL_DEPTH]
    expect(articleQuery).toBeDefined()
    if (!articleQuery || !articleDocument) {
      throw new Error('Expected the deepest generated Articles Admin query')
    }
    expect(
      validateAdminDocument({
        field: 'Article',
        idType: articleDocument.idType,
        query: articleQuery,
      }),
    ).toEqual([])
  })
})

describe('GraphQL join defaults, caps, and count behavior', () => {
  it.each([
    ['Skill.relatedProjects', 'Skill', 'relatedProjects', 10],
    ['Role.members without a configured default', 'Role', 'members', 10],
    ['MailThread.messages', 'MailThread', 'messages', 100],
  ])(
    'uses the configured or safe fallback page size for %s',
    async (_name, typeName, fieldName, expectedLimit) => {
      const find = vi.fn(async (args: FindArgs) => ({
        docs: Array.from({ length: Number(args.limit) }, (_, index) => ({ id: index + 1 })),
        totalDocs: 250,
      }))
      const count = vi.fn(async (_args: FindArgs) => ({ totalDocs: 250 }))

      const result = await callJoinResolver({ args: {}, typeName, fieldName, find, count })

      expect(find).toHaveBeenCalledTimes(1)
      expect(find.mock.calls[0]?.[0]).toMatchObject({
        collection:
          fieldName === 'relatedProjects'
            ? 'projects'
            : fieldName === 'members'
              ? 'users'
              : 'mail-messages',
        limit: expectedLimit + 1,
        pagination: false,
      })
      expect((result.docs as unknown[]).length).toBe(expectedLimit)
      expect(result.hasNextPage).toBe(true)
      expect(result.totalDocs).toBeUndefined()
      expect(count).not.toHaveBeenCalled()
    },
  )

  it('treats defaultLimit as a default, accepts smaller explicit limits, and uses a look-ahead row', async () => {
    const find = vi.fn(async (args: FindArgs) => ({
      docs: Array.from({ length: Number(args.limit) }, (_, index) => ({ id: index + 1 })),
      totalDocs: 250,
    }))
    const count = vi.fn(async (_args: FindArgs) => ({ totalDocs: 250 }))
    const result = await callJoinResolver({
      args: { limit: 4 },
      typeName: 'Skill',
      fieldName: 'relatedProjects',
      find,
      count,
    })

    expect(find.mock.calls[0]?.[0]).toMatchObject({ limit: 5 })
    expect((result.docs as unknown[]).length).toBe(4)
    expect(result.hasNextPage).toBe(true)
  })

  it('allows explicit join limits above that field default up to the maximum', async () => {
    const find = vi.fn(async (args: FindArgs) => ({
      docs: Array.from({ length: Number(args.limit) }, (_, index) => ({ id: index + 1 })),
      totalDocs: 250,
    }))
    const count = vi.fn(async (_args: FindArgs) => ({ totalDocs: 250 }))
    const result = await callJoinResolver({
      args: { limit: MAX_GRAPHQL_LIST_LIMIT },
      typeName: 'Skill',
      fieldName: 'relatedProjects',
      find,
      count,
    })

    expect(find.mock.calls[0]?.[0]).toMatchObject({ limit: MAX_GRAPHQL_LIST_LIMIT + 1 })
    expect((result.docs as unknown[]).length).toBe(MAX_GRAPHQL_LIST_LIMIT)
    expect(result.hasNextPage).toBe(true)
  })

  it('defensively caps a join resolver call above the maximum if validation is bypassed', async () => {
    const find = vi.fn(async (args: FindArgs) => ({
      docs: Array.from({ length: Number(args.limit) }, (_, index) => ({ id: index + 1 })),
      totalDocs: 250,
    }))
    const count = vi.fn(async (_args: FindArgs) => ({ totalDocs: 250 }))
    const result = await callJoinResolver({
      args: { limit: MAX_GRAPHQL_LIST_LIMIT + 1 },
      typeName: 'Skill',
      fieldName: 'relatedProjects',
      find,
      count,
    })

    expect(find.mock.calls[0]?.[0]).toMatchObject({ limit: MAX_GRAPHQL_LIST_LIMIT + 1 })
    expect((result.docs as unknown[]).length).toBe(MAX_GRAPHQL_LIST_LIMIT)
    expect(result.hasNextPage).toBe(true)
  })

  it('rejects excessive nested join limits before invoking the parent collection resolver', async () => {
    const response = await sendQuery(
      createHandler(),
      `{ Skills { docs { relatedProjects(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs { id } } } } }`,
    )

    expect(response.status).toBe(400)
    expect(skillsResolver).not.toHaveBeenCalled()
  })

  it('preserves count-only join behavior for limit:0 and returns the exact count', async () => {
    const count = vi.fn(async (_args: FindArgs) => ({ totalDocs: 37 }))
    const find = vi.fn(async (_args: FindArgs) => ({ docs: [], totalDocs: 0 }))
    const handler = createHandler({ req: { payload: { count, find }, query: {} } })
    const response = await sendQuery(
      handler,
      '{ Skills { docs { relatedProjects(count: true, limit: 0) { docs { id } hasNextPage totalDocs } } } }',
    )
    const body = (await response.json()) as {
      data?: { Skills?: { docs?: Array<{ relatedProjects?: Record<string, unknown> }> } }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data?.Skills?.docs?.[0]?.relatedProjects).toEqual({
      docs: [],
      hasNextPage: false,
      totalDocs: 37,
    })
    expect(count).toHaveBeenCalledTimes(1)
    expect(find).not.toHaveBeenCalled()
  })

  it('uses a safe default for Admin-generated join selections with omitted limits', async () => {
    const adminQuery = allAdminDocumentQueries().find(
      ({ field, query }) => field === 'Skill' && query.includes('relatedProjects'),
    )
    expect(adminQuery).toBeDefined()
    if (!adminQuery) throw new Error('Expected a generated Skill Admin query with relatedProjects')

    const find = vi.fn(async (args: FindArgs) => ({
      docs: Array.from({ length: Number(args.limit) }, (_, index) => ({ id: index + 1 })),
      totalDocs: 25,
    }))
    const count = vi.fn(async () => ({ totalDocs: 25 }))
    const result = await callJoinResolver({
      args: {},
      typeName: 'Skill',
      fieldName: 'relatedProjects',
      find,
      count,
    })

    expect(adminQuery.query).toContain('relatedProjects {')
    expect(find.mock.calls[0]?.[0]).toMatchObject({ limit: 11 })
    expect((result.docs as unknown[]).length).toBe(10)
  })

  it('bounds each join for multiple parent documents without claiming batching', async () => {
    skillsResolver.mockImplementation(() => pageResult([{ id: 11 }, { id: 22 }]))
    const find = vi.fn(async (args: FindArgs) => ({
      docs: Array.from({ length: Number(args.limit) }, (_, index) => ({ id: index + 1 })),
      totalDocs: 50,
    }))
    const count = vi.fn(async () => ({ totalDocs: 50 }))
    const handler = createHandler({ req: { payload: { count, find }, query: {} } })
    const response = await sendQuery(
      handler,
      '{ Skills(limit: 2) { docs { id relatedProjects(limit: 2) { docs { id } hasNextPage } } } }',
    )
    const body = (await response.json()) as {
      data?: {
        Skills?: {
          docs?: Array<{
            id: number
            relatedProjects?: { docs: Array<{ id: number }>; hasNextPage: boolean }
          }>
        }
      }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data?.Skills?.docs).toHaveLength(2)
    expect(body.data?.Skills?.docs?.map(({ relatedProjects }) => relatedProjects?.docs)).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 1 }, { id: 2 }],
    ])
    expect(
      body.data?.Skills?.docs?.map(({ relatedProjects }) => relatedProjects?.hasNextPage),
    ).toEqual([true, true])
    expect(find).toHaveBeenCalledTimes(2)
    expect(find.mock.calls.map(([args]) => args.limit)).toEqual([3, 3])
    const serializedWhere = find.mock.calls.map(([args]) => JSON.stringify(args.where))
    expect(serializedWhere[0]).not.toBe(serializedWhere[1])
    expect(serializedWhere[0]).toContain('11')
    expect(serializedWhere[1]).toContain('22')
  })

  it('keeps the schema-level zero-limit count exception exclusive to count-only joins', async () => {
    const response = await sendQuery(
      createHandler(),
      '{ Skills { docs { relatedProjects(limit: 0) { docs { id } } } } }',
    )
    const body = (await response.json()) as { errors?: Array<{ message: string }> }

    expect(response.status).toBe(400)
    expect(body.errors?.some(({ message }) => message.includes('limit: 0'))).toBe(true)
    expect(skillsResolver).not.toHaveBeenCalled()
  })
})

describe('GraphQL list schema boundary', () => {
  it('covers collection/version list roots and all configured joins, not count-only roots', () => {
    const allTypes = Object.values(schema.getTypeMap()).filter((type) => GraphQL.isObjectType(type))
    const joinFields = allTypes.flatMap((type) =>
      Object.entries(type.getFields())
        .filter(
          ([, field]) =>
            (field.extensions?.field as { type?: unknown } | undefined)?.type === 'join',
        )
        .map(([name, field]) => ({ field: name, parentType: type.name, schemaField: field })),
    )
    const listRoots = Object.entries(schema.getQueryType()?.getFields() ?? {}).filter(
      ([, field]) => {
        const namedType = unwrapNonNull(field.type)
        if (!GraphQL.isObjectType(namedType)) return false
        const docsField = namedType.getFields().docs
        return Boolean(docsField && GraphQL.isListType(unwrapNonNull(docsField.type)))
      },
    )
    const rootByDocumentType = new Map<string, string>()
    for (const [rootName, field] of listRoots) {
      const resultType = unwrapNonNull(field.type)
      if (!GraphQL.isObjectType(resultType)) continue
      const docsField = resultType.getFields().docs
      if (!docsField) continue
      const docsType = unwrapNonNull(docsField.type)
      if (!GraphQL.isListType(docsType)) continue
      const documentType = GraphQL.getNamedType(docsType)
      if (GraphQL.isObjectType(documentType)) rootByDocumentType.set(documentType.name, rootName)
    }

    expect(listRoots.some(([name]) => name === 'Articles')).toBe(true)
    expect(listRoots.some(([name]) => name === 'versionsArticles')).toBe(true)
    expect(listRoots.length).toBeGreaterThan(0)
    for (const [fieldName, field] of listRoots) {
      expect(
        field.args.some(({ name }) => name === 'limit'),
        `${fieldName} exposes a limit`,
      ).toBe(true)
      expect(
        field.args.some(({ name }) =>
          ['first', 'last', 'offset', 'perPage', 'pageSize', 'take'].includes(name),
        ),
        `${fieldName} has no alternate page-size argument`,
      ).toBe(false)
    }

    expect([...new Set(joinFields.map(({ field }) => field))].sort()).toEqual([
      'documentsAndFolders',
      'members',
      'messages',
      'relatedProjects',
    ])
    for (const { field, parentType, schemaField } of joinFields) {
      expect(
        schemaField.args.some(({ name }) => name === 'limit'),
        `${parentType}.${field}`,
      ).toBe(true)
      expect(
        schemaField.args.some(({ name }) =>
          ['first', 'last', 'offset', 'perPage', 'pageSize', 'take'].includes(name),
        ),
        `${parentType}.${field} has no alternate page-size argument`,
      ).toBe(false)
    }

    let validatedJoinCount = 0
    const validatedJoinFields = new Set<string>()
    for (const { field, parentType, schemaField } of joinFields) {
      const rootField = rootByDocumentType.get(parentType)
      if (!rootField) continue
      const joinType = GraphQL.getNamedType(schemaField.type)
      if (!GraphQL.isObjectType(joinType)) continue
      const docsField = joinType.getFields().docs
      if (!docsField) continue
      const docsType = unwrapNonNull(docsField.type)
      const docsSelection = GraphQL.isListType(docsType) ? ' { __typename }' : ''
      const query = `query ExcessiveJoin${validatedJoinCount} { ${rootField}(limit: 1) { docs { ${field}(limit: ${MAX_GRAPHQL_LIST_LIMIT + 1}) { docs${docsSelection} hasNextPage } } } }`
      const limitErrors = validateWithListLimit(query).filter(({ message }) =>
        message.includes('GraphQL list limits'),
      )
      expect(
        limitErrors,
        `${parentType}.${field} rejects limits above ${MAX_GRAPHQL_LIST_LIMIT}`,
      ).not.toHaveLength(0)
      validatedJoinCount += 1
      validatedJoinFields.add(field)
    }
    expect(validatedJoinCount).toBeGreaterThan(0)
    expect([...validatedJoinFields].sort()).toEqual(
      [...new Set(joinFields.map(({ field }) => field))].sort(),
    )

    const countField = schema.getQueryType()?.getFields().countArticles
    expect(countField).toBeDefined()
    if (!countField) throw new Error('Expected the countArticles query field')
    expect(countField.args.some(({ name }) => name === 'limit')).toBe(false)
    const countType = GraphQL.getNamedType(countField.type)
    expect(GraphQL.isObjectType(countType)).toBe(true)
    if (GraphQL.isObjectType(countType)) {
      expect(countType.getFields().totalDocs).toBeDefined()
      expect(countType.getFields().docs).toBeUndefined()
    }
  })

  it('distinguishes embedded hasMany relationship arrays from paginated collection and join lists', () => {
    const allTypes = Object.values(schema.getTypeMap()).filter((type) => GraphQL.isObjectType(type))
    const hasManyFields = allTypes.flatMap((type) =>
      Object.entries(type.getFields())
        .filter(([, field]) => {
          const configuredField = field.extensions?.field as
            { type?: unknown; hasMany?: unknown } | undefined
          return configuredField?.type === 'relationship' && configuredField.hasMany === true
        })
        .map(([name, field]) => ({ field: name, parentType: type.name, schemaField: field })),
    )

    // Payload models hasMany relationships as document-embedded arrays without a list limit argument.
    // This change deliberately leaves those existing field semantics unchanged; no aggregate or
    // arbitrary nested-array result-size bound is claimed here.
    expect(hasManyFields.length).toBeGreaterThan(0)
    expect(
      hasManyFields.every(({ schemaField }) =>
        schemaField.args.every(({ name }) => name !== 'limit'),
      ),
    ).toBe(true)
  })
})
