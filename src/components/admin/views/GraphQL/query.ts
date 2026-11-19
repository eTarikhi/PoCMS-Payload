import { configToSchema } from '@payloadcms/graphql'
import { GraphQL } from '@payloadcms/graphql/types'
import type { Payload, SanitizedCollectionConfig, SanitizedGlobalConfig } from 'payload'
import { formatNames, toWords } from 'payload'

/** Deepest relationship expansion offered (REST allows 10, but a GraphQL selection grows fast). */
export const MAX_GRAPHQL_DEPTH = 5

/*
 * The schema is walked by shape (getFields, getTypes, ofType) instead of graphql's `isObjectType`
 * helpers, so this module never depends on which copy of the graphql package Next.js bundled.
 */
type TypeLike = {
  name?: string
  ofType?: TypeLike
  getFields?: () => Record<string, FieldLike>
  getTypes?: () => TypeLike[]
  toString(): string
}
type ArgLike = { name: string; type: TypeLike }
type FieldLike = { name: string; type: TypeLike; args?: readonly ArgLike[] }
type SchemaLike = { getQueryType(): { getFields(): Record<string, FieldLike> } | null | undefined }
type SchemaBuild = ReturnType<typeof configToSchema>

const schemas = new WeakMap<object, SchemaBuild>()

/** Payload's GraphQL schema and validation rules, built once per config as /api/graphql does. */
function schemaFor(payload: Payload): SchemaBuild {
  let schema = schemas.get(payload.config)
  if (!schema) {
    schema = configToSchema(payload.config)
    schemas.set(payload.config, schema)
  }
  return schema
}

const queryCache = new WeakMap<object, WeakMap<object, GraphQLDocumentQuery | null>>()

function cachedDocumentQuery(
  payload: Payload,
  entity: SanitizedCollectionConfig | SanitizedGlobalConfig,
): GraphQLDocumentQuery | null | undefined {
  return queryCache.get(payload.config)?.get(entity)
}

function cacheDocumentQuery(
  payload: Payload,
  entity: SanitizedCollectionConfig | SanitizedGlobalConfig,
  result: GraphQLDocumentQuery | null,
): GraphQLDocumentQuery | null {
  let entityCache = queryCache.get(payload.config)
  if (!entityCache) {
    entityCache = new WeakMap()
    queryCache.set(payload.config, entityCache)
  }
  entityCache.set(entity, result)
  return result
}

const named = (type: TypeLike): TypeLike => (type.ofType ? named(type.ofType) : type)
const isRequired = (type: TypeLike) => type.toString().endsWith('!')
const isComposite = (type: TypeLike) => Boolean(type.getFields || type.getTypes)

/**
 * GraphQL requires overlapping fields to have compatible leaf types even when they are selected
 * under mutually-exclusive union members. Payload creates collection-specific enum/object types
 * for otherwise identically named fields, so preserve every field value under a stable,
 * type-qualified response alias when the union members disagree on its GraphQL output type.
 */
function unionFieldAliases(members: TypeLike[]): Map<TypeLike, ReadonlyMap<string, string>> {
  const signatures = new Map<string, Set<string>>()
  const fieldsByMember = new Map<TypeLike, Record<string, FieldLike>>()

  for (const member of members) {
    const fields = member.getFields?.() ?? {}
    fieldsByMember.set(member, fields)
    for (const field of Object.values(fields)) {
      const types = signatures.get(field.name) ?? new Set<string>()
      types.add(field.type.toString())
      signatures.set(field.name, types)
    }
  }

  const conflictingNames = new Set(
    [...signatures].filter(([, types]) => types.size > 1).map(([name]) => name),
  )
  const aliases = new Map<TypeLike, ReadonlyMap<string, string>>()

  for (const member of members) {
    const fields = fieldsByMember.get(member) ?? {}
    const availableNames = new Set(Object.keys(fields))
    const memberAliases = new Map<string, string>()

    for (const field of Object.values(fields)) {
      if (!conflictingNames.has(field.name)) continue

      const base = `payloadInspector_${member.name ?? 'Type'}_${field.name}`
      let alias = base
      let suffix = 2
      while (availableNames.has(alias)) {
        alias = `${base}_${suffix}`
        suffix += 1
      }
      availableNames.add(alias)
      memberAliases.set(field.name, alias)
    }

    if (memberAliases.size > 0) aliases.set(member, memberAliases)
  }

  return aliases
}

