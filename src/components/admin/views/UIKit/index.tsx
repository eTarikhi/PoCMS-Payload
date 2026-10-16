import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'

import { isAdmin } from '@/access/roles'

import { UIKitClient } from './UIKitClient'

/**
 * /admin/ui-kit — the admin's living style guide: design tokens and every shadcn primitive in its
 * states, rendered inside Payload's own shell so light/dark parity and drawer/portal behaviour can be
 * checked in place. Admins only (ADR 0008).
 */
export function UIKitView({
  i18n,
  initPageResult,
  locale,
  params,
  payload,
  permissions,
  searchParams,
  user,
}: AdminViewServerProps) {
  const { req, visibleEntities } = initPageResult

  if (!req.user) {
    redirect(`${payload.config.routes.admin}/login?redirect=${encodeURIComponent(`${payload.config.routes.admin}/ui-kit`)}`)
  }
  if (!isAdmin(req.user)) notFound()

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
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <UIKitClient />
      </Gutter>
    </DefaultTemplate>
  )
}
