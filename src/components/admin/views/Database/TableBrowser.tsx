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
import { ROW_PAGE_SIZE, type TableDetail } from '@/database/introspection'

import { MaintenanceButtons } from './Actions'

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
  page,
  adminRoute,
}: {
  detail: TableDetail
  page: { rows: Record<string, unknown>[]; total: number; offset: number }
  adminRoute: string
}) {
  const { table, columns, indexes, constraints } = detail
  const from = page.total === 0 ? 0 : page.offset + 1
  const to = Math.min(page.offset + page.rows.length, page.total)
  const rowColumns =
    page.rows.length > 0 ? Object.keys(page.rows[0]) : columns.map((column) => column.name)

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
                href={`${adminRoute}/database?table=${encodeURIComponent(table.name)}&offset=${Math.max(
                  0,
                  page.offset - ROW_PAGE_SIZE,
                )}`}
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
                href={`${adminRoute}/database?table=${encodeURIComponent(table.name)}&offset=${
                  page.offset + ROW_PAGE_SIZE
                }`}
              >
                Next
              </Link>
            )}
          </div>
        </div>

        {page.rows.length === 0 ? (
          <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">The table is empty.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {rowColumns.map((column) => (
                  <TableHead key={column} className="acn:font-mono acn:text-xs">
                    {column}
                  </TableHead>
                ))}
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
    </div>
  )
}
