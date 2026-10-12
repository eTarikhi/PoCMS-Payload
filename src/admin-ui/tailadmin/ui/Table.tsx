import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

/**
 * Ported from TailAdmin Free `src/components/ui/table/index.tsx`.
 * Identical API (`isHeader` switches between `<th>` and `<td>`), with `cn()`
 * class composition added.
 */
export type TableProps = { children: ReactNode; className?: string }

export function Table({ children, className }: TableProps) {
  return <table className={cn('min-w-full', className)}>{children}</table>
}

export function TableHeader({ children, className }: TableProps) {
  return <thead className={className}>{children}</thead>
}

export function TableBody({ children, className }: TableProps) {
  return <tbody className={className}>{children}</tbody>
}

export function TableRow({ children, className }: TableProps) {
  return <tr className={className}>{children}</tr>
}

export type TableCellProps = TableProps & { isHeader?: boolean; colSpan?: number }

export function TableCell({ children, isHeader = false, className, colSpan }: TableCellProps) {
  const CellTag = isHeader ? 'th' : 'td'
  return (
    <CellTag className={cn(className)} colSpan={colSpan} scope={isHeader ? 'col' : undefined}>
      {children}
    </CellTag>
  )
}
