import type { ListViewServerProps } from 'payload'
import { DefaultListView } from '@payloadcms/ui'
import React from 'react'

import type { PayloadColumn } from './DataTable'
import { LazyDataTable } from './DataTableLazy'

/** Server-only props Payload adds to list views; they must not reach the client list view. */
const SERVER_ONLY = [
  'collectionConfig',
  'data',
  'i18n',
  'limit',
  'listSearchableFields',
  'locale',
  'params',
  'payload',
  'permissions',
  'searchParams',
  'user',
] as const

type PayloadTableProps = {
  appearance?: 'condensed' | 'default'
  columns?: PayloadColumn[]
  data: Record<string, unknown>[]
}

/**
 * Finds Payload's plain table inside the list view's `Table` prop: `<div.table-wrap><Table/></div>`.
 * Grouped lists (wrapper has extra classes and a selection provider) and orderable lists (the inner
 * table has a `collection` prop and drag handles) return null, so Payload keeps rendering those.
 */
function findPayloadTable(node: React.ReactNode): PayloadTableProps | null {
  if (!React.isValidElement<{ className?: string; children?: React.ReactNode }>(node)) return null
  if (node.props.className !== 'table-wrap') return null
  const inner = node.props.children
  if (!React.isValidElement<Record<string, unknown>>(inner)) return null
  const props = inner.props
  if (!Array.isArray(props.columns) || !Array.isArray(props.data) || 'collection' in props)
    return null
  return props as unknown as PayloadTableProps
}

/**
 * List view (ADR 0007): Payload's DefaultListView keeps the toolbar, search, filters, column
 * picker, bulk actions, pagination and URL state; only the table is swapped for a TanStack Table
 * (v9) instance that renders Payload's own headings (sorting) and cells (links, selection, custom
 * cells). Collections opt out with `custom: { tanstackList: false }` (see the adminUI plugin).
 */
export function TanStackListView(props: ListViewServerProps) {
  const clientProps = { ...props } as Record<string, unknown>
  for (const key of SERVER_ONLY) delete clientProps[key]
  const listProps = clientProps as unknown as React.ComponentProps<typeof DefaultListView>

  const table = findPayloadTable(props.Table)
  if (!table?.columns) return <DefaultListView {...listProps} />

  return (
    <DefaultListView
      {...listProps}
      Table={
        <div className="table-wrap">
          <LazyDataTable
            appearance={table.appearance}
            collectionSlug={props.collectionSlug}
            columns={table.columns}
            data={table.data}
          />
        </div>
      }
    />
  )
}

export default TanStackListView
