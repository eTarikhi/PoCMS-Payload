import Link from 'next/link'

import type { CollectionStat } from '../data/types'
import { ArrowUpRightIcon } from '../icons'
import { formatCount } from '../lib/format'
import { Badge } from '../ui/Badge'
import { ComponentCard } from '../ui/Card'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table'

/**
 * "Content by collection" — TailAdmin Free `RecentOrders` table styling with
 * Payload's real per-collection document counts and a relative volume bar.
 *
 * Server component: no interactivity is needed, so nothing is shipped to the
 * browser beyond markup.
 */
export type CollectionBreakdownProps = {
  stats: CollectionStat[]
  locale?: string
  className?: string
}

export default function CollectionBreakdown({ stats, locale, className }: CollectionBreakdownProps) {
  const max = stats.reduce((highest, stat) => Math.max(highest, stat.count ?? 0), 0)

  return (
    <ComponentCard
      title="Content by collection"
      desc="Document counts for every collection you have read access to."
      className={className}
      action={
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/3 dark:hover:text-gray-200"
        >
          Payload view
          <ArrowUpRightIcon size={16} />
        </Link>
      }
    >
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Collection
              </TableCell>
              <TableCell
                isHeader
                className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Group
              </TableCell>
              <TableCell
                isHeader
                className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Volume
              </TableCell>
              <TableCell
                isHeader
                className="py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Documents
              </TableCell>
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-theme-sm text-gray-500">
                  No readable collections found.
                </TableCell>
              </TableRow>
            ) : null}

            {stats.map((stat) => {
              const percent = max > 0 && stat.count !== null ? Math.round((stat.count / max) * 100) : 0
              return (
                <TableRow key={stat.slug}>
                  <TableCell className="py-3">
                    <Link href={stat.href} className="group inline-flex items-center gap-2">
                      <span className="text-theme-sm font-medium text-gray-800 group-hover:text-brand-500 dark:text-white/90 dark:group-hover:text-brand-400">
                        {stat.label}
                      </span>
                      <span className="text-theme-xs text-gray-400 dark:text-gray-500">
                        {stat.slug}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                    {stat.group ? <Badge size="sm" color="light">{stat.group}</Badge> : '—'}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(percent, stat.count ? 3 : 0)}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-end text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {stat.error ? (
                      <Badge size="sm" color="error">
                        unavailable
                      </Badge>
                    ) : (
                      formatCount(stat.count, locale)
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </ComponentCard>
  )
}
