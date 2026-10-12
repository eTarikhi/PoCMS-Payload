'use client'

import { useNav } from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback } from 'react'

import type { Branding, SidebarSection, SidebarUser } from '../data/types'
import { getIcon } from '../icons'
import { cn } from '../lib/cn'
import { Avatar } from '../ui/Avatar'

import '../styles/tailadmin.css'

/**
 * TailAdmin sidebar rendered *as* Payload's `Nav` component
 * (`admin.components.Nav`, mode `full`).
 *
 * Two integration details make this safe:
 *
 *  1. Open/close state comes from Payload's own `useNav()` context, so the
 *     existing hamburger button, the `Escape` shortcut and the mobile drawer
 *     keep working — the TailAdmin sidebar simply reads what Payload already
 *     manages.
 *  2. The width is `var(--nav-width)` (275px in `@payloadcms/ui/scss/app.scss`),
 *     which is the value Payload's `.template-default` layout already
 *     compensates for. No layout maths is duplicated here.
 */
export type TailAdminNavClientProps = {
  sections: SidebarSection[]
  branding: Branding
  user?: SidebarUser | null
}

export default function TailAdminNavClient({ sections, branding, user }: TailAdminNavClientProps) {
  const { navOpen } = useNav()
  const pathname = usePathname() ?? ''

  const isActive = useCallback(
    (href: string) => pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)),
    [pathname],
  )

  return (
    <nav
      className={cn(
        'ta-root fixed top-0 left-0 flex h-full flex-col overflow-hidden border-r border-gray-200 bg-white text-gray-900 transition-transform duration-200 ease-in-out',
        'dark:border-gray-800 dark:bg-gray-900 dark:text-white',
        navOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      style={{
        // Payload's own nav metrics: `.template-default` already offsets the
        // page content by `--nav-width`, and `--z-nav` keeps the sidebar below
        // modals/drawers/popups exactly like the stock nav does.
        width: 'var(--nav-width, 275px)',
        zIndex: 'var(--z-nav, 20)',
      }}
      aria-label="Main navigation"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-5 dark:border-gray-800">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white shadow-theme-xs">
          {branding.shortName ?? branding.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-gray-800 dark:text-white/90">
            {branding.name}
          </span>
          {branding.tagline ? (
            <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">
              {branding.tagline}
            </span>
          ) : null}
        </span>
      </div>

      {/* Links */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {sections.map((section, sectionIndex) => (
            <div key={`${section.label}-${sectionIndex}`}>
              <h2 className="mb-3 px-3 text-theme-xs leading-5 text-gray-400 uppercase">
                {section.label}
              </h2>
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const Icon = getIcon(item.icon)
                  const active = isActive(item.href)
                  const content = (
                    <>
                      <span className={cn(active ? 'menu-item-icon-active' : 'menu-item-icon-inactive')}>
                        <Icon size={18} />
                      </span>
                      <span className="menu-item-text truncate">{item.label}</span>
                    </>
                  )
                  const className = cn('group menu-item', active ? 'menu-item-active' : 'menu-item-inactive')

                  return (
                    <li key={item.href}>
                      {item.external ? (
                        <a href={item.href} className={className} target="_blank" rel="noopener noreferrer">
                          {content}
                        </a>
                      ) : (
                        <Link href={item.href} className={className}>
                          {content}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      {user?.email ? (
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          <Link href={user.accountHref ?? '/admin/account'} className="flex items-center gap-3">
            <Avatar src={user.avatarUrl} name={user.name ?? user.email} size="small" />
            <span className="min-w-0">
              <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
                {user.name ?? user.email}
              </span>
              <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">
                {user.email}
              </span>
            </span>
          </Link>
        </div>
      ) : null}
    </nav>
  )
}
