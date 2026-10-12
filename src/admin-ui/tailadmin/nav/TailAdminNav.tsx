import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { resolveBranding } from '../config'
import { buildNavGroupsFromConfig, buildShellOnly, toShellUser } from '../data/serverData'
import type { ShellModel } from '../data/serverData'
import { TAILADMIN_BASE_PATH } from '../paths'
import TailAdminNavClient from './TailAdminNavClient'

/**
 * Replaces Payload's `Nav` component (`admin.components.Nav`) — only wired up
 * in `POCMS_ADMIN_UI=full` mode.
 *
 * This is a React Server Component, which is what makes a full nav replacement
 * possible at all: Payload renders `Nav` without props, so the data has to be
 * fetched here. It resolves the current user and their permissions with
 * `payload.auth({ headers })` and builds the sidebar from the real config, so
 * the TailAdmin nav shows exactly what Payload's own nav would show.
 *
 * `@payload-config` is imported *dynamically* to avoid a static import cycle
 * (payload.config.ts -> importMap -> this component -> payload.config.ts).
 *
 * Fallible work lives in `loadNavModel()`; the JSX is built outside the
 * `try/catch` (React does not render synchronously, so a `try/catch` around JSX
 * cannot catch render errors — see `react-hooks/error-boundaries`). On failure
 * a minimal link list is rendered so an editor is never stranded.
 */
async function loadNavModel(): Promise<ShellModel | null> {
  try {
    const { default: config } = await import('@payload-config')
    const payload = await getPayload({ config })
    const { user, permissions } = await payload.auth({ headers: await headers() })

    if (!user) return null

    const navGroups = buildNavGroupsFromConfig({ payload, permissions })
    return buildShellOnly({
      navGroups,
      user: toShellUser(user),
      branding: resolveBranding(),
      adminBase: payload.config.routes?.admin ?? '/admin',
      basePath: TAILADMIN_BASE_PATH,
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[tailadmin-pilot] Nav override could not load its data:', error)
    }
    return null
  }
}

export async function TailAdminNav() {
  const shell = await loadNavModel()

  if (!shell) return <FallbackNav adminBase="/admin" />

  return (
    <TailAdminNavClient sections={shell.sections} branding={shell.branding} user={shell.user} />
  )
}

function FallbackNav({ adminBase }: { adminBase: string }) {
  const links = [
    { href: adminBase, label: 'Dashboard' },
    { href: `${adminBase}/account`, label: 'Account' },
    { href: `${adminBase}${TAILADMIN_BASE_PATH}`, label: 'TailAdmin dashboard' },
    { href: `${adminBase}/collections/media`, label: 'Media' },
    { href: `${adminBase}/collections/users`, label: 'Users' },
  ]

  return (
    <nav
      className="ta-root fixed top-0 left-0 flex h-full flex-col gap-2 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      style={{ width: 'var(--nav-width, 275px)', zIndex: 'var(--z-nav, 20)' }}
      aria-label="Main navigation"
    >
      <span className="mb-2 text-base font-semibold text-gray-800 dark:text-white/90">PoCMS</span>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="rounded-lg px-3 py-2 text-theme-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}

export default TailAdminNav
