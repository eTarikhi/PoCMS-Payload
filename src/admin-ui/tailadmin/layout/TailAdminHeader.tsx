'use client'

import { useTheme } from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useSidebar } from '../context/TailAdminSidebarContext'
import type { Branding, SearchIndexEntry, SidebarUser } from '../data/types'
import {
  BellIcon,
  CloseIcon,
  ExternalLinkIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  UserCircleIcon,
} from '../icons'
import { cn } from '../lib/cn'
import { Avatar } from '../ui/Avatar'
import { Dropdown, DropdownItem } from '../ui/Dropdown'

/**
 * Ported from TailAdmin Free `src/layout/AppHeader.tsx`.
 *
 * Adaptations for Payload:
 *  - the decorative search field becomes a working **quick jump**: it filters
 *    every collection/global the user can read and navigates on Enter
 *    (⌘K / Ctrl+K focuses it, exactly like upstream);
 *  - the theme toggle calls Payload's own `useTheme()` from `@payloadcms/ui`,
 *    so TailAdmin and the rest of the admin panel always share one theme
 *    (including the preference Payload persists for the user);
 *  - the user dropdown links to Payload's real account/logout routes.
 */
export type { SearchIndexEntry }

export type TailAdminHeaderProps = {
  branding: Branding
  user?: SidebarUser | null
  searchIndex?: SearchIndexEntry[]
}

