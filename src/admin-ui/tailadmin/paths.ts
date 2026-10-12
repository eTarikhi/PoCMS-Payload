/**
 * Route constants for the TailAdmin pilot.
 *
 * Kept in a dependency-free module so both the Payload config (Node) and client
 * components can import it without dragging in anything else.
 */

/** Where the TailAdmin dashboard lives, relative to `config.routes.admin`. */
export const TAILADMIN_BASE_PATH = '/tailadmin'

/** Where the TailAdmin component gallery lives. */
export const TAILADMIN_UIKIT_PATH = `${TAILADMIN_BASE_PATH}/ui-kit`

/** Absolute admin URL of the TailAdmin dashboard. */
export function tailAdminDashboardHref(adminBase = '/admin'): string {
  return `${adminBase.replace(/\/$/, '')}${TAILADMIN_BASE_PATH}`
}

/** Absolute admin URL of the TailAdmin UI kit. */
export function tailAdminUiKitHref(adminBase = '/admin'): string {
  return `${adminBase.replace(/\/$/, '')}${TAILADMIN_UIKIT_PATH}`
}