/** Collection document types (relationship targets), named like @payloadcms/graphql names them. */
function documentTypeNames(payload: Payload): Set<string> {
  return new Set(
    payload.config.collections
      .filter((collection) => collection.graphQL !== false)
      .map((collection) => {
        const custom = collection.graphQL ? collection.graphQL.singularName : undefined
        return custom ? toWords(custom, true) : formatNames(collection.slug).singular
      }),
  )
}

/**
 * The selection set for a type. Relationship targets (collection documents) count against `depth`
 * like REST's `depth`: at 0 they select only `id`. Groups, arrays and blocks are part of the
 * document and are always expanded. Fields with required arguments are left out.
 */
function selection(
  type: TypeLike,
  depth: number,
  documents: Set<string>,
  indent: string,
  nesting = 0,
  fieldAliases: ReadonlyMap<string, string> = new Map(),
): string[] {
  const target = named(type)
  if (nesting > 12) return [`${indent}__typename`]
  if (target.getTypes) {
    const members = target.getTypes()
    const aliasesByMember = unionFieldAliases(members)
    return [
      `${indent}__typename`,
      ...members.flatMap((member) => [
        `${indent}... on ${member.name} {`,
        ...selection(
          member,
          depth,
          documents,
          `${indent}  `,
          nesting + 1,
          aliasesByMember.get(member),
        ),
        `${indent}}`,
      ]),
    ]
  }
  const lines: string[] = []
  for (const field of Object.values(target.getFields?.() ?? {})) {
    if (field.args?.some((arg) => isRequired(arg.type))) continue
    const fieldType = named(field.type)
    const responseName = fieldAliases.get(field.name)
    const selectionName = responseName ? `${responseName}: ${field.name}` : field.name
    if (!isComposite(fieldType)) {
      lines.push(`${indent}${selectionName}`)
      continue
    }
    const members = fieldType.getTypes?.() ?? [fieldType]
    const isRelationship = members.every((member) => documents.has(member.name ?? ''))
    if (isRelationship && depth <= 0) {
      lines.push(
        `${indent}${selectionName} {`,
        ...(fieldType.getTypes
          ? [
              `${indent}  __typename`,
              ...members.map((member) => `${indent}  ... on ${member.name} { id }`),
            ]
          : [`${indent}  id`]),
        `${indent}}`,
      )
      continue
    }
    const inner = selection(
      field.type,
      isRelationship ? depth - 1 : depth,
      documents,
      `${indent}  `,
      nesting + 1,
    )
    if (inner.length > 0) lines.push(`${indent}${selectionName} {`, ...inner, `${indent}}`)
  }
  return lines
}

export type GraphQLDepthValidation = {
  depth: number
  errors: string[]
  valid: boolean
}

export type GraphQLDocumentQuery = {
  /** Query field, e.g. `Article` or `Footer`. */
  field: string
  /** One query text per depth, 0 to MAX_GRAPHQL_DEPTH. Includes unavailable depths for diagnostics. */
  queries: string[]
  /** Depths the Admin Inspector may offer; every entry passes production GraphQL validation. */
  selectableDepths: number[]
  /** Production validation result for every generated query, including unavailable depths. */
  depthValidation: GraphQLDepthValidation[]
  /** Which optional arguments the query takes (the view only sends those). */
  args: { draft: boolean; fallbackLocale: boolean; locale: boolean; trash: boolean }
  /** GraphQL type of the `id` argument (collections only), e.g. `Int!`. */
  idType?: string
}

/** Validate a generated query with GraphQL's normal rules and Payload's production rules. */
function validateGeneratedQuery(
  query: string,
  schemaBuild: SchemaBuild,
  idType?: string,
): string[] {
  let document: ReturnType<typeof GraphQL.parse>
  try {
    document = GraphQL.parse(query)
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)]
  }

  const variableValues = idType
    ? { id: idType.startsWith('Int') || idType.startsWith('Float') ? 1 : 'admin-document' }
    : {}
  const args = {
    document,
    operationName: GraphQL.getOperationAST(document)?.name?.value,
    schema: schemaBuild.schema,
    variableValues,
  }
  const errors = GraphQL.validate(schemaBuild.schema, document, [
    ...GraphQL.specifiedRules,
    ...schemaBuild.validationRules(args),
  ])
  return errors.map(({ message }) => message)
}

