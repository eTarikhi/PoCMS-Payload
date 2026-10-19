import type { CollectionConfig, DocumentTabCondition, Field, GlobalConfig, Plugin } from 'payload'

const LIST_VIEW = '/components/admin/views/List#TanStackListView'
const BOOLEAN_CELL = '/components/admin/fields/Checkbox/Cell#BooleanCell'
const LIST_SUMMARY = '/components/admin/views/List/ListSummary#ListSummary'
const GRAPHQL_VIEW = '/components/admin/views/GraphQL#GraphQLDocumentView'

/** Same rule as Payload's API tab (hidden by `admin.hideAPIURL`), plus GraphQL being enabled. */
const showGraphQLTab: DocumentTabCondition = ({ collectionConfig, config, globalConfig }) => {
  const entity = collectionConfig ?? globalConfig
  return (
    Boolean(entity) &&
    !config.graphQL?.disable &&
    entity?.graphQL !== false &&
    !entity?.admin?.hideAPIURL
  )
}

/**
 * Adds the GraphQL document tab next to Payload's API tab (order 400), unless the collection or
 * global sets `custom: { graphqlTab: false }`.
 */
function withGraphQLTab<T extends CollectionConfig | GlobalConfig>(entity: T): T['admin'] {
  if (entity.custom?.graphqlTab === false) return entity.admin
  const components = entity.admin?.components
  return {
    ...entity.admin,
    components: {
      ...components,
      views: {
        ...components?.views,
        edit: {
          ...components?.views?.edit,
          graphql: {
            Component: GRAPHQL_VIEW,
            path: '/graphql',
            tab: { condition: showGraphQLTab, href: '/graphql', label: 'GraphQL', order: 450 },
          },
        },
      },
    },
  } as T['admin']
}

/** Adds the boolean list cell to checkbox fields that have no Cell of their own (any nesting). */
function withBooleanCells(fields: Field[]): Field[] {
  return fields.map((field) => {
    if (field.type === 'checkbox') {
      if (field.admin?.components?.Cell) return field
      return {
        ...field,
        admin: { ...field.admin, components: { ...field.admin?.components, Cell: BOOLEAN_CELL } },
      }
    }
    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) => ({ ...tab, fields: withBooleanCells(tab.fields) })),
      }
    }
    if ('fields' in field && Array.isArray(field.fields)) {
      return { ...field, fields: withBooleanCells(field.fields) } as Field
    }
    return field
  })
}

/** Collections keep Payload's list when they opt out, define their own list view, or are orderable. */
function usesTanStackList(collection: CollectionConfig): boolean {
  if (collection.custom?.tanstackList === false) return false
  if (collection.orderable) return false
  return !collection.admin?.components?.views?.list?.Component
}

/** Adds the list summary above the table, unless the collection sets `custom: { listSummary: false }`. */
const withListSummary = (collection: CollectionConfig): CollectionConfig['admin'] => {
  if (collection.custom?.listSummary === false) return collection.admin
  const components = collection.admin?.components
  return {
    ...collection.admin,
    components: {
      ...components,
      beforeListTable: [LIST_SUMMARY, ...(components?.beforeListTable ?? [])],
    },
  }
}

/**
 * Admin UI conventions applied to every collection and global (ADR 0007), so new ones get them
 * without extra config: the TanStack list view, boolean cells, the list summary and the GraphQL
 * document tab. Opt out with `custom: { tanstackList: false }`, `custom: { listSummary: false }` or
 * `custom: { graphqlTab: false }`.
 */
export const adminUIPlugin = (): Plugin => (config) => ({
  ...config,
  globals: (config.globals ?? []).map((global) => ({ ...global, admin: withGraphQLTab(global) })),
  collections: (config.collections ?? []).map((collection) => {
    const withTab: CollectionConfig = { ...collection, admin: withGraphQLTab(collection) }
    const next: CollectionConfig = {
      ...withTab,
      fields: withBooleanCells(collection.fields),
      admin: withListSummary(withTab),
    }
    if (!usesTanStackList(collection)) return next
    return {
      ...next,
      admin: {
        ...next.admin,
        components: {
          ...next.admin?.components,
          views: {
            ...next.admin?.components?.views,
            list: { ...next.admin?.components?.views?.list, Component: LIST_VIEW },
          },
        },
      },
    }
  }),
})
