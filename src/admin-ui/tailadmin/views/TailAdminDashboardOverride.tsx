import type { AdminViewServerProps } from 'payload'

import CollectionBreakdown from '../blocks/CollectionBreakdown'
import ContentGrowthChart from '../blocks/ContentGrowthChart'
import KpiGrid from '../blocks/KpiGrid'
import QuickActions, { type QuickAction } from '../blocks/QuickActions'
import RecentDocumentsTable from '../blocks/RecentDocumentsTable'
import WarningsBanner from '../blocks/WarningsBanner'
import { Button } from '../ui/Button'
import { buildQuickActions } from '../data/quickActions'
import { loadAdminUiDataFromInitPage, toShellUser } from '../data/serverData'
import { ArrowUpRightIcon } from '../icons'
import { resolveBranding } from '../config'
import { TAILADMIN_BASE_PATH } from '../paths'

import '../styles/tailadmin.css'

/**
 * Replaces the built-in `/admin` dashboard (mode `dashboard` / `full`).
 *
 * Payload detects that this view overrides a built-in key and keeps its
 * `DefaultTemplate`, so the stock sidebar, header, account menu and keyboard
 * shortcuts all stay exactly as they are — only the dashboard *content* is
 * swapped for the TailAdmin one. That is the lowest-risk way to "replace the
 * default admin interface" while keeping every Payload behaviour editors rely
 * on (nav permissions, i18n, theme, live preview, ...).
 *
 * Compare with `TailAdminDashboardView`, which renders the full TailAdmin shell
 * at `/admin/tailadmin` with no Payload chrome at all.
 */
export async function TailAdminDashboardOverride(props: AdminViewServerProps) {
  const { initPageResult, user, permissions, locale } = props
  const resolvedPermissions = permissions ?? initPageResult.permissions
  const adminBase = initPageResult.req.payload.config.routes?.admin ?? '/admin'

  const { stats } = await loadAdminUiDataFromInitPage({
    initPageResult: {
      permissions: initPageResult.permissions,
      req: initPageResult.req,
      visibleEntities: initPageResult.visibleEntities,
    },
    user: toShellUser(user),
    userDoc: (user ?? null) as Record<string, unknown> | null,
    branding: resolveBranding(),
    basePath: TAILADMIN_BASE_PATH,
  })

  const quickActions: QuickAction[] = buildQuickActions({
    collections: stats.collections,
    permissions: resolvedPermissions,
    adminBase,
  })

  return (
    <div className="ta-inline flex flex-col gap-4 py-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-title-sm font-bold text-gray-800 dark:text-white/90">
            Welcome back{user?.email ? `, ${String(user.email).split('@')[0]}` : ''}
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            TailAdmin pilot dashboard · live Payload data · generated{' '}
            {new Date(stats.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button href={`${adminBase}${TAILADMIN_BASE_PATH}`} variant="outline" size="sm">
            Full TailAdmin shell
          </Button>
          <Button href={quickActions[0]?.href ?? adminBase} size="sm" endIcon={<ArrowUpRightIcon size={14} />}>
            {quickActions[0]?.label ?? 'Open admin'}
          </Button>
        </div>
      </div>

      <WarningsBanner warnings={stats.warnings} />

      <KpiGrid stats={stats} locale={typeof locale === 'string' ? locale : undefined} />

      {stats.growth ? <ContentGrowthChart growth={stats.growth} /> : null}

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
        <CollectionBreakdown stats={stats.collections} locale={typeof locale === 'string' ? locale : undefined} />
        <RecentDocumentsTable documents={stats.recent} />
      </div>

      <QuickActions actions={quickActions} />
    </div>
  )
}

export default TailAdminDashboardOverride
