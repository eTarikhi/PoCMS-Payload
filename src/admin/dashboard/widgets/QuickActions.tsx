import type { SanitizedPermissions, WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import '../dashboard-widgets.scss'

type Action = {
  href: string
  label: string
  newTab?: boolean
  /** Hidden automatically when the current user lacks this permission. */
  permission?:
    | { collection: string; operation: 'create' | 'read' | 'update' }
    | { global: string; operation: 'read' | 'update' }
}

const ACTIONS: Action[] = [
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

function isAllowed(permissions: SanitizedPermissions | undefined, action: Action): boolean {
  const rule = action.permission
  if (!rule) return true
  if ('collection' in rule) {
    return Boolean(permissions?.collections?.[rule.collection]?.[rule.operation])
  }
  return Boolean(permissions?.globals?.[rule.global]?.[rule.operation])
}

/**
 * Dashboard widget: prioritized shortcuts for the tasks editors do most.
 * Hidden automatically when the current user lacks the permission.
 */
export default function QuickActions({ permissions }: WidgetServerProps) {
  const visible = ACTIONS.filter((action) => isAllowed(permissions, action))

  return (
    <div className="pocms-widget">
      <div className="pocms-widget__header">
        <h3 className="pocms-widget__title">Quick actions</h3>
        <span className="pocms-widget__hint">Shortcuts</span>
      </div>
      {visible.length === 0 ? (
        <p className="pocms-empty">No shortcuts are available to your account.</p>
      ) : (
        <ul className="pocms-links">
          {visible.map((action) => (
            <li key={action.href} className="pocms-links__item">
              {action.newTab ? (
                <a href={action.href} target="_blank" rel="noopener noreferrer">
                  {action.label}
                </a>
              ) : (
                <Link href={action.href}>{action.label}</Link>
              )}
              <span className="pocms-links__meta" aria-hidden="true">
                {action.newTab ? '↗' : '→'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
