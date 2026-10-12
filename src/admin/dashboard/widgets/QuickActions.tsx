import type { WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { isActionAllowed, QUICK_ACTIONS } from '../../lib/quick-actions'
import '../dashboard-widgets.scss'

/**
 * Dashboard widget: prioritized shortcuts for the tasks editors do most.
 * Hidden automatically when the current user lacks the permission.
 */
export default function QuickActions({ permissions }: WidgetServerProps) {
  const visible = QUICK_ACTIONS.filter((action) => isActionAllowed(permissions, action))

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
