'use client'

import type { ReactNode } from 'react'

import { TailAdminSidebarProvider, useSidebar } from '../context/TailAdminSidebarContext'
import type { Branding, SidebarItem, SidebarSection, SidebarUser } from '../data/types'
import { cn } from '../lib/cn'
import TailAdminBackdrop from './TailAdminBackdrop'
import TailAdminHeader, { type SearchIndexEntry } from './TailAdminHeader'
import TailAdminSidebar from './TailAdminSidebar'

/**
 * Loads the scoped TailAdmin stylesheet.
 *
 * The CSS is imported here (a client component) rather than in
 * `src/app/(payload)/custom.scss` on purpose:
 *   - `layout.tsx` and `custom.scss` in the `(payload)` route group are
 *     Payload-generated and get rewritten by `payload generate:*`;
 *   - Payload's own guidance for custom components is to import component
 *     styles from the component itself;
 *   - the stylesheet is only fetched when a TailAdmin surface actually mounts.
 */
import '../styles/tailadmin.css'

export type TailAdminShellProps = {
  sections: SidebarSection[]
  branding: Branding
  user?: SidebarUser | null
  searchIndex?: SearchIndexEntry[]
  footer?: SidebarItem[]
  children: ReactNode
  /** Page heading rendered above `children`. */
  title?: string
  subtitle?: ReactNode
  actions?: ReactNode
}

function ShellBody({
  sections,
  branding,
  user,
  searchIndex,
  footer,
  children,
  title,
  subtitle,
  actions,
}: TailAdminShellProps) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar()

  // Same responsive margin logic as TailAdmin's `(admin)/layout.tsx`.
  const mainContentMargin = isMobileOpen
    ? 'ml-0'
    : isExpanded || isHovered
      ? 'lg:ml-[290px]'
      : 'lg:ml-[90px]'

  return (
    <div className="ta-root min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white xl:flex">
      <TailAdminSidebar sections={sections} branding={branding} footer={footer} />
      <TailAdminBackdrop />

      <div className={cn('flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out', mainContentMargin)}>
        <TailAdminHeader branding={branding} user={user} searchIndex={searchIndex} />

        <main className="mx-auto w-full max-w-(--breakpoint-3xl) flex-1 p-4 md:p-6">
          {title ? (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-title-sm font-bold text-gray-800 dark:text-white/90">{title}</h1>
                {subtitle ? (
                  <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
                ) : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * The TailAdmin application shell: sidebar + header + content area.
 *
 * Wraps everything in `.ta-root`, which is the selector the scoped Tailwind
 * preflight and the ApexCharts overrides in `styles/tailadmin.css` hang off.
 * Never render TailAdmin markup outside a `.ta-root` element.
 */
export default function TailAdminShell(props: TailAdminShellProps) {
  return (
    <TailAdminSidebarProvider>
      <ShellBody {...props} />
    </TailAdminSidebarProvider>
  )
}
