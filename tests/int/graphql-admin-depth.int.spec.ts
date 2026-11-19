// @vitest-environment node
import { configToSchema } from '@payloadcms/graphql'
import { GraphQL } from '@payloadcms/graphql/types'
import type { ExecutionArgs, ValidationRule } from 'graphql'
import type { Payload, SanitizedConfig } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import configPromise from '@payload-config'
import {
  MAX_GRAPHQL_QUERY_NESTING,
  measureGraphQLQueryNesting,
} from '@/auth/graphqlQueryNestingLimit'
import { MAX_GRAPHQL_REQUEST_BODY_BYTES } from '@/auth/graphqlRequestBodyLimit'
import { defaultSelectableDepth } from '@/components/admin/views/GraphQL/depth'
import {
  documentQuery,
  MAX_GRAPHQL_DEPTH,
  type GraphQLDocumentQuery,
} from '@/components/admin/views/GraphQL/query'

type SchemaBuild = ReturnType<typeof configToSchema>

const allDepths = [0, 1, 2, 3, 4, 5]

const expectedSelectableDepths: Record<string, number[]> = {
  Article: allDepths,
  Project: [0, 1, 2],
  Media: allDepths,
  About: allDepths,
  Experience: allDepths,
  Education: allDepths,
  Certificate: allDepths,
  Service: allDepths,
  Skill: [0, 1, 2, 3],
  User: allDepths,
  Role: allDepths,
  AuditLog: allDepths,
  Redirect: [0, 1, 2, 3],
  Form: [0, 1, 2, 3],
  FormSubmission: [0, 1, 2, 3, 4],
  MailThread: [0, 1, 2, 3, 4],
  MailMessage: allDepths,
  MailAttachment: allDepths,
  MailLabel: allDepths,
  MailWebhookEvent: allDepths,
  PayloadKv: allDepths,
  PayloadJob: allDepths,
  PayloadFolder: allDepths,
  PayloadLockedDocument: [0, 1, 2, 3],
  PayloadPreference: allDepths,
  PayloadQueryPreset: [0, 1, 2, 3],
  Header: allDepths,
  SiteSetting: [0, 1, 2, 3],
  Navigation: allDepths,
  Footer: allDepths,
  CustomCode: allDepths,
  PayloadJobsStat: allDepths,
}

let applicationConfig: SanitizedConfig
let productionSchemaBuild: SchemaBuild

const payloadFor = (config: SanitizedConfig): Payload => ({ config }) as unknown as Payload

function allAdminDocuments(config: SanitizedConfig): GraphQLDocumentQuery[] {
  const payload = payloadFor(config)
  return [
    ...config.collections.map((collectionConfig) => documentQuery({ collectionConfig, payload })),
    ...config.globals.map((globalConfig) => documentQuery({ globalConfig, payload })),
  ].filter((document): document is GraphQLDocumentQuery => document !== null)
}

const variableValuesFor = (idType?: string): Record<string, unknown> =>
  idType
    ? { id: idType.startsWith('Int') || idType.startsWith('Float') ? 1 : 'admin-document' }
    : {}

function productionErrors(
  query: string,
  schemaBuild: SchemaBuild = productionSchemaBuild,
  variableValues: Record<string, unknown> = {},
): readonly GraphQL.GraphQLError[] {
  const document = GraphQL.parse(query)
  const args: ExecutionArgs = {
    document,
    operationName: GraphQL.getOperationAST(document)?.name?.value,
    schema: schemaBuild.schema,
    variableValues,
  }
  return GraphQL.validate(schemaBuild.schema, document, [
    ...GraphQL.specifiedRules,
    ...schemaBuild.validationRules(args),
  ])
}

