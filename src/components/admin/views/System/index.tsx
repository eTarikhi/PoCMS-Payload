import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { collectSystemInfo } from '@/lib/systemInfo'

import { SystemClient } from './SystemClient'

/**
 * `/admin/system` (`admin.components.views.system`):
 * Live stack versions, Node.js telemetry, PostgreSQL / Neon connection diagnostics, and
 * environment integration health. Guarded by the `viewSystem` capability (ADR 0011).
 */
export async function SystemView({
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
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/system`)}`)
  }
  if (!hasCapability(req.user, 'viewSystem')) notFound()

  const report = await collectSystemInfo(payload)

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
        <SetStepNav nav={[{ label: 'System information' }]} />
        <SystemClient initialReport={report} apiRoute={payload.config.routes.api} />
      </Gutter>
    </DefaultTemplate>
  )
}

export default SystemView
