'use client'

import type { Column } from 'payload'
import { useSelection } from '@payloadcms/ui'
import {
  columnVisibilityFeature,
  flexRender,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'
import React, { useMemo } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { cn } from '@/components/admin/utilities/cn'

export type PayloadColumn = Pick<Column, 'accessor' | 'active' | 'Heading' | 'renderedCells'> &
  Partial<Pick<Column, 'field'>>
type Row = Record<string, unknown> & { id?: number | string }

const features = tableFeatures({ columnVisibilityFeature })

/**
 * Plain-text column name for the phone card layout (`data-label`): the field label, else the
 * accessor in words ("publishedAt" -> "Published at").
 */
const labelOf = (column: PayloadColumn): string => {
  const label = (column.field as { label?: unknown } | undefined)?.label
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, string>
    return record.en ?? Object.values(record)[0] ?? column.accessor
  }
  const words = column.accessor.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Text naming a row (its title cell's value when that is plain text, else its id). */
const rowName = (row: Row, primaryId: string | undefined): string => {
  const value = primaryId ? row[primaryId] : undefined
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return row.id === undefined ? '' : String(row.id)
}

/** Payload's ids and classes, kept for tests and Payload's own column-width rules. */
const domKey = (accessor: string) => accessor.replace(/\./g, '__')

/**
 * Headless TanStack Table v9 over the rows Payload already fetched (server-side sort, filters and
 * pagination stay in Payload's URL state). Headings and cells are the nodes Payload rendered on the
 * server, so sorting, links, drawer selection and custom Cell components keep working.
 */
export function DataTable({
  appearance = 'default',
  collectionSlug,
  columns,
  data,
}: {
  appearance?: 'condensed' | 'default'
  collectionSlug: string
  columns: PayloadColumn[]
  data: Row[]
}) {
  const { selected } = useSelection()

  const columnDefs = useMemo<ColumnDef<typeof features, Row>[]>(
    () =>
      columns.map((column) => ({
        id: column.accessor,
        meta: { label: column.accessor === '_select' ? undefined : labelOf(column) },
        header: () => column.Heading,
        cell: ({ row }) => column.renderedCells?.[row.index] ?? null,
      })),
    [columns],
  )
  const columnVisibility = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.accessor, column.active !== false])),
    [columns],
  )

  const table = useTable({
    features,
    columns: columnDefs,
    data,
    state: { columnVisibility },
    getRowId: (row, index) => String(row.id ?? index),
  })

  const condensed = appearance === 'condensed'
  // On phones each row becomes a card: the first data column is its title (see responsive.css).
  const primaryId = columns.find(
    (column) => column.accessor !== '_select' && column.active !== false,
  )?.accessor
  return (
    <div
      data-slot="data-table"
      data-collection={collectionSlug}
      className="acn:overflow-hidden acn:rounded-lg acn:border acn:border-border acn:bg-card"
    >
      {/* Explicit roles: the phone card layout (responsive.css) changes the table's display, which
          can drop native table semantics in some browsers. */}
      <Table role="table" className={cn(condensed && 'acn:text-xs')}>
        <TableHeader role="rowgroup" className="acn:bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} role="row" className="acn:hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  role="columnheader"
                  id={`heading-${domKey(header.column.id)}`}
                  className={cn(
                    'acn:font-medium acn:text-muted-foreground',
                    header.column.id === '_select' && 'acn:w-10',
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody role="rowgroup">
          {table.getRowModel().rows.map((row) => {
            const isSelected =
              row.original.id !== undefined && Boolean(selected.get(row.original.id))
            return (
              <TableRow
                key={row.id}
                role="row"
                data-id={row.original.id as string | number | undefined}
                data-state={isSelected ? 'selected' : undefined}
                className={`row-${row.index + 1}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    role="cell"
                    data-label={
                      (cell.column.columnDef.meta as { label?: string } | undefined)?.label
                    }
                    data-primary={cell.column.id === primaryId || undefined}
                    className={cn(
                      `cell-${domKey(cell.column.id)}`,
                      condensed ? 'acn:py-1.5' : 'acn:py-2.5',
                      cell.column.id === '_select' && 'acn:w-10',
                    )}
                  >
                    {cell.column.id === '_select' ? (
                      // Payload's row checkbox has an empty aria-label; a wrapping label names it
                      // after the row (an empty aria-label is ignored for the accessible name).
                      <label className="acn:flex acn:items-center">
                        <span className="acn:sr-only">
                          Select {rowName(row.original, primaryId)}
                        </span>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </label>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