beforeAll(async () => {
  applicationConfig = (await configPromise) as SanitizedConfig
  productionSchemaBuild = configToSchema(applicationConfig)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Admin GraphQL depth compatibility', () => {
  it('offers only production-valid depths for every generated collection and global query', () => {
    const documents = allAdminDocuments(applicationConfig)
    const generatedQueries = documents.flatMap((document) =>
      document.queries.map((query, depth) => ({ document, depth, query })),
    )

    expect(documents).toHaveLength(32)
    expect(generatedQueries).toHaveLength(192)
    expect(Object.keys(expectedSelectableDepths)).toHaveLength(32)
    expect(new Set(documents.map(({ field }) => field))).toEqual(
      new Set(Object.keys(expectedSelectableDepths)),
    )

    for (const generated of documents) {
      expect(generated.queries).toHaveLength(MAX_GRAPHQL_DEPTH + 1)
      expect(generated.depthValidation.map(({ depth }) => depth)).toEqual(allDepths)
      expect(generated.selectableDepths).toEqual(expectedSelectableDepths[generated.field])

      for (const [depth, query] of generated.queries.entries()) {
        const parsed = GraphQL.parse(query)
        const nesting = measureGraphQLQueryNesting(query)
        const requestBody = JSON.stringify({
          query,
          variables: variableValuesFor(generated.idType),
        })
        if (nesting === null) throw new Error(`${generated.field} depth ${depth} is malformed`)
        expect(nesting).toBeLessThanOrEqual(MAX_GRAPHQL_QUERY_NESTING)
        expect(Buffer.byteLength(requestBody)).toBeLessThanOrEqual(MAX_GRAPHQL_REQUEST_BODY_BYTES)

        const specifiedErrors = GraphQL.validate(
          productionSchemaBuild.schema,
          parsed,
          GraphQL.specifiedRules,
        )
        expect(
          specifiedErrors.map(({ message }) => message),
          `${generated.field} at depth ${depth} must pass GraphQL specified rules`,
        ).toEqual([])

        const errors = productionErrors(
          query,
          productionSchemaBuild,
          variableValuesFor(generated.idType),
        ).map(({ message }) => message)
        const result = generated.depthValidation[depth]

        expect(result).toEqual({ depth, errors, valid: errors.length === 0 })
        expect(generated.selectableDepths.includes(depth)).toBe(errors.length === 0)
      }
    }
  })

  it('aliases polymorphic union fields without dropping their original selections', () => {
    const payload = payloadFor(applicationConfig)
    const redirects = applicationConfig.collections.find(({ slug }) => slug === 'redirects')
    const forms = applicationConfig.collections.find(({ slug }) => slug === 'forms')
    const lockedDocuments = applicationConfig.collections.find(
      ({ slug }) => slug === 'payload-locked-documents',
    )

    expect(redirects).toBeDefined()
    expect(forms).toBeDefined()
    expect(lockedDocuments).toBeDefined()
    if (!redirects || !forms || !lockedDocuments) {
      throw new Error('Expected the Redirects, Forms, and Payload Locked Documents collections')
    }

    expect(documentQuery({ collectionConfig: redirects, payload })?.queries[1]).toContain(
      'payloadInspector_Article_primaryMedia: primaryMedia',
    )
    expect(documentQuery({ collectionConfig: forms, payload })?.queries[0]).toContain(
      'payloadInspector_Checkbox_defaultValue: defaultValue',
    )
    expect(documentQuery({ collectionConfig: lockedDocuments, payload })?.queries[1]).toContain(
      'payloadInspector_Article_title: title',
    )
  })

  it('keeps Payload Locked Documents depths rejected by the selection traversal limit', () => {
    const lockedDocuments = allAdminDocuments(applicationConfig).find(
      ({ field }) => field === 'PayloadLockedDocument',
    )
    expect(lockedDocuments).toBeDefined()
    if (!lockedDocuments) throw new Error('Expected Payload Locked Documents')

    for (const depth of [4, 5]) {
      expect(lockedDocuments.selectableDepths).not.toContain(depth)
      expect(lockedDocuments.depthValidation[depth]?.errors).toContain(
        'GraphQL selection traversal exceeds the maximum work of 4096 reachable selection nodes.',
      )
    }
  })

  it('keeps Payload production complexity at 1,000 and accepts exactly 1,000, rejecting 1,002', () => {
    expect(applicationConfig.graphQL.maxComplexity).toBe(1_000)

    const countAliases = (count: number) =>
      `query CountAliases { ${Array.from(
        { length: count },
        (_, index) => `count${index}: countArticles { totalDocs }`,
      ).join(' ')} }`

    expect(productionErrors(countAliases(500))).toEqual([])

    const errors = productionErrors(countAliases(501)).map(({ message }) => message)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('maximum complexity of 1000')
    expect(errors[0]).toContain('Actual complexity is 1002')
  })

  it('preserves built-in GraphQL validation failures instead of offering malformed queries', () => {
    const errors = productionErrors(
      'query InvalidAdminQuery { Articles { docs { definitelyUnknownField } } }',
    ).map(({ message }) => message)

    expect(errors.join('\n')).toContain('Cannot query field "definitelyUnknownField"')
  })

  it('applies the configured production list-limit rule', () => {
    const errors = productionErrors('{ Articles(limit: 101) { docs { id } } }').map(
      ({ message }) => message,
    )

    expect(errors).toContain('GraphQL list limits must be between 1 and 100.')
  })

  it('applies production-configured validation rules as the GraphQL route does', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const errors = productionErrors('{ __schema { queryType { name } } }').map(
      ({ message }) => message,
    )
    expect(errors).toContain(
      'GraphQL introspection is not allowed, but the query contained __schema or __type',
    )
  })

  it('reports an empty valid-depth set and keeps independent validation errors visible', () => {
    const independentProductionRule: ValidationRule = (context) => ({
      OperationDefinition(node) {
        context.reportError(
          new GraphQL.GraphQLError('Independent production rule failure.', { nodes: [node] }),
        )
      },
    })
    const configuredValidationRules = applicationConfig.graphQL.validationRules
    const validationRules: SchemaBuild['validationRules'] = (args) => [
      ...(typeof configuredValidationRules === 'function' ? configuredValidationRules(args) : []),
      independentProductionRule,
    ]
    const constrainedConfig = {
      ...applicationConfig,
      graphQL: {
        ...applicationConfig.graphQL,
        maxComplexity: 1,
        validationRules,
      },
    } as SanitizedConfig
    const articles = constrainedConfig.collections.find(({ slug }) => slug === 'articles')

    expect(articles).toBeDefined()
    if (!articles) throw new Error('Expected Articles for the empty-depth fallback test')

    const document = documentQuery({
      collectionConfig: articles,
      payload: payloadFor(constrainedConfig),
    })
    expect(document).not.toBeNull()
    if (!document) throw new Error('Expected the constrained Admin query document')

    expect(document.selectableDepths).toEqual([])
    expect(defaultSelectableDepth(document.selectableDepths, 2)).toBeUndefined()
    expect(document.depthValidation).toHaveLength(MAX_GRAPHQL_DEPTH + 1)
    for (const { valid, errors } of document.depthValidation) {
      expect(valid).toBe(false)
      expect(errors.some((message) => message.includes('maximum complexity of 1'))).toBe(true)
      expect(errors).toContain('Independent production rule failure.')
    }
  })

  it('selects the nearest valid shallower depth, or the first available depth when none is shallower', () => {
    expect(defaultSelectableDepth([0, 1, 2, 3], 2)).toBe(2)
    expect(defaultSelectableDepth([0, 1, 2, 3], 5)).toBe(3)
    expect(defaultSelectableDepth([3, 4], 2)).toBe(3)
    expect(defaultSelectableDepth([], 2)).toBeUndefined()
  })
})
