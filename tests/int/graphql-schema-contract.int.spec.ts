// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSchema,
  getNamedType,
  getVariableValues,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  parse,
  print,
  validate,
  validateSchema,
  type GraphQLInputType,
  type GraphQLNamedType,
  type GraphQLObjectType,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import {
  ABOUT_SELECT,
  ARTICLE_CARD_SELECT,
  ARTICLE_DETAIL_SELECT,
  ARTICLE_FEED_SELECT,
  ARTICLE_SLUG_SELECT,
  CERTIFICATE_SELECT,
  DETAIL_POPULATE,
  EDUCATION_SELECT,
  EXPERIENCE_SELECT,
  FOOTER_GLOBAL_SELECT,
  HEADER_GLOBAL_SELECT,
  MEDIA_PUBLIC_POPULATE,
  NAVIGATION_GLOBAL_SELECT,
  PROJECT_CARD_SELECT,
  PROJECT_DETAIL_SELECT,
  PROJECT_FEED_SELECT,
  PROJECT_SLUG_SELECT,
  REDIRECT_SELECT,
  SERVICE_SELECT,
  SITE_SETTINGS_GLOBAL_SELECT,
  SKILL_SELECT,
} from '@/app/(frontend)/lib/payload-source'
import { PUBLIC_FORM_SELECT } from '@/app/(frontend)/lib/forms-cache'

const schemaPath = resolve(process.cwd(), 'schema.graphql')
const schemaSDL = readFileSync(schemaPath, 'utf8')
const schema = buildSchema(schemaSDL)
const queryType = schema.getQueryType()

if (!queryType) {
  throw new Error(`Generated Payload schema at ${schemaPath} has no Query type`)
}

const queryFields = queryType.getFields()
const MAX_SELECTION_DEPTH = 7
const mediaProjectionFields = new Set<string>()

type Projection = Readonly<Record<string, unknown>>
type WhereValue = {
  where?: unknown
}
type ListOptions = {
  draft?: boolean
  limit?: number
  pagination?: boolean
  sort?: string
} & WhereValue

type OperationContext = {
  fields: string[]
  variableDefinitions: string[]
  variables: Record<string, unknown>
}

const context = (): OperationContext => ({
  fields: [],
  variableDefinitions: [],
  variables: {},
})

const isLeaf = (type: GraphQLNamedType): boolean => isScalarType(type) || isEnumType(type)

const projectionForType = (typeName: string): Projection | undefined => {
  switch (typeName) {
    case 'Media':
      return MEDIA_PUBLIC_POPULATE.media
    case 'Skill':
      return MEDIA_PUBLIC_POPULATE.skills
    case 'Article':
      return DETAIL_POPULATE.articles
    case 'Project':
      return DETAIL_POPULATE.projects
    default:
      return undefined
  }
}

const renderCompositeSelection = (
  type: GraphQLNamedType,
  projection: Projection | undefined,
  depth: number,
  ancestors: readonly string[],
): string => {
  if (depth >= MAX_SELECTION_DEPTH || ancestors.includes(type.name)) {
    return '__typename'
  }

  const nextAncestors = [...ancestors, type.name]

  if (isUnionType(type) || isInterfaceType(type)) {
    const fragments = schema.getPossibleTypes(type).map((member) => {
      const fields = renderObjectSelection(
        member,
        projectionForType(member.name),
        depth + 1,
        nextAncestors,
        member.name,
      )
      return `... on ${member.name} { ${fields} }`
    })

    return ['__typename', ...fragments].join(' ')
  }

  if (!isObjectType(type)) {
    throw new Error(`Expected a composite GraphQL type, received ${type.name}`)
  }

  return renderObjectSelection(type, projection, depth, nextAncestors)
}