export default function TailAdminHeader({ branding, user, searchIndex = [] }: TailAdminHeaderProps) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar()
  const { theme, setTheme } = useTheme()

  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isQuickLinksOpen, setIsQuickLinksOpen] = useState(false)

  const handleToggle = () => {
    if (window.innerWidth >= 1280) toggleSidebar()
    else toggleMobileSidebar()
  }

  // ⌘K / Ctrl+K focuses the quick-jump field (upstream behaviour).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
        inputRef.current?.focus()
      }
      if (event.key === 'Escape') {
        setIsSearchOpen(false)
        setIsUserMenuOpen(false)
        setIsQuickLinksOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Reset the field when the route changes. React's "adjust state during
  // render" pattern avoids the extra commit (and the
  // `react-hooks/set-state-in-effect` warning) an effect would cause.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    if (query) setQuery('')
  }

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return searchIndex.slice(0, 6)
    return searchIndex
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(needle) || entry.group.toLowerCase().includes(needle),
      )
      .slice(0, 8)
  }, [query, searchIndex])

  const goTo = (href: string) => {
    setIsSearchOpen(false)
    setQuery('')
    router.push(href)
  }

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const first = matches[0]
    if (first) goTo(first.href)
  }

  return (
    <header className="sticky top-0 z-999 flex w-full border-gray-200 bg-white/95 backdrop-blur-sm xl:border-b dark:border-gray-800 dark:bg-gray-900/95">
      <div className="flex grow flex-col items-center justify-between xl:flex-row xl:px-6">
        <div className="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 sm:gap-4 xl:justify-normal xl:border-b-0 xl:px-0 xl:py-4 dark:border-gray-800">
          {/* Sidebar toggle */}
          <button
            type="button"
            className={cn(
              'z-999 flex size-10 items-center justify-center rounded-lg border-gray-200 text-gray-500 lg:size-11 lg:bg-transparent xl:border dark:border-gray-800 dark:text-gray-400',
              isMobileOpen && 'bg-gray-100 dark:bg-white/3',
            )}
            onClick={handleToggle}
            aria-label="Toggle sidebar"
          >
            {isMobileOpen ? <CloseIcon size={22} /> : <MenuIcon size={20} />}
          </button>

          {/* Mobile brand */}
          <Link href="/admin" className="flex items-center gap-2 xl:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-theme-xs font-bold text-white">
              {branding.shortName ?? branding.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {branding.name}
            </span>
          </Link>

          {/* Quick jump */}
          <div className="relative hidden w-full max-w-107.5 xl:block">
            <form onSubmit={onSearchSubmit}>
              <span className="inset-s-4 pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                <SearchIcon size={20} />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setIsSearchOpen(true)
                }}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setIsSearchOpen(false), 120)}
                placeholder="Jump to a collection or global…"
                aria-label="Jump to a collection or global"
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 ps-12 pe-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-800 dark:bg-white/3 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
              <span className="inset-e-2.5 absolute top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1.75 py-[4.5px] text-xs tracking-[-0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/3 dark:text-gray-400">
                <span>⌘</span>
                <span>K</span>
              </span>
            </form>

            {isSearchOpen && matches.length > 0 ? (
              <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark">
                {matches.map((entry) => (
                  <button
                    key={entry.href}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => goTo(entry.href)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-theme-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    <span className="truncate">{entry.label}</span>
                    <span className="shrink-0 text-theme-xs text-gray-400 dark:text-gray-500">
                      {entry.group}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-2 px-3 py-3 2xsm:gap-3 xl:w-auto xl:px-0 xl:py-4">
          {/* Theme toggle — delegates to Payload's own theme provider */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="flex size-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
          >
            {theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
          </button>

          {/* Quick links */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsQuickLinksOpen((prev) => !prev)}
              aria-label="Quick links"
              className={cn(
                'dropdown-toggle relative flex size-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5',
                isQuickLinksOpen && 'bg-gray-100 dark:bg-white/5',
              )}
            >
              <BellIcon size={20} />
            </button>
            <Dropdown
              isOpen={isQuickLinksOpen}
              onClose={() => setIsQuickLinksOpen(false)}
              className="w-64 p-2"
            >
              <p className="px-3 py-2 text-theme-xs font-medium text-gray-400 uppercase dark:text-gray-500">
                Shortcuts
              </p>
              <DropdownItem
                href="/admin"
                icon={<SettingsIcon size={18} />}
                onItemClick={() => setIsQuickLinksOpen(false)}
              >
                Payload dashboard
              </DropdownItem>
              <DropdownItem
                href="/admin/account"
                icon={<UserCircleIcon size={18} />}
                onItemClick={() => setIsQuickLinksOpen(false)}
              >
                My account
              </DropdownItem>
              <DropdownItem
                href="/api/graphql"
                icon={<ExternalLinkIcon size={18} />}
                onItemClick={() => setIsQuickLinksOpen(false)}
              >
                GraphQL API
              </DropdownItem>
              <DropdownItem
                href="https://payloadcms.com/docs"
                icon={<ExternalLinkIcon size={18} />}
                onItemClick={() => setIsQuickLinksOpen(false)}
              >
                Payload docs
              </DropdownItem>
            </Dropdown>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-label="Account menu"
              className="dropdown-toggle flex items-center gap-2 rounded-full"
            >
              <Avatar
                src={user?.avatarUrl}
                name={user?.name ?? user?.email ?? 'Admin'}
                alt={user?.name ?? user?.email ?? 'Admin'}
                size="medium"
              />
            </button>
            <Dropdown
              isOpen={isUserMenuOpen}
              onClose={() => setIsUserMenuOpen(false)}
              className="w-56 p-2"
            >
              <div className="border-b border-gray-200 px-3 pb-3 mb-1 dark:border-gray-800">
                <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {user?.name ?? user?.email ?? 'Signed in'}
                </p>
                {user?.email ? (
                  <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
                    {user.email}
                  </p>
                ) : null}
              </div>
              <DropdownItem
                href={user?.accountHref ?? '/admin/account'}
                icon={<UserCircleIcon size={18} />}
                onItemClick={() => setIsUserMenuOpen(false)}
              >
                Edit profile
              </DropdownItem>
              <DropdownItem
                href={user?.logoutHref ?? '/admin/logout'}
                icon={<LogOutIcon size={18} />}
                onItemClick={() => setIsUserMenuOpen(false)}
              >
                Sign out
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
      </div>
    </header>
  )
}
