import { configToSchema } from '@payloadcms/graphql'
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

const schemas = new WeakMap<object, SchemaLike>()

/** Payload's GraphQL schema for the running config, built once per config (as /api/graphql does). */
function schemaFor(payload: Payload): SchemaLike {
  let schema = schemas.get(payload.config)
  if (!schema) {
    schema = configToSchema(payload.config).schema as unknown as SchemaLike
    schemas.set(payload.config, schema)
  }
  return schema
}

const named = (type: TypeLike): TypeLike => (type.ofType ? named(type.ofType) : type)
const isRequired = (type: TypeLike) => type.toString().endsWith('!')
const isComposite = (type: TypeLike) => Boolean(type.getFields || type.getTypes)

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
): string[] {
  const target = named(type)
  if (nesting > 12) return [`${indent}__typename`]
  if (target.getTypes) {
    return [
      `${indent}__typename`,
      ...target
        .getTypes()
        .flatMap((member) => [
          `${indent}... on ${member.name} {`,
          ...selection(member, depth, documents, `${indent}  `, nesting + 1),
          `${indent}}`,
        ]),
    ]
  }
  const lines: string[] = []
  for (const field of Object.values(target.getFields?.() ?? {})) {
    if (field.args?.some((arg) => isRequired(arg.type))) continue
    const fieldType = named(field.type)
    if (!isComposite(fieldType)) {
      lines.push(`${indent}${field.name}`)
      continue
    }
    const members = fieldType.getTypes?.() ?? [fieldType]
    const isRelationship = members.every((member) => documents.has(member.name ?? ''))
    if (isRelationship && depth <= 0) {
      lines.push(
        `${indent}${field.name} {`,
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
    if (inner.length > 0) lines.push(`${indent}${field.name} {`, ...inner, `${indent}}`)
  }
  return lines
}

export type GraphQLDocumentQuery = {
  /** Query field, e.g. `Article` or `Footer`. */
  field: string
  /** One query text per depth, 0 to MAX_GRAPHQL_DEPTH. */
  queries: string[]
  /** Which optional arguments the query takes (the view only sends those). */
  args: { draft: boolean; fallbackLocale: boolean; locale: boolean; trash: boolean }
  /** GraphQL type of the `id` argument (collections only), e.g. `Int!`. */
  idType?: string
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
  if (!entity || entity.graphQL === false) return null

  const queryFields = schemaFor(payload).getQueryType()?.getFields() ?? {}
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
  if (!field || !fieldName) return null

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
  return { field: fieldName, queries, args, idType: idArg?.type.toString() }
}
