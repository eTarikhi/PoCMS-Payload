import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { collectJobsSnapshot } from '@/jobs/config'

import { JobsClient } from './JobsClient'

/**
 * `/admin/jobs` (`admin.components.views.jobs`):
 * Inspect, queue, schedule, run now, or cancel Payload background jobs (`payload-jobs`).
 * Guarded by the `manageJobs` capability (ADR 0011).
 */
export async function JobsView({
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
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/jobs`)}`)
  }
  if (!hasCapability(req.user, 'manageJobs')) notFound()

  const snapshot = await collectJobsSnapshot(payload, 60)

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
        <SetStepNav nav={[{ label: 'Scheduled jobs' }]} />
        <JobsClient initialSnapshot={snapshot} apiRoute={payload.config.routes.api} />
      </Gutter>
    </DefaultTemplate>
  )
}

export default JobsView
