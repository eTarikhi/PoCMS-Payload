import type { SanitizedPermissions } from 'payload'

/**
 * Quick-action shortcuts for the dashboard widget.
 * Pure data — no Payload runtime imports — so it is unit-testable without a database.
 */
export type QuickAction = {
  href: string
  label: string
  newTab?: boolean
  /** Hidden automatically when the current user lacks this permission. */
  permission?:
    | { collection: string; operation: 'create' | 'read' | 'update' }
    | { global: string; operation: 'read' | 'update' }
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    href: '/admin/collections/articles/create',
    label: 'New article',
    permission: { collection: 'articles', operation: 'create' },
  },
  {
    href: '/admin/collections/projects/create',
    label: 'New project',
    permission: { collection: 'projects', operation: 'create' },
  },
  {
    href: '/admin/collections/media',
    label: 'Open media library',
    permission: { collection: 'media', operation: 'read' },
  },
  {
    href: '/admin/collections/articles',
    label: 'Review articles',
    permission: { collection: 'articles', operation: 'read' },
  },
  {
    href: '/admin/globals/footer',
    label: 'Edit site footer',
    permission: { global: 'footer', operation: 'update' },
  },
  {
    href: '/',
    label: 'View live site',
    newTab: true,
  },
]

/** Whether the current user may see the given shortcut. */
export function isActionAllowed(
  permissions: SanitizedPermissions | undefined,
  action: QuickAction,
): boolean {
  const rule = action.permission
  if (!rule) return true
  if ('collection' in rule) {
    return Boolean(permissions?.collections?.[rule.collection]?.[rule.operation])
  }
  return Boolean(permissions?.globals?.[rule.global]?.[rule.operation])
}
