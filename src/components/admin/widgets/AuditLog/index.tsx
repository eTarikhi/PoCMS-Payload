import type { WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { adminURL } from '@/components/admin/utilities/collections'
import { relativeTime } from '@/components/admin/utilities/dates'
import type { AuditLog } from '@/payload-types'

const ACTION_LABEL: Record<AuditLog['action'], string> = {
  create: 'Created',
  update: 'Updated',
  trash: 'Trashed',
  restore: 'Restored',
  delete: 'Deleted',
  login: 'Signed in',
  logout: 'Signed out',
}

const ACTION_VARIANT: Record<
  AuditLog['action'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  create: 'secondary',
  update: 'outline',
  trash: 'outline',
  restore: 'secondary',
  delete: 'destructive',
  login: 'outline',
  logout: 'outline',
}

const LIMIT = 7

/**
 * Dashboard widget (CR-12 E5): the newest audit entries for users with the Audit log capability.
 * The full, filterable list is the audit-logs collection; this is the glanceable recent history.
 */
export async function AuditLogWidget({ req }: WidgetServerProps) {
  if (!hasCapability(req.user, 'viewAuditLog')) return null

  const { docs } = await req.payload.find({
    collection: 'audit-logs',
    req,
    overrideAccess: false,
    depth: 0,
    limit: LIMIT,
    sort: '-createdAt',
  })
  const entries = docs as AuditLog[]
  const language = req.i18n.language || 'en'
  const logURL = adminURL(req, 'audit-logs')

  return (
    <WidgetCard
      title="Audit log"
      description="Who changed what, newest first."
      action={
        <Link
          href={logURL}
          className="acn:text-xs acn:font-medium acn:text-muted-foreground acn:no-underline acn:hover:text-foreground acn:hover:underline"
        >
          View log
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="acn:text-sm acn:text-muted-foreground">
          Nothing logged yet. Changes, deletions and sign-ins appear here.
        </p>
      ) : (
        <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:divide-y acn:divide-border acn:p-0">
          {entries.map((entry) => (
            <li key={entry.id} className="acn:flex acn:items-start acn:gap-3 acn:py-2">
              <Badge
                variant={ACTION_VARIANT[entry.action]}
                className="acn:mt-0.5 acn:shrink-0"
              >
                {ACTION_LABEL[entry.action]}
              </Badge>
              <div className="acn:min-w-0 acn:flex-1">
                <p className="acn:m-0 acn:text-sm acn:leading-snug acn:text-foreground">
                  {entry.summary}
                </p>
                <p className="acn:m-0 acn:mt-0.5 acn:text-xs acn:text-muted-foreground">
                  {entry.userEmail ?? 'System'}
                  {entry.ip ? ` · ${entry.ip}` : ''}
                </p>
              </div>
              <time
                dateTime={String(entry.createdAt)}
                title={new Date(String(entry.createdAt)).toLocaleString(language)}
                className="acn:w-20 acn:shrink-0 acn:text-right acn:text-xs acn:text-muted-foreground acn:tabular-nums"
              >
                {relativeTime(String(entry.createdAt), language)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export default AuditLogWidget
