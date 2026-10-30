import Link from 'next/link'
import type { WidgetServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import {
  collectInboxFolderCounts,
  resolveIntegrationState,
} from '@/plugins/mailInbox/services/inboxQueries'
import type { InboxFolderCounts, MailIntegrationState } from '@/plugins/mailInbox/types'

/**
 * Dashboard widget guarded by `manageInbox`: summarizes unread conversations,
 * folder activity, and Resend Inbound/Outbound webhook readiness.
 */
export async function MailInboxWidget({ req, user }: WidgetServerProps) {
  const title = 'Mail inbox'
  const description = 'Inbound/outbound Resend emails and website inquiry threads.'

  if (!hasCapability(user, 'manageInbox')) {
    return (
      <WidgetCard title={title} description={description}>
        <IntegrationNotice service="Mail inbox" state="forbidden" />
      </WidgetCard>
    )
  }

  const counts = await collectInboxFolderCounts(req.payload, req)
  const integration = resolveIntegrationState({ payload: req.payload })
  const adminRoute = req.payload.config.routes.admin

  return (
    <MailInboxSummaryView
      counts={counts}
      integration={integration}
      adminRoute={adminRoute}
    />
  )
}

export function MailInboxSummaryView({
  counts,
  integration,
  adminRoute = '/admin',
}: {
  counts: InboxFolderCounts
  integration: MailIntegrationState
  adminRoute?: string
}) {
  const fullyLive = integration.outboundConfigured && integration.webhookConfigured

  return (
    <WidgetCard
      title="Mail inbox"
      description="Inbound/outbound Resend emails and website inquiry threads."
      action={
        <Link
          href={`${adminRoute}/inbox`}
          className="acn:text-xs acn:font-medium acn:text-muted-foreground acn:underline-offset-4 acn:hover:text-foreground acn:hover:underline"
        >
          Open inbox →
        </Link>
      }
    >
      <div className="acn:space-y-3">
        <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
          <div className="acn:flex acn:items-center acn:gap-2">
            <RunStatus
              tone={fullyLive ? 'good' : integration.outboundConfigured ? 'running' : 'muted'}
              label={
                fullyLive
                  ? 'Resend live'
                  : integration.outboundConfigured
                    ? 'Outbound active'
                    : 'Local / Form mode'
              }
            />
            <span className="acn:text-xs acn:text-muted-foreground">
              {integration.defaultFromEmail}
            </span>
          </div>
          {counts.inboxUnread > 0 ? (
            <Badge variant="default">{counts.inboxUnread} unread</Badge>
          ) : (
            <Badge variant="outline">Inbox zero</Badge>
          )}
        </div>

        <dl className="acn:m-0 acn:grid acn:grid-cols-3 acn:gap-x-4 acn:gap-y-2 acn:border-t acn:border-border acn:pt-3 acn:text-xs">
          <div>
            <dt className="acn:text-muted-foreground">Inbox</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">
              {counts.inbox} ({counts.inboxUnread} new)
            </dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Sent</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">{counts.sent}</dd>
          </div>
          <div>
            <dt className="acn:text-muted-foreground">Starred</dt>
            <dd className="acn:m-0 acn:font-mono acn:font-medium">{counts.starred}</dd>
          </div>
        </dl>
      </div>
    </WidgetCard>
  )
}

export default MailInboxWidget
