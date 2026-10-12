'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { TAILADMIN_BASE_PATH, TAILADMIN_UIKIT_PATH } from '../paths'
import { GridIcon, PaletteIcon } from '../icons'
import { cn } from '../lib/cn'

import '../styles/tailadmin.css'

/**
 * Injected into Payload's sidebar through `admin.components.afterNavLinks`.
 *
 * This is the "additive" entry point of the pilot: Payload's own navigation is
 * untouched, editors just get two extra links that open the TailAdmin surfaces.
 *
 * Uses the `.ta-inline` scope (not `.ta-root`) so the injected markup does not
 * repaint the background/typography of Payload's nav container.
 */
const links = [
  { href: TAILADMIN_BASE_PATH, label: 'TailAdmin dashboard', Icon: GridIcon },
  { href: TAILADMIN_UIKIT_PATH, label: 'TailAdmin UI kit', Icon: PaletteIcon },
]

export function TailAdminNavLinks() {
  const pathname = usePathname() ?? ''

  return (
    <div className="ta-inline mt-4 flex flex-col gap-1 px-3">
      <span className="mb-1 block text-theme-xs font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
        TailAdmin pilot
      </span>
      {links.map(({ href, label, Icon }) => {
        const isActive = pathname.endsWith(href)
        return (
          <Link
            key={href}
            href={`/admin${href}`}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/12 dark:text-brand-400'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={18} className={isActive ? 'text-brand-500 dark:text-brand-400' : undefined} />
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
    </div>
  )
}

export default TailAdminNavLinks
