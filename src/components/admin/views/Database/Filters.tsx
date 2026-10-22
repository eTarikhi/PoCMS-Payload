'use client'

import { FilterIcon, XIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/admin/elements/Button'
import { Input } from '@/components/admin/elements/Input'
import {
  FILTER_LABELS,
  FILTER_OPERATORS,
  filterParam,
  type FilterOperator,
  type RowFilter,
} from '@/plugins/databaseTools/server/filters'

import { tableHref } from './tableHref'

/**
 * The filter bar above the rows.
 *
 * A plain GET form cannot build `f=column:operator:value` from three separate fields, so this is a
 * small client component that assembles the URL and pushes it — the server component then reads the
 * filters from `searchParams` like any other link. Existing filters are kept (a table can be narrowed
 * by more than one condition) and the sort travels along with them, because dropping it when a filter
 * changes would move the rows the admin was reading.
 */
export function TableFilters({
  pageBase,
  table,
  columns,
  current,
  sort,
  direction,
}: {
  pageBase: string
  table: string
  columns: { name: string }[]
  current: RowFilter[]
  sort: string | null
  direction: 'asc' | 'desc'
}) {
  const router = useRouter()
  const [column, setColumn] = React.useState(current[0]?.column ?? columns[0]?.name ?? '')
  const [operator, setOperator] = React.useState<FilterOperator>(
    current[0]?.operator ?? 'contains',
  )
  const [value, setValue] = React.useState(current[0]?.value ?? '')

  const needsValue = FILTER_LABELS[operator].needsValue

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!column) return
    const next = [
      ...current.filter((filter) => !(filter.column === column && filter.operator === operator)),
      { column, operator, value: needsValue ? value : undefined },
    ]
    router.push(tableHref(pageBase, table, { sort, direction, filters: next }))
  }

  const selectClass =
    'acn:h-8 acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2 acn:text-xs'

  return (
    <form
      onSubmit={submit}
      className="acn:flex acn:flex-wrap acn:items-end acn:gap-2 acn:rounded-lg acn:border acn:border-border acn:p-2"
      aria-label="Filter rows"
    >
      <label className="acn:flex acn:flex-col acn:gap-1 acn:text-xs">
        <span className="acn:text-muted-foreground">Column</span>
        <select
          value={column}
          onChange={(event) => setColumn(event.target.value)}
          className={selectClass}
          aria-label="Filter column"
        >
          {columns.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <label className="acn:flex acn:flex-col acn:gap-1 acn:text-xs">
        <span className="acn:text-muted-foreground">Condition</span>
        <select
          value={operator}
          onChange={(event) => setOperator(event.target.value as FilterOperator)}
          className={selectClass}
          aria-label="Filter condition"
        >
          {FILTER_OPERATORS.map((entry) => (
            <option key={entry} value={entry}>
              {FILTER_LABELS[entry].label}
            </option>
          ))}
        </select>
      </label>
      {needsValue ? (
        <label className="acn:flex acn:flex-col acn:gap-1 acn:text-xs">
          <span className="acn:text-muted-foreground">Value</span>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="value"
            aria-label="Filter value"
            className="acn:h-8 acn:w-48 acn:text-xs"
          />
        </label>
      ) : null}
      <Button size="sm" variant="outline" type="submit" disabled={needsValue && value.length === 0}>
        <FilterIcon aria-hidden />
        Filter
      </Button>
    </form>
  )
}

/** The chips under the bar: each removes itself, keeping the other filters and the sort. */
export function ActiveFilters({
  pageBase,
  table,
  filters,
  sort,
  direction,
}: {
  pageBase: string
  table: string
  filters: RowFilter[]
  sort: string | null
  direction: 'asc' | 'desc'
}) {
  const router = useRouter()
  if (filters.length === 0) return null

  const without = (filter: RowFilter) => {
    const next = filters.filter((other) => other !== filter)
    router.push(tableHref(pageBase, table, { sort, direction, filters: next }))
  }

  return (
    <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1.5">
      <span className="acn:text-xs acn:text-muted-foreground">Filters:</span>
      {filters.map((filter) => (
        <Button
          key={filterParam(filter)}
          size="xs"
          variant="secondary"
          type="button"
          onClick={() => without(filter)}
          title="Remove this filter"
        >
          <span className="acn:font-mono">{filter.column}</span>
          <span>
            {FILTER_LABELS[filter.operator].label}
            {filter.value ? ` “${filter.value}”` : ''}
          </span>
          <XIcon aria-hidden />
          <span className="acn:sr-only">Remove filter</span>
        </Button>
      ))}
    </div>
  )
}