const renderObjectSelection = (
  type: GraphQLObjectType,
  projection: Projection | undefined,
  depth: number,
  ancestors: readonly string[],
  unionMemberAliasPrefix = '',
): string => {
  const fields = type.getFields()
  const fieldNames = projection ? Object.keys(projection) : Object.keys(fields)

  if (fieldNames.length === 0) {
    return '__typename'
  }

  return fieldNames
    .map((fieldName) => {
      const field = fields[fieldName]

      if (!field) {
        throw new Error(
          `Local API projection field "${type.name}.${fieldName}" is absent from ${schemaPath}`,
        )
      }

      const alias = unionMemberAliasPrefix ? `${unionMemberAliasPrefix}_${fieldName}: ` : ''
      const namedType = getNamedType(field.type)

      if (type.name === 'Media') {
        mediaProjectionFields.add(fieldName)
      }

      if (isLeaf(namedType)) {
        return `${alias}${fieldName}`
      }

      if (!isObjectType(namedType) && !isUnionType(namedType) && !isInterfaceType(namedType)) {
        throw new Error(
          `Unsupported GraphQL field type for "${type.name}.${fieldName}": ${String(field.type)}`,
        )
      }

      const childSelection = renderCompositeSelection(
        namedType,
        projectionForType(namedType.name),
        depth + 1,
        ancestors,
      )

      return `${alias}${fieldName} { ${childSelection} }`
    })
    .join(' ')
}

const findGlobalRoot = (typeName: string): string => {
  const matches = Object.entries(queryFields).filter(
    ([, field]) => getNamedType(field.type).name === typeName,
  )

  if (matches.length !== 1) {
    throw new Error(
      `Expected one generated Query field returning ${typeName}; found ${
        matches.map(([name]) => name).join(', ') || 'none'
      }`,
    )
  }

  return matches[0][0]
}

const findCollectionListRoot = (
  typeName: string,
): { fieldName: string; field: ReturnType<GraphQLObjectType['getFields']>[string] } => {
  const matches = Object.entries(queryFields).filter(([, field]) => {
    const resultType = getNamedType(field.type)

    if (!isObjectType(resultType)) {
      return false
    }

    const docsField = resultType.getFields().docs
    return Boolean(docsField && getNamedType(docsField.type).name === typeName)
  })

  if (matches.length !== 1) {
    throw new Error(
      `Expected one generated collection-list Query field for ${typeName}; found ${
        matches.map(([name]) => name).join(', ') || 'none'
      }`,
    )
  }

  return { fieldName: matches[0][0], field: matches[0][1] }
}

const requireArgument = (
  field: ReturnType<GraphQLObjectType['getFields']>[string],
  argumentName: string,
) => {
  const argument = field.args.find(({ name }) => name === argumentName)

  if (!argument) {
    throw new Error(`Generated GraphQL field "${field.name}" has no "${argumentName}" argument`)
  }

  return argument
}