/**
 * The query Payload's GraphQL API answers for one document, with the same options as the REST API
 * tab: draft, locale, depth (relationship expansion) and trash. Returns null when the collection
 * or global has GraphQL turned off.
 */
export function documentQuery({
  collectionConfig,
  globalConfig,
  payload,
}: {
  collectionConfig?: SanitizedCollectionConfig
  globalConfig?: SanitizedGlobalConfig
  payload: Payload
}): GraphQLDocumentQuery | null {
  if (payload.config.graphQL?.disable) return null
  const entity = collectionConfig ?? globalConfig
  if (!entity) return null
  const cached = cachedDocumentQuery(payload, entity)
  if (cached !== undefined) return cached
  if (entity.graphQL === false) return cacheDocumentQuery(payload, entity, null)

  const schemaBuild = schemaFor(payload)
  const queryFields =
    (schemaBuild.schema as unknown as SchemaLike).getQueryType()?.getFields() ?? {}
  let fieldName: string | undefined
  if (collectionConfig) {
    const custom = collectionConfig.graphQL ? collectionConfig.graphQL.singularName : undefined
    fieldName = custom ? toWords(custom, true) : formatNames(collectionConfig.slug).singular
  } else if (globalConfig) {
    const words = toWords(globalConfig.slug, true)
    const custom = globalConfig.graphQL ? globalConfig.graphQL.name : undefined
    fieldName = [custom, words, words.replace(/s$/, '')].find(
      (name) => name && queryFields[name] && !queryFields[name].args?.some((a) => a.name === 'id'),
    )
  }
  const field = fieldName ? queryFields[fieldName] : undefined
  if (!field || !fieldName) return cacheDocumentQuery(payload, entity, null)

  const has = (name: string) => Boolean(field.args?.some((arg) => arg.name === name))
  const draftsEnabled = Boolean(
    entity.versions && typeof entity.versions === 'object' && entity.versions.drafts,
  )
  const args = {
    draft: draftsEnabled && has('draft'),
    fallbackLocale: Boolean(payload.config.localization) && has('fallbackLocale'),
    locale: Boolean(payload.config.localization) && has('locale'),
    trash: Boolean(collectionConfig?.trash) && has('trash'),
  }
  const idArg = field.args?.find((arg) => arg.name === 'id')
  const variableTypes: [string, string][] = [
    ...(idArg ? [['id', idArg.type.toString()] as [string, string]] : []),
    ...(args.draft ? [['draft', 'Boolean'] as [string, string]] : []),
    ...(args.locale
      ? [
          [
            'locale',
            named(field.args!.find((a) => a.name === 'locale')!.type).name ?? 'String',
          ] as [string, string],
        ]
      : []),
    ...(args.fallbackLocale
      ? [
          [
            'fallbackLocale',
            named(field.args!.find((a) => a.name === 'fallbackLocale')!.type).name ?? 'String',
          ] as [string, string],
        ]
      : []),
    ...(args.trash ? [['trash', 'Boolean'] as [string, string]] : []),
  ]
  const definitions = variableTypes.map(([name, type]) => `$${name}: ${type}`).join(', ')
  const callArgs = variableTypes.map(([name]) => `${name}: $${name}`).join(', ')
  const documents = documentTypeNames(payload)
  const operation = `Get${fieldName}`

  const queries = Array.from({ length: MAX_GRAPHQL_DEPTH + 1 }, (_, depth) =>
    [
      `query ${operation}${definitions ? `(${definitions})` : ''} {`,
      `  ${fieldName}${callArgs ? `(${callArgs})` : ''} {`,
      ...selection(field.type, depth, documents, '    '),
      '  }',
      '}',
    ].join('\n'),
  )
  const idType = idArg?.type.toString()
  const depthValidation = queries.map((query, depth): GraphQLDepthValidation => {
    const errors = validateGeneratedQuery(query, schemaBuild, idType)
    return { depth, errors, valid: errors.length === 0 }
  })
  const result: GraphQLDocumentQuery = {
    field: fieldName,
    queries,
    selectableDepths: depthValidation.filter(({ valid }) => valid).map(({ depth }) => depth),
    depthValidation,
    args,
    idType,
  }
  return cacheDocumentQuery(payload, entity, result)
}
