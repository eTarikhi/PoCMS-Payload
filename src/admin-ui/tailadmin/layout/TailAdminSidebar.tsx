'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useSidebar } from '../context/TailAdminSidebarContext'
import type { Branding, SidebarItem, SidebarSection } from '../data/types'
import { ChevronDownIcon, ExternalLinkIcon, getIcon, HorizontaLDots } from '../icons'
import { cn } from '../lib/cn'

/**
 * Ported from TailAdmin Free `src/layout/AppSidebar.tsx`.
 *
 * The markup, spacing, collapse/hover behaviour and animated submenus are the
 * upstream ones. The important difference is the *data*: upstream hard-codes a
 * demo menu, this version renders `sections` built from the real Payload config
 * and the signed-in user's permissions (see `data/navGroups.ts`).
 */
export type TailAdminSidebarProps = {
  sections: SidebarSection[]
  branding: Branding
  /** Rendered in the sidebar footer (usually a link back to Payload's admin). */
  footer?: SidebarItem[]
}


type SubmenuKey = { section: number; index: number }

function isHrefActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))
}

/** Which submenu (if any) owns the current route. */
function findOpenSubmenu(sections: SidebarSection[], pathname: string): SubmenuKey | null {
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const items = sections[sectionIndex].items
    for (let index = 0; index < items.length; index += 1) {
      const children = items[index].children
      if (children?.some((child) => isHrefActive(pathname, child.href))) {
        return { section: sectionIndex, index }
      }
    }
  }
  return null
}

export default function TailAdminSidebar({ sections, branding, footer = [] }: TailAdminSidebarProps) {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar()
  const pathname = usePathname() ?? ''

  const showLabels = isExpanded || isHovered || isMobileOpen

  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKey | null>(() =>
    findOpenSubmenu(sections, pathname),
  )
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({})
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const isActive = useCallback((href: string) => isHrefActive(pathname, href), [pathname])

  // Open the submenu that contains the current route. Derived during render
  // (React's "adjust state when a prop changes" pattern) rather than in an
  // effect, so the sidebar never paints a closed submenu for one frame.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setOpenSubmenu(findOpenSubmenu(sections, pathname))
  }

  // Animate submenu height.
  useEffect(() => {
    if (openSubmenu === null) return
    const key = `${openSubmenu.section}-${openSubmenu.index}`
    const node = subMenuRefs.current[key]
    if (node) {
      setSubMenuHeight((prev) => ({ ...prev, [key]: node.scrollHeight || 0 }))
    }
  }, [openSubmenu, showLabels])

  const toggleSubmenu = (sectionIndex: number, index: number) => {
    setOpenSubmenu((prev) =>
      prev && prev.section === sectionIndex && prev.index === index
        ? null
        : { section: sectionIndex, index },
    )
  }

  const renderItem = (item: SidebarItem, sectionIndex: number, index: number) => {
    const itemKey = `${sectionIndex}-${index}`

    if (item.children && item.children.length > 0) {
      const isOpen = openSubmenu?.section === sectionIndex && openSubmenu?.index === index
      const Icon = getIcon(item.icon)
      return (
        <li key={itemKey}>
          <button
            type="button"
            onClick={() => toggleSubmenu(sectionIndex, index)}
            aria-expanded={isOpen}
            className={cn(
              'group menu-item cursor-pointer',
              isOpen ? 'menu-item-active' : 'menu-item-inactive',
              !showLabels && 'lg:justify-center',
            )}
          >
            <span className={cn(isOpen ? 'menu-item-icon-active' : 'menu-item-icon-inactive')}>
              <Icon />
            </span>
            {showLabels && <span className="menu-item-text truncate">{item.label}</span>}
            {showLabels && (
              <ChevronDownIcon
                className={cn(
                  'ms-auto h-5 w-5 shrink-0 transition-transform duration-200',
                  isOpen ? 'rotate-180 text-brand-500 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400',
                )}
              />
            )}
          </button>

          {showLabels && (
            <div
              ref={(el) => {
                subMenuRefs.current[itemKey] = el
              }}
              className="overflow-hidden transition-all duration-300"
              style={{ height: isOpen ? `${subMenuHeight[itemKey] ?? 0}px` : '0px' }}
            >
              <ul className="ms-9 mt-2 space-y-1">
                {item.children.map((child) => (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      className={cn(
                        'menu-dropdown-item',
                        isActive(child.href)
                          ? 'menu-dropdown-item-active'
                          : 'menu-dropdown-item-inactive',
                      )}
                    >
                      <span className="truncate">{child.label}</span>
                      {child.badge ? (
                        <span
                          className={cn(
                            'menu-dropdown-badge ms-auto',
                            isActive(child.href)
                              ? 'menu-dropdown-badge-active'
                              : 'menu-dropdown-badge-inactive',
                          )}
                        >
                          {child.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      )
    }

    const Icon = getIcon(item.icon)
    const active = isActive(item.href)
    const inner = (
      <>
        <span className={cn(active ? 'menu-item-icon-active' : 'menu-item-icon-inactive')}>
          <Icon />
        </span>
        {showLabels && <span className="menu-item-text truncate">{item.label}</span>}
        {showLabels && item.external && (
          <ExternalLinkIcon className="ms-auto h-4 w-4 shrink-0 text-gray-400" />
        )}
        {showLabels && item.badge && (
          <span
            className={cn(
              'menu-dropdown-badge ms-auto',
              active ? 'menu-dropdown-badge-active' : 'menu-dropdown-badge-inactive',
            )}
          >
            {item.badge}
          </span>
        )}
      </>
    )

    const className = cn(
      'group menu-item',
      active ? 'menu-item-active' : 'menu-item-inactive',
      !showLabels && 'lg:justify-center',
    )

    return (
      <li key={itemKey}>
        {item.external ? (
          <a href={item.href} className={className} target="_blank" rel="noopener noreferrer">
            {inner}
          </a>
        ) : (
          <Link href={item.href} className={className}>
            {inner}
          </Link>
        )}
      </li>
    )
  }

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-50 flex h-full flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out',
        'dark:border-gray-800 dark:bg-gray-900 dark:text-white',
        isExpanded || isMobileOpen || isHovered ? 'w-72.5' : 'w-22.5',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        'xl:translate-x-0',
      )}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="TailAdmin navigation"
    >
      {/* Brand */}
      <div className={cn('flex py-6', !showLabels && 'xl:justify-center')}>
        <Link href="/admin" className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white shadow-theme-xs">
            {branding.shortName ?? branding.name.slice(0, 2).toUpperCase()}
          </span>
          {showLabels && (
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
          )}
        </Link>
      </div>

      {/* Nav */}
      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {sections.map((section, sectionIndex) => (
              <div key={`${section.label}-${sectionIndex}`}>
                <h2
                  className={cn(
                    'mb-4 flex text-xs leading-5 text-gray-400 uppercase',
                    !showLabels ? 'xl:justify-center' : 'justify-start',
                  )}
                >
                  {showLabels ? section.label : <HorizontaLDots className="size-5" />}
                </h2>
                <ul className="flex flex-col gap-1">
                  {section.items.map((item, index) => renderItem(item, sectionIndex, index))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>

      {/* Footer */}
      {footer.length > 0 && showLabels ? (
        <div className="mt-auto border-t border-gray-200 py-4 dark:border-gray-800">
          <ul className="flex flex-col gap-1">
            {footer.map((item, index) => renderItem(item, 900, index))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}
