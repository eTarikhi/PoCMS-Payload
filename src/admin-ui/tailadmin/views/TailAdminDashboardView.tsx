import type { AdminViewServerProps } from 'payload'

import CollectionBreakdown from '../blocks/CollectionBreakdown'
import ContentGrowthChart from '../blocks/ContentGrowthChart'
import KpiGrid from '../blocks/KpiGrid'
import QuickActions from '../blocks/QuickActions'
import RecentDocumentsTable from '../blocks/RecentDocumentsTable'
import WarningsBanner from '../blocks/WarningsBanner'
import { Button } from '../ui/Button'
import { buildQuickActions } from '../data/quickActions'
import { loadAdminUiDataFromInitPage, toShellUser } from '../data/serverData'
import { PlusIcon } from '../icons'
import { resolveBranding, TAILADMIN_BASE_PATH } from '../config'
import TailAdminShell from '../layout/TailAdminShell'

/**
 * `/admin/tailadmin` — the TailAdmin Free pilot dashboard.
 *
 * Registered as a *new* root view in `payload.config.ts`. Payload renders new
 * root views bare (no `DefaultTemplate`), which is exactly what a full
 * alternative shell needs: the TailAdmin sidebar and header replace Payload's
 * nav for this route, while every other admin route keeps Payload's UI.
 *
 * Data flow: this is a React Server Component. It queries the Local API with
 * the incoming request (so access control applies) and passes plain JSON to
 * client components.
 */
export async function TailAdminDashboardView(props: AdminViewServerProps) {
  const { initPageResult, user, permissions } = props
  const resolvedPermissions = permissions ?? initPageResult.permissions

  const { stats, shell } = await loadAdminUiDataFromInitPage({
    initPageResult: {
      permissions: initPageResult.permissions,
      req: initPageResult.req,
      visibleEntities: initPageResult.visibleEntities,
    },
    user: toShellUser(user),
    branding: resolveBranding(),
    basePath: TAILADMIN_BASE_PATH,
  })

  const quickActions = buildQuickActions({
    collections: stats.collections,
    permissions: resolvedPermissions,
    adminBase: shell.user.accountHref?.replace('/account', '') ?? '/admin',
  })

  return (
    <TailAdminShell
      sections={shell.sections}
      footer={shell.footer}
      searchIndex={shell.searchIndex}
      branding={shell.branding}
      user={shell.user}
      title="Dashboard"
      subtitle={`Live content overview · generated ${new Date(stats.generatedAt).toLocaleString()}`}
      actions={
        <>
          <Button href="/admin" variant="outline">
            Payload admin
          </Button>
          <Button href={`${quickActions[0]?.href ?? '/admin'}`} startIcon={<PlusIcon size={16} />}>
            {quickActions[0] ? quickActions[0].label : 'Create'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <WarningsBanner warnings={stats.warnings} />

        <KpiGrid stats={stats} />

        {stats.growth ? (
          <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-3">
            <ContentGrowthChart growth={stats.growth} className="xl:col-span-2" />
            <QuickActions actions={quickActions} />
          </div>
        ) : (
          <QuickActions actions={quickActions} />
        )}

        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
          <CollectionBreakdown stats={stats.collections} />
          <RecentDocumentsTable documents={stats.recent} />
        </div>
      </div>
    </TailAdminShell>
  )
}

export default TailAdminDashboardView
