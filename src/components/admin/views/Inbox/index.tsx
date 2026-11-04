import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { collectInboxSnapshot } from '@/plugins/mailInbox/services/inboxQueries'

import { InboxClient } from './InboxClient'

/**
 * `/admin/inbox` (`admin.components.views.inbox`):
 * Unified 3-pane Mail Inbox workspace powered by `mailInboxPlugin` (Resend Inbound/Outbound,
 * Standard Webhooks HMAC, private attachments, RFC 5322 threading, and website form-submissions bridge).
 * Guarded by the `manageInbox` capability (ADR 0011).
 */
export async function InboxView({
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/inbox`)}`)
  }
  if (!hasCapability(req.user, 'manageInbox')) {
    notFound()
  }

  const snapshot = await collectInboxSnapshot({
    payload,
    req,
    folder: 'inbox',
  })

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewActions={viewActions}
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <SetStepNav nav={[{ label: 'Mail inbox' }]} />
        <InboxClient
          initialSnapshot={snapshot}
          apiRoute={payload.config.routes.api}
          adminRoute={adminRoute}
        />
      </Gutter>
    </DefaultTemplate>
  )
}

export default InboxView
