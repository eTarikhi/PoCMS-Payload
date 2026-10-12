/**
 * Public surface of the TailAdmin Free pilot for the Payload admin panel.
 *
 * Import from here rather than reaching into sub-folders, so the internal
 * layout can change without touching call sites:
 *
 * ```ts
 * import { buildTailAdminComponents, resolvePilotMode } from './admin-ui/tailadmin'
 * ```
 *
 * Note: this barrel is deliberately *config-side only* (no React, no CSS), so
 * it is safe to import from `payload.config.ts`.
 */

export {
  buildTailAdminComponents,
  resolveBranding,
  resolvePilotMode,
  type TailAdminPilotMode,
} from './config'

export {
  TAILADMIN_BASE_PATH,
  TAILADMIN_UIKIT_PATH,
  tailAdminDashboardHref,
  tailAdminUiKitHref,
} from './paths'

export type {
  AdminNavEntity,
  AdminNavGroup,
  Branding,
  CollectionStat,
  ContentStats,
  GrowthPoint,
  GrowthSeries,
  NavEntityInput,
  RecentDocument,
  SearchIndexEntry,
  SidebarItem,
  SidebarSection,
  SidebarUser,
} from './data/types'

export { buildNavGroups, flattenNavGroups } from './data/navGroups'
export { buildQuickActions } from './data/quickActions'
