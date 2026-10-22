import Link from 'next/link'

import { Badge } from '@/components/admin/elements/Badge'
import { buttonVariants } from '@/components/admin/elements/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { formatBytes } from '@/system/status'
import type { SortDirection } from '@/plugins/databaseTools/server/filters'
import {
  ROW_PAGE_SIZE,
  type RowPage,
  type TableDetail,
} from '@/plugins/databaseTools/server/introspection'
import type { QueryPlan } from '@/plugins/databaseTools/server/plans'

import { MaintenanceButtons } from './Actions'
import { ActiveFilters, TableFilters } from './Filters'
import { apiQuery, tableHref } from './tableHref'

/**
 * One table: its columns, indexes and constraints, then a read-only page of rows.
 *
 * Read-only on purpose. Editing a row from here would bypass every hook and access rule the content
 * has (validation, audit log, revalidation); the collections are the place to change content. The
 * page says so rather than offering an edit box that would quietly break those guarantees.
 */

const MAX_CELL = 120

/** A cell value as something readable: JSON on one line, long text cut, null called out. */
export function cellText(value: unknown): { text: string; muted: boolean } {
  if (value === null || value === undefined) return { text: 'null', muted: true }
  if (typeof value === 'string') {
    return { text: value.length > MAX_CELL ? `${value.slice(0, MAX_CELL)}…` : value, muted: false }
  }
  if (typeof value === 'number' || typeof value === 'boolean')
    return { text: String(value), muted: false }
  const json = JSON.stringify(value)
  return {
    text: json.length > MAX_CELL ? `${json.slice(0, MAX_CELL)}…` : json,
    muted: false,
  }
}

