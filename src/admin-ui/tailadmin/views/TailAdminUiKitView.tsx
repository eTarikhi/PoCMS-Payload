import type { AdminViewServerProps } from 'payload'

import UiKitGallery from '../blocks/UiKitGallery'
import { buildNavGroupsFromConfig, buildShellOnly, toShellUser } from '../data/serverData'
import { resolveBranding } from '../config'
import { TAILADMIN_BASE_PATH } from '../paths'
import TailAdminShell from '../layout/TailAdminShell'

/**
 * `/admin/tailadmin/ui-kit` — the TailAdmin Free component gallery, rendered
 * inside the TailAdmin shell.
 *
 * No database access happens here: the sidebar is built from the config +
 * permissions only, so this route stays fast and works even before the first
 * migration has run.
 */
export async function TailAdminUiKitView(props: AdminViewServerProps) {
  const { initPageResult, user, locale } = props

  const navGroups = buildNavGroupsFromConfig({
    payload: initPageResult.req.payload,
    permissions: initPageResult.permissions,
    locale: typeof locale === 'string' ? locale : undefined,
  })

  const shell = buildShellOnly({
    navGroups,
    user: toShellUser(user),
    branding: resolveBranding(),
    adminBase: initPageResult.req.payload.config.routes?.admin ?? '/admin',
    basePath: TAILADMIN_BASE_PATH,
  })

  return (
    <TailAdminShell
      sections={shell.sections}
      footer={shell.footer}
      searchIndex={shell.searchIndex}
      branding={shell.branding}
      user={shell.user}
      title="UI kit"
      subtitle="TailAdmin Free primitives, rendered inside the Payload admin panel."
    >
      <UiKitGallery />
    </TailAdminShell>
  )
}

export default TailAdminUiKitView
