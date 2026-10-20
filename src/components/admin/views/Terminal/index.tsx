import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { optionsFor } from '@/terminal/scripts'

import { TerminalLazy } from './TerminalLazy'

/**
 * /admin/terminal (CR-12 E7, `useTerminal` capability, development only): runs one of the
 * allow-listed package scripts and streams its output. A production build returns 404 for everyone,
 * including administrators; the allow-list lives in `src/terminal/scripts.ts` and the security
 * review in docs/ui-modernization/terminal-security.md.
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
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin

  // Same gate as the endpoint: no page in production, whatever the environment variables say.
  if (process.env.NODE_ENV === 'production') notFound()
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
        <SetStepNav nav={[{ label: 'Terminal' }]} />
        <div data-testid="terminal" className="acn:space-y-6 acn:pt-6 acn:pb-16">
          <header className="acn:space-y-1">
            <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">Terminal</h1>
            <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
              The project&rsquo;s checks and generators, run in the repository with their output
              streamed. Development only, and only for roles with the Terminal capability. Only the
              commands on the left can run; there is no shell and no free-text input.
            </p>
          </header>
          <TerminalLazy scripts={optionsFor()} />
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default TerminalView