const convertLocalWhereToGraphQLInput = (value: unknown, inputType: GraphQLInputType): unknown => {
  if (isNonNullType(inputType)) {
    return convertLocalWhereToGraphQLInput(value, inputType.ofType)
  }

  if (isListType(inputType)) {
    const values = Array.isArray(value) ? value : [value]
    return values.map((item) => convertLocalWhereToGraphQLInput(item, inputType.ofType))
  }

  const namedType = getNamedType(inputType)

  if (!isInputObjectType(namedType)) {
    return value
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected an object value for generated input type ${namedType.name}`)
  }

  const inputFields = namedType.getFields()
  const converted: Record<string, unknown> = {}

  for (const [localFieldName, localValue] of Object.entries(value)) {
    const graphQLFieldName = inputFields[localFieldName]
      ? localFieldName
      : Object.keys(inputFields).find(
          (candidate) => candidate.toLowerCase() === localFieldName.toLowerCase(),
        )

    if (!graphQLFieldName) {
      throw new Error(
        `Local API where field "${localFieldName}" has no matching field in generated input type ${namedType.name}`,
      )
    }

    converted[graphQLFieldName] = convertLocalWhereToGraphQLInput(
      localValue,
      inputFields[graphQLFieldName].type,
    )
  }

  return converted
}

const renderArguments = (
  field: ReturnType<GraphQLObjectType['getFields']>[string],
  options: ListOptions,
  alias: string,
  operationContext: OperationContext,
): string => {
  const argumentsList: string[] = []

  for (const [optionName, optionValue] of Object.entries(options)) {
    if (optionName === 'where') {
      const argument = requireArgument(field, 'where')
      const variableName = `${alias}Where`

      operationContext.variableDefinitions.push(`$${variableName}: ${argument.type}`)
      operationContext.variables[variableName] = convertLocalWhereToGraphQLInput(
        optionValue,
        argument.type,
      )
      argumentsList.push(`where: $${variableName}`)
      continue
    }

    requireArgument(field, optionName)
    const value = optionName === 'sort' ? JSON.stringify(optionValue) : String(optionValue)
    argumentsList.push(`${optionName}: ${value}`)
  }

  return argumentsList.length > 0 ? `(${argumentsList.join(', ')})` : ''
}

const renderListField = (
  typeName: string,
  projection: Projection,
  alias: string,
  options: ListOptions,
  operationContext: OperationContext,
): string => {
  const { fieldName, field } = findCollectionListRoot(typeName)
  const argumentsText = renderArguments(field, options, alias, operationContext)
  const resultType = getNamedType(field.type)

  if (!isObjectType(resultType)) {
    throw new Error(`Expected ${fieldName} to return a generated list result object`)
  }

  const resultFields = resultType.getFields()
  const docsField = resultFields.docs

  if (!docsField || getNamedType(docsField.type).name !== typeName) {
    throw new Error(`Generated list result ${resultType.name} has no docs of type ${typeName}`)
  }

  const docs = renderCompositeSelection(getNamedType(docsField.type), projection, 0, [])
  const paginationFields = Object.entries(resultFields)
    .filter(([name, resultField]) => name !== 'docs' && isLeaf(getNamedType(resultField.type)))
    .map(([name]) => name)

  return `${alias}: ${fieldName}${argumentsText} { docs { ${docs} } ${paginationFields.join(' ')} }`
}

const renderGlobalField = (typeName: string, projection: Projection): string => {
  const rootFieldName = findGlobalRoot(typeName)
  const type = schema.getType(typeName)

  if (!type || !isObjectType(type)) {
    throw new Error(`Expected generated global GraphQL object type ${typeName}`)
  }

  return `${rootFieldName} { ${renderObjectSelection(type, projection, 0, [])} }`
}

const buildOperation = (name: string, operationContext: OperationContext): string => {
  const variables =
    operationContext.variableDefinitions.length > 0
      ? `(${operationContext.variableDefinitions.join(', ')})`
      : ''

  return `query ${name}${variables} { ${operationContext.fields.join('\n')} }`
}

const publicOperations = (() => {
  const globals = context()
  for (const [typeName, projection] of [
    ['Header', HEADER_GLOBAL_SELECT],
    ['Navigation', NAVIGATION_GLOBAL_SELECT],
    ['Footer', FOOTER_GLOBAL_SELECT],
    ['SiteSetting', SITE_SETTINGS_GLOBAL_SELECT],
  ] as const) {
    globals.fields.push(renderGlobalField(typeName, projection))
  }

  const home = context()
  const profileCollections = [
    ['About', ABOUT_SELECT, { limit: 1 }],
    ['Skill', SKILL_SELECT, { pagination: false, sort: '_order' }],
    ['Experience', EXPERIENCE_SELECT, { pagination: false, sort: '_order' }],
    ['Education', EDUCATION_SELECT, { pagination: false, sort: '_order' }],
    ['Certificate', CERTIFICATE_SELECT, { pagination: false, sort: 'issuedAt' }],
    ['Service', SERVICE_SELECT, { pagination: false, sort: '_order' }],
  ] as const

  for (const [typeName, projection, options] of profileCollections) {
    home.fields.push(renderListField(typeName, projection, `home${typeName}`, options, home))
  }

  home.fields.push(
    renderListField(
      'Article',
      ARTICLE_CARD_SELECT,
      'articleCards',
      {
        draft: false,
        pagination: false,
        sort: '-publishedAt',
        where: PUBLISHED_OR_LEGACY_WHERE,
      },
      home,
    ),
    renderListField(
      'Project',
      PROJECT_CARD_SELECT,
      'projectCards',
      {
        draft: false,
        pagination: false,
        sort: '_order',
        where: PUBLISHED_OR_LEGACY_WHERE,
      },
      home,
    ),
  )

  const editorial = context()
  const articleSlugWhere = {
    and: [{ slug: { equals: 'phase0-schema-contract-probe' } }, PUBLISHED_OR_LEGACY_WHERE],
  }
  const projectSlugWhere = {
    and: [{ slug: { equals: 'phase0-schema-contract-probe' } }, PUBLISHED_OR_LEGACY_WHERE],
  }

  editorial.fields.push(
    renderListField(
      'Article',
      ARTICLE_DETAIL_SELECT,
      'articleDetail',
      { draft: false, limit: 1, where: articleSlugWhere },
      editorial,
    ),
    renderListField(
      'Project',
      PROJECT_DETAIL_SELECT,
      'projectDetail',
      { draft: false, limit: 1, where: projectSlugWhere },
      editorial,
    ),
    renderListField(
      'Article',
      ARTICLE_FEED_SELECT,
      'articleFeed',
      {
        draft: false,
        pagination: false,
        sort: '-publishedAt',
        where: PUBLISHED_OR_LEGACY_WHERE,
      },
      editorial,
    ),
    renderListField(
      'Project',
      PROJECT_FEED_SELECT,
      'projectFeed',
      {
        draft: false,
        pagination: false,
        sort: '_order',
        where: PUBLISHED_OR_LEGACY_WHERE,
      },
      editorial,
    ),
    renderListField(
      'Article',
      ARTICLE_SLUG_SELECT,
      'articleSlugs',
      {
        draft: false,
        pagination: false,
        sort: '-publishedAt',
        where: PUBLISHED_OR_LEGACY_WHERE,
      },
      editorial,
    ),
    renderListField(
      'Project',
      PROJECT_SLUG_SELECT,
      'projectSlugs',
      {
        draft: false,
        pagination: false,
        sort: '_order',
        where: PUBLISHED_OR_LEGACY_WHERE,
      },
      editorial,
    ),
  )

  const formsAndRedirects = context()
  formsAndRedirects.fields.push(
    renderListField(
      'Form',
      PUBLIC_FORM_SELECT,
      'publicForms',
      {
        pagination: false,
        sort: 'id',
      },
      formsAndRedirects,
    ),
    renderListField(
      'Redirect',
      REDIRECT_SELECT,
      'publicRedirects',
      {
        pagination: false,
      },
      formsAndRedirects,
    ),
  )

  return [
    { name: 'public-globals', context: globals },
    { name: 'public-home-and-cards', context: home },
    { name: 'public-article-project-details-and-feeds', context: editorial },
    { name: 'public-forms-and-redirects', context: formsAndRedirects },
  ].map(({ name, context: operationContext }) => ({
    name,
    context: operationContext,
    document: parse(buildOperation(name.replaceAll('-', '_'), operationContext)),
  }))
})()

describe('generated Payload GraphQL schema contract', () => {
  it('parses as a valid GraphQL schema generated by the repository script', () => {
    expect(validateSchema(schema)).toEqual([])
    expect(schema.getQueryType()?.name).toBe('Query')
  })

  it.each(publicOperations)(
    'validates $name against schema.graphql',
    ({ context: operationContext, document }) => {
      expect(validate(schema, document)).toEqual([])

      const operation = document.definitions.find(
        (definition) => definition.kind === 'OperationDefinition',
      )
      expect(operation?.kind).toBe('OperationDefinition')

      if (!operation || operation.kind !== 'OperationDefinition') {
        throw new Error('Expected a GraphQL operation definition')
      }

      expect(operation.operation).toBe('query')

      const variables = getVariableValues(
        schema,
        operation.variableDefinitions ?? [],
        operationContext.variables,
      )
      expect(variables.errors).toBeUndefined()
    },
  )

  it('keeps Local API list pagination and output-envelope semantics expressible', () => {
    for (const typeName of [
      'About',
      'Skill',
      'Experience',
      'Education',
      'Certificate',
      'Service',
      'Article',
      'Project',
      'Form',
      'Redirect',
    ]) {
      const { fieldName, field } = findCollectionListRoot(typeName)
      const pagination = requireArgument(field, 'pagination')
      const limit = requireArgument(field, 'limit')
      const resultType = getNamedType(field.type)

      expect(getNamedType(pagination.type).name, `${fieldName}.pagination`).toBe('Boolean')
      expect(getNamedType(limit.type).name, `${fieldName}.limit`).toBe('Int')
      expect(isObjectType(resultType)).toBe(true)

      if (isObjectType(resultType)) {
        expect(resultType.getFields().docs).toBeDefined()
        expect(resultType.getFields().totalDocs).toBeDefined()
        expect(resultType.getFields().totalPages).toBeDefined()
      }
    }

    const articleArgs = findCollectionListRoot('Article').field.args.map(({ name }) => name)
    const projectArgs = findCollectionListRoot('Project').field.args.map(({ name }) => name)
    expect(articleArgs).toContain('draft')
    expect(projectArgs).toContain('draft')
  })

  it('covers selected media metadata, Lexical JSON fields, and generated polymorphic relationships', () => {
    const mediaType = schema.getType('Media')
    const articleType = schema.getType('Article')
    const projectType = schema.getType('Project')
    const formType = schema.getType('Form')
    const redirectType = schema.getType('Redirect')

    expect(mediaType && isObjectType(mediaType)).toBe(true)
    expect(articleType && isObjectType(articleType)).toBe(true)
    expect(projectType && isObjectType(projectType)).toBe(true)
    expect(formType && isObjectType(formType)).toBe(true)
    expect(redirectType && isObjectType(redirectType)).toBe(true)

    if (
      !mediaType ||
      !isObjectType(mediaType) ||
      !articleType ||
      !isObjectType(articleType) ||
      !projectType ||
      !isObjectType(projectType) ||
      !formType ||
      !isObjectType(formType) ||
      !redirectType ||
      !isObjectType(redirectType)
    ) {
      throw new Error('Generated schema is missing a required public content type')
    }

    for (const fieldName of Object.keys(MEDIA_PUBLIC_POPULATE.media)) {
      expect(mediaType.getFields()[fieldName], `Media.${fieldName}`).toBeDefined()
      expect(mediaProjectionFields.has(fieldName), `selected Media.${fieldName}`).toBe(true)
    }

    for (const type of [articleType, projectType]) {
      const content = type.getFields().content
      expect(content, `${type.name}.content`).toBeDefined()
      expect(getNamedType(content.type).name, `${type.name}.content type`).toBe('JSON')
    }

    const formFieldsType = getNamedType(formType.getFields().fields.type)
    expect(isUnionType(formFieldsType), 'Form.fields is a generated block union').toBe(true)

    const redirectToType = getNamedType(redirectType.getFields().to.type)
    if (!isObjectType(redirectToType)) {
      throw new Error('Generated Redirect.to field is not an object type')
    }
    const referenceType = getNamedType(redirectToType.getFields().reference.type)
    if (!isObjectType(referenceType)) {
      throw new Error('Generated Redirect.to.reference field is not a relationship object')
    }
    const valueType = getNamedType(referenceType.getFields().value.type)
    expect(isUnionType(valueType), 'Redirect references are polymorphic').toBe(true)

    if (isUnionType(valueType)) {
      expect(schema.getPossibleTypes(valueType).map(({ name }) => name)).toEqual(
        expect.arrayContaining(['Article', 'Project']),
      )
    }
  })

  it('does not request sensitive form notification targets or public mutations', () => {
    expect(Object.keys(PUBLIC_FORM_SELECT)).not.toContain('emails')
    expect(
      publicOperations.find(({ name }) => name === 'public-forms-and-redirects')?.document,
    ).toBeDefined()

    const formsOperation = publicOperations.find(
      ({ name }) => name === 'public-forms-and-redirects',
    )
    expect(formsOperation).toBeDefined()

    if (formsOperation) {
      expect(print(formsOperation.document)).not.toMatch(/\bemails\b/)
    }

    expect(schema.getMutationType()).toBeDefined()
    expect(
      publicOperations.every(({ document }) =>
        document.definitions.every(
          (definition) =>
            definition.kind !== 'OperationDefinition' || definition.operation === 'query',
        ),
      ),
    ).toBe(true)
  })
})
