import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { isTerminalAvailableInEnv } from '@/endpoints/devTerminal'

import { TerminalClient } from './TerminalClient'

/**
 * `/admin/terminal` (`admin.components.views.terminal`):
 * Development-only admin shell runner. Strictly returns `notFound()` in production builds,
 * and requires the `useTerminal` capability (ADR 0011).
 */
export function TerminalView({
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps) {
  // Strictly disabled in production regardless of user role.
  if (!isTerminalAvailableInEnv()) notFound()

  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/terminal`)}`)
  }
  if (!hasCapability(req.user, 'useTerminal')) notFound()

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
        <SetStepNav nav={[{ label: 'Dev terminal' }]} />
        <TerminalClient apiRoute={payload.config.routes.api} cwd={process.cwd()} />
      </Gutter>
    </DefaultTemplate>
  )
}

export default TerminalView
