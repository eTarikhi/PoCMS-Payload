import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { hasCapability, isAdmin } from '@/access/permissions'
import { collectDatabaseManagementSnapshot } from '@/plugins/databaseManager/snapshot'

import { DatabaseClient } from './DatabaseClient'

/**
 * `/admin/database` (`admin.components.views.database`):
 * Two-tier Database Management console:
 *   - Pilot Tier: Standard PostgreSQL vitals, bloat/index inspector, portable logical backup
 *     (browser + encrypted Vercel Blob vault), dry-run & transactional restore, and repair tools.
 *   - Advanced Tier: Pluggable serverless provider adapters (Neon `@neon/sdk`, Supabase, Prisma Postgres).
 * Guarded by the `manageDatabase` capability (ADR 0011).
 */
export async function DatabaseView({
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
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/database`)}`)
  }
  if (!hasCapability(req.user, 'manageDatabase')) notFound()

  const snapshot = await collectDatabaseManagementSnapshot(payload)

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
        <SetStepNav nav={[{ label: 'Database manager' }]} />
        <DatabaseClient
          initialSnapshot={snapshot}
          apiRoute={payload.config.routes.api}
          isAdminUser={isAdmin(req.user)}
        />
      </Gutter>
    </DefaultTemplate>
  )
}

export default DatabaseView
