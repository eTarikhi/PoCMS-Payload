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

import { cn } from '../lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

export type PayloadColumn = Pick<Column, 'accessor' | 'active' | 'Heading' | 'renderedCells'>
type Row = Record<string, unknown> & { id?: number | string }

const features = tableFeatures({ columnVisibilityFeature })

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
  return (
    <div
      data-slot="data-table"
      data-collection={collectionSlug}
      className="acn:overflow-hidden acn:rounded-lg acn:border acn:border-border"
    >
      <Table className={cn(condensed && 'acn:text-xs')}>
        <TableHeader className="acn:bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="acn:hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
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
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const isSelected =
              row.original.id !== undefined && Boolean(selected.get(row.original.id))
            return (
              <TableRow
                key={row.id}
                data-id={row.original.id as string | number | undefined}
                data-state={isSelected ? 'selected' : undefined}
                className={`row-${row.index + 1}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      `cell-${domKey(cell.column.id)}`,
                      condensed ? 'acn:py-1.5' : 'acn:py-2.5',
                      cell.column.id === '_select' && 'acn:w-10',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
