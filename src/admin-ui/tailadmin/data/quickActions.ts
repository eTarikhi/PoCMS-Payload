import type { QuickAction } from '../blocks/QuickActions'
import type { CollectionStat } from './types'

/**
 * Builds the "Quick actions" shortcuts.
 *
 * A create shortcut is only offered when the signed-in user actually has
 * `create` permission on that collection — Payload would otherwise show an
 * "unauthorized" screen after the click.
 */

export type MinimalPermissions = {
  collections?: Record<string, { create?: unknown; read?: unknown } | undefined>
}

export type BuildQuickActionsArgs = {
  collections: CollectionStat[]
  permissions?: MinimalPermissions | null
  adminBase?: string
  limit?: number
}

export function buildQuickActions({
  collections,
  permissions,
  adminBase = '/admin',
  limit = 4,
}: BuildQuickActionsArgs): QuickAction[] {
  const canCreate = (slug: string): boolean => {
    if (!permissions) return true
    return Boolean(permissions.collections?.[slug]?.create)
  }

  return collections
    .filter((stat) => stat.readable && canCreate(stat.slug) && !stat.error)
    .slice(0, limit)
    .map((stat) => ({
      label: `New ${stat.label.replace(/s$/, '')}`,
      href: `${adminBase}/collections/${stat.slug}/create`,
    }))
}
