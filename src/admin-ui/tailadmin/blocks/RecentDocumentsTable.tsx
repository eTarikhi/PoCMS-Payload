import Link from 'next/link'

import type { RecentDocument } from '../data/types'
import { relativeTime } from '../lib/format'
import { Badge } from '../ui/Badge'
import { ComponentCard } from '../ui/Card'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table'

/**
 * "Recently updated" — TailAdmin Free `RecentOrders` table styling over the
 * most recently touched documents across the content collections.
 */
export type RecentDocumentsTableProps = {
  documents: RecentDocument[]
  now?: Date
  className?: string
}

export default function RecentDocumentsTable({
  documents,
  now = new Date(),
  className,
}: RecentDocumentsTableProps) {
  return (
    <ComponentCard
      title="Recently updated"
      desc="The latest edits across every content collection you can read."
      className={className}
    >
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Document
              </TableCell>
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
                Status
              </TableCell>
              <TableCell
                isHeader
                className="py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Updated
              </TableCell>
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-theme-sm text-gray-500">
                  Nothing here yet — create your first document to populate this list.
                </TableCell>
              </TableRow>
            ) : null}

            {documents.map((doc) => (
              <TableRow key={`${doc.collectionSlug}-${doc.id}`}>
                <TableCell className="py-3">
                  <Link
                    href={doc.href}
                    className="text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400"
                  >
                    <span className="line-clamp-1 max-w-80">{doc.title}</span>
                  </Link>
                </TableCell>
                <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                  {doc.collectionLabel}
                </TableCell>
                <TableCell className="py-3">
                  {doc.status === 'draft' ? (
                    <Badge size="sm" color="warning">
                      Draft
                    </Badge>
                  ) : doc.status === 'published' ? (
                    <Badge size="sm" color="success">
                      Published
                    </Badge>
                  ) : (
                    <Badge size="sm" color="light">
                      —
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="py-3 text-end text-theme-sm text-gray-500 dark:text-gray-400">
                  {relativeTime(doc.updatedAt ?? doc.createdAt, now)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ComponentCard>
  )
}
