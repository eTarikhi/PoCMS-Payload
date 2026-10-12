import type { Config } from 'payload'

import type { Branding } from './data/types'
import { TAILADMIN_BASE_PATH, TAILADMIN_UIKIT_PATH } from './paths'

export { TAILADMIN_BASE_PATH, TAILADMIN_UIKIT_PATH }

/**
 * ---------------------------------------------------------------------------
 * TailAdmin pilot wiring for `payload.config.ts`
 * ---------------------------------------------------------------------------
 *
 * This module is deliberately free of React, CSS and client imports: it is
 * loaded by `payload.config.ts`, which also runs in plain Node for every
 * `payload` CLI command (migrate, generate:types, generate:importmap, ...).
 * It exports configuration *strings* only — Payload resolves those paths
 * through the import map at build time.
 *
 * Component paths are relative to `config.admin.importMap.baseDir`, which this
 * repository sets to `src/`.
 */

/**
 * How aggressively the pilot takes over Payload's admin UI.
 *
 * - `off`       — nothing is registered; Payload's admin panel is 100% stock.
 * - `additive`  — new `/admin/tailadmin` routes + a KPI strip on the stock
 *                 dashboard + a nav link. Payload's own styling stays intact.
 * - `dashboard` — everything in `additive`, plus `/admin` itself is replaced by
 *                 the TailAdmin dashboard (rendered inside Payload's
 *                 `DefaultTemplate`, so Payload's nav/header stay).
 * - `full`      — (default) everything in `dashboard`, plus the **TailAdmin
 *                 theme is applied to every page and element** of the admin
 *                 panel (nav, buttons, inputs, cards, tables, headers, pills,
 *                 modals, drawers, toasts, login) via `TailAdminThemeProvider`
 *                 and `styles/tailadmin-theme.css`.
 *
 * Note: `full` deliberately restyles Payload's *native* nav and elements via CSS
 * instead of swapping the `Nav` component. Payload lays the sidebar out with a
 * CSS grid (`--nav-width` column), so replacing it with a fixed-position
 * component fights that layout. Restyling keeps all of Payload's nav behaviour
 * (open/close, mobile drawer, keyboard access) while applying the TailAdmin look.
 */
export type TailAdminPilotMode = 'off' | 'additive' | 'dashboard' | 'full'

const MODES: TailAdminPilotMode[] = ['off', 'additive', 'dashboard', 'full']

export function resolvePilotMode(env: NodeJS.ProcessEnv = process.env): TailAdminPilotMode {
  const raw = (env.POCMS_ADMIN_UI ?? 'full').trim().toLowerCase()
  return (MODES as string[]).includes(raw) ? (raw as TailAdminPilotMode) : 'full'
}

/** Admin-panel branding used by the TailAdmin shell. */
export function resolveBranding(env: NodeJS.ProcessEnv = process.env): Branding {
  const name = env.POCMS_ADMIN_UI_BRAND?.trim() || 'PoCMS'
  return {
    name,
    shortName: env.POCMS_ADMIN_UI_BRAND_SHORT?.trim() || name.slice(0, 2).toUpperCase(),
    tagline: env.POCMS_ADMIN_UI_TAGLINE?.trim() || 'TailAdmin pilot',
  }
}

type AdminComponents = NonNullable<Config['admin']>['components']

/**
 * Returns the `admin.components` fragment for the selected mode.
 *
 * Usage in `payload.config.ts`:
 *
 * ```ts
 * import { buildTailAdminComponents, resolvePilotMode } from './admin-ui/tailadmin/config'
 *
 * export default buildConfig({
 *   admin: {
 *     // ...
 *     components: buildTailAdminComponents(resolvePilotMode()),
 *   },
 * })
 * ```
 */
export function buildTailAdminComponents(
  mode: TailAdminPilotMode = resolvePilotMode(),
): AdminComponents {
  if (mode === 'off') return {}

  const components: AdminComponents = {
    // Link to the pilot from Payload's own sidebar.
    afterNavLinks: ['/admin-ui/tailadmin/nav/TailAdminNavLinks#TailAdminNavLinks'],

    // TailAdmin KPI strip on top of Payload's stock dashboard.
    beforeDashboard: ['/admin-ui/tailadmin/dashboard/TailAdminKpiStrip#TailAdminKpiStrip'],

    views: {
      tailadminDashboard: {
        path: TAILADMIN_BASE_PATH,
        exact: true,
        Component: '/admin-ui/tailadmin/views/TailAdminDashboardView#TailAdminDashboardView',
        meta: { title: 'TailAdmin Dashboard' },
      },
      tailadminUiKit: {
        path: TAILADMIN_UIKIT_PATH,
        exact: true,
        Component: '/admin-ui/tailadmin/views/TailAdminUiKitView#TailAdminUiKitView',
        meta: { title: 'TailAdmin UI Kit' },
      },
    },
  }

  if (mode === 'dashboard' || mode === 'full') {
    // Replaces the built-in `/admin` dashboard. Payload detects that this view
    // overrides a built-in key and keeps the `default` template, so the stock
    // nav, header and account menu are preserved.
    components.views = {
      ...components.views,
      dashboard: {
        Component: '/admin-ui/tailadmin/views/TailAdminDashboardOverride#TailAdminDashboardOverride',
      },
    }
  }

  if (mode === 'full') {
    // Enable the TailAdmin theme across the entire admin panel. The provider
    // wraps every admin route and sets `html[data-ta-theme="on"]`, which the
    // global stylesheet (`styles/tailadmin-theme.css`) keys off — so every page
    // and element (nav, buttons, inputs, cards, tables, modals, drawers,
    // toasts, login) picks up the TailAdmin design language.
    //
    // Payload's native `Nav` is intentionally NOT replaced: it is restyled by
    // the theme CSS instead, which is robust across Payload's grid layout and
    // preserves its built-in open/close/mobile/keyboard behaviour.
    components.providers = [
      '/admin-ui/tailadmin/providers/TailAdminThemeProvider#TailAdminThemeProvider',
    ]
  }

  return components
}
