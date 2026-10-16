import type { CollectionConfig, Field, Plugin } from 'payload'

const LIST_VIEW = '/components/admin/list/TanStackListView#TanStackListView'
const BOOLEAN_CELL = '/components/admin/list/cells/BooleanCell#BooleanCell'

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

/**
 * Admin UI conventions applied to every collection (ADR 0007), so new collections get them without
 * extra config: the TanStack list view and boolean cells. Collections opt out of the list view with
 * `custom: { tanstackList: false }`.
 */
export const adminUIPlugin = (): Plugin => (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) => {
    const next: CollectionConfig = { ...collection, fields: withBooleanCells(collection.fields) }
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