export function TableBrowser({
  detail,
  ddl,
  plan,
  page,
  adminRoute,
  apiBase,
}: {
  detail: TableDetail
  ddl?: { sql: string; unsignedTypes: string[] } | null
  plan?: QueryPlan | null
  page: RowPage
  adminRoute: string
  apiBase: string
}) {
  const { table, columns, indexes, constraints } = detail
  const from = page.total === 0 ? 0 : page.offset + 1
  const to = Math.min(page.offset + page.rows.length, page.total)
  const rowColumns =
    page.rows.length > 0 ? Object.keys(page.rows[0]) : columns.map((column) => column.name)
  const pageBase = `${adminRoute}/database`
  const filtered = page.filters.length > 0
  const sortedBy = (name: string) => (page.sort === name ? page.direction : null)
  const toggleSort = (name: string): SortDirection =>
    page.sort === name && page.direction === 'asc' ? 'desc' : 'asc'

  return (
    <div className="acn:flex acn:flex-col acn:gap-5">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
        <Badge variant="outline" className="acn:font-mono">
          public.{table.name}
        </Badge>
        <span className="acn:text-xs acn:text-muted-foreground">
          {table.rows.toLocaleString('en')} rows (estimate) · {formatBytes(table.bytes)} ·{' '}
          {columns.length} columns · {indexes.length} indexes
        </span>
        <span
          className="acn:text-xs acn:text-muted-foreground"
          title="Where the bytes are: the heap VACUUM FULL would rewrite, and the indexes REINDEX would"
        >
          {formatBytes(table.heapBytes)} heap · {formatBytes(table.indexBytes)} indexes
        </span>
        <a
          className={buttonVariants({ size: 'xs', variant: 'outline' })}
          href={`${apiBase}/table?${apiQuery(page, { table: table.name, format: 'csv' })}`}
        >
          Export CSV
        </a>
        {filtered ? (
          <Badge variant="secondary">{page.total.toLocaleString('en')} matching</Badge>
        ) : null}
        {filtered || page.sort ? (
          <Link
            className="acn:text-xs acn:text-primary acn:hover:underline"
            href={tableHref(pageBase, table.name)}
          >
            Clear filters{page.sort ? ' and sort' : ''}
          </Link>
        ) : null}
        {table.deadRows > 0 ? (
          <Badge variant="outline">{table.deadRows.toLocaleString('en')} dead rows</Badge>
        ) : null}
      </div>

      <div className="acn:grid acn:gap-4 acn:lg:grid-cols-[1.4fr_1fr]">
        <div className="acn:min-w-0">
          <h3 className="acn:m-0 acn:mb-2 acn:text-sm acn:font-medium">Columns</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Null</TableHead>
                <TableHead>Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columns.map((column) => (
                <TableRow key={column.name}>
                  <TableCell className="acn:font-mono acn:text-xs">
                    {column.name}
                    {column.primaryKey ? (
                      <Badge variant="secondary" className="acn:ml-1.5">
                        PK
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="acn:font-mono acn:text-xs">{column.type}</TableCell>
                  <TableCell className="acn:text-xs">{column.nullable ? 'yes' : 'no'}</TableCell>
                  <TableCell className="acn:max-w-48 acn:truncate acn:font-mono acn:text-xs acn:text-muted-foreground">
                    {column.default ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="acn:flex acn:min-w-0 acn:flex-col acn:gap-4">
          <div>
            <h3 className="acn:m-0 acn:mb-2 acn:text-sm acn:font-medium">Indexes</h3>
            <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:gap-1 acn:p-0 acn:text-xs">
              {indexes.map((index) => (
                <li
                  key={index.name}
                  className="acn:flex acn:items-start acn:justify-between acn:gap-2"
                >
                  <span className="acn:font-mono acn:break-all acn:text-muted-foreground">
                    {index.name}
                  </span>
                  <span className="acn:flex acn:shrink-0 acn:items-center acn:gap-1">
                    {index.primary ? <Badge variant="secondary">PK</Badge> : null}
                    {index.unique && !index.primary ? (
                      <Badge variant="outline">unique</Badge>
                    ) : null}
                    {index.valid ? null : <Badge variant="destructive">invalid</Badge>}
                    <span className="acn:text-muted-foreground">{formatBytes(index.bytes)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="acn:m-0 acn:mb-2 acn:text-sm acn:font-medium">Constraints</h3>
            {constraints.length === 0 ? (
              <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">None.</p>
            ) : (
              <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:gap-1 acn:p-0 acn:text-xs">
                {constraints.map((constraint) => (
                  <li key={constraint.name} className="acn:flex acn:flex-col">
                    <span className="acn:font-mono">{constraint.name}</span>
                    <span className="acn:break-all acn:text-muted-foreground">
                      {constraint.definition}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="acn:flex acn:flex-col acn:gap-2">
        <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
          <h3 className="acn:m-0 acn:text-sm acn:font-medium">
            Rows{' '}
            <span className="acn:font-normal acn:text-muted-foreground">
              {from.toLocaleString('en')}–{to.toLocaleString('en')} of{' '}
              {page.total.toLocaleString('en')}
              {filtered ? ' matching' : ''}
            </span>
          </h3>
          <div className="acn:flex acn:gap-1">
            {page.offset === 0 ? (
              <span
                className={buttonVariants({
                  size: 'xs',
                  variant: 'outline',
                  className: 'acn:pointer-events-none acn:opacity-50',
                })}
              >
                Previous
              </span>
            ) : (
              <Link
                className={buttonVariants({ size: 'xs', variant: 'outline' })}
                href={tableHref(pageBase, table.name, {
                  offset: Math.max(0, page.offset - ROW_PAGE_SIZE),
                  sort: page.sort,
                  direction: page.direction,
                  filters: page.filters,
                })}
              >
                Previous
              </Link>
            )}
            {to >= page.total ? (
              <span
                className={buttonVariants({
                  size: 'xs',
                  variant: 'outline',
                  className: 'acn:pointer-events-none acn:opacity-50',
                })}
              >
                Next
              </span>
            ) : (
              <Link
                className={buttonVariants({ size: 'xs', variant: 'outline' })}
                href={tableHref(pageBase, table.name, {
                  offset: page.offset + ROW_PAGE_SIZE,
                  sort: page.sort,
                  direction: page.direction,
                  filters: page.filters,
                })}
              >
                Next
              </Link>
            )}
          </div>
        </div>

        <TableFilters
          pageBase={pageBase}
          table={table.name}
          columns={columns}
          current={page.filters}
          sort={page.sort}
          direction={page.direction}
        />
        <ActiveFilters
          pageBase={pageBase}
          table={table.name}
          filters={page.filters}
          sort={page.sort}
          direction={page.direction}
        />
        {page.ignoredFilters.length > 0 ? (
          <p className="acn:m-0 acn:text-xs acn:text-destructive">
            No column called {page.ignoredFilters.join(', ')}; that filter was ignored.
          </p>
        ) : null}

        {page.rows.length === 0 ? (
          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
            {filtered ? 'No row matches these filters.' : 'The table is empty.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {rowColumns.map((column) => {
                  const direction = sortedBy(column)
                  return (
                    <TableHead key={column} className="acn:font-mono acn:text-xs">
                      <Link
                        className="acn:inline-flex acn:items-center acn:gap-1 acn:hover:underline"
                        href={tableHref(pageBase, table.name, {
                          sort: column,
                          direction: toggleSort(column),
                          filters: page.filters,
                        })}
                        title={
                          direction
                            ? `Sorted ${direction === 'asc' ? 'ascending' : 'descending'}; click for the other`
                            : 'Sort by this column'
                        }
                      >
                        {column}
                        <span aria-hidden className="acn:text-muted-foreground">
                          {direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}
                        </span>
                      </Link>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row, index) => (
                <TableRow key={index}>
                  {rowColumns.map((column) => {
                    const cell = cellText(row[column])
                    return (
                      <TableCell
                        key={column}
                        className={
                          cell.muted
                            ? 'acn:max-w-64 acn:truncate acn:font-mono acn:text-xs acn:text-muted-foreground'
                            : 'acn:max-w-64 acn:truncate acn:font-mono acn:text-xs'
                        }
                        title={cell.text}
                      >
                        {cell.text}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
          Read-only: content changes go through the collections, so validation, the audit log and
          cache revalidation still apply. Values are cut at {MAX_CELL} characters.
        </p>
      </div>

      <div>
        <h3 className="acn:m-0 acn:mb-2 acn:text-sm acn:font-medium">Maintenance for this table</h3>
        <MaintenanceButtons table={table.name} />
      </div>

      {ddl ? (
        <details className="acn:rounded-lg acn:border acn:border-border">
          <summary className="acn:cursor-pointer acn:p-3 acn:text-sm acn:font-medium acn:select-none">
            Schema (DDL)
            <span className="acn:ml-2 acn:text-xs acn:font-normal acn:text-muted-foreground">
              the table as Postgres describes it — columns, constraints, indexes
            </span>
          </summary>
          <div className="acn:space-y-2 acn:border-t acn:border-border acn:p-3">
            <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
              <a
                className={buttonVariants({ size: 'xs', variant: 'outline' })}
                href={`${apiBase}/table?table=${encodeURIComponent(table.name)}&format=ddl`}
              >
                Download .sql
              </a>
              <span className="acn:text-xs acn:text-muted-foreground">
                A description, not a migration: no{' '}
                <code className="acn:font-mono">CREATE TYPE</code> for enums, no ownership or
                grants.
              </span>
            </div>
            <pre className="acn:m-0 acn:max-h-96 acn:overflow-auto acn:rounded-md acn:bg-muted acn:p-3 acn:font-mono acn:text-xs">
              {ddl.sql}
            </pre>
          </div>
        </details>
      ) : null}

      {plan ? (
        <details className="acn:rounded-lg acn:border acn:border-border">
          <summary className="acn:cursor-pointer acn:p-3 acn:text-sm acn:font-medium acn:select-none">
            Query plan
            <span className="acn:ml-2 acn:text-xs acn:font-normal acn:text-muted-foreground">
              what Postgres will do for this page — filter, order, limit
            </span>
          </summary>
          <div className="acn:space-y-2 acn:border-t acn:border-border acn:p-3">
            <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
              <a
                className={buttonVariants({ size: 'xs', variant: 'outline' })}
                href={`${apiBase}/table?table=${encodeURIComponent(table.name)}&format=plan`}
              >
                Open as JSON
              </a>
              <span className="acn:text-xs acn:text-muted-foreground">
                <code className="acn:font-mono">EXPLAIN</code> without{' '}
                <code className="acn:font-mono">ANALYZE</code>: the planner&rsquo;s estimate,
                nothing is executed.
              </span>
            </div>
            {plan.notes.length > 0 ? (
              <ul className="acn:m-0 acn:list-disc acn:space-y-1 acn:pl-4 acn:text-xs">
                {plan.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            <ul className="acn:m-0 acn:list-none acn:space-y-0.5 acn:rounded-md acn:bg-muted acn:p-3 acn:font-mono acn:text-xs">
              {plan.nodes.map((node, index) => (
                <li key={`${node.type}-${index}`} style={{ paddingLeft: `${node.depth * 14}px` }}>
                  <span className="acn:font-medium">{node.type}</span>
                  {node.relation ? ` on ${node.relation}` : ''}
                  {node.index ? ` using ${node.index}` : ''}{' '}
                  <span className="acn:text-muted-foreground">
                    ≈{node.rows.toLocaleString('en')} rows · cost {node.cost}
                  </span>
                  {node.detail ? (
                    <div className="acn:truncate acn:text-muted-foreground" title={node.detail}>
                      {node.detail}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <pre className="acn:m-0 acn:max-h-40 acn:overflow-auto acn:rounded-md acn:border acn:border-border acn:p-3 acn:font-mono acn:text-xs">
              {plan.sql}
            </pre>
          </div>
        </details>
      ) : null}
    </div>
  )
}
