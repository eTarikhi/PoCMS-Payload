'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react'

/**
 * Ported from TailAdmin Free `src/context/SidebarContext.tsx`.
 *
 * Adaptations for this repository:
 *  - `usePathname` comes from `next/navigation` instead of the next-intl
 *    wrapper (no next-intl here);
 *  - the mobile breakpoint is tracked with `useSyncExternalStore` + a media
 *    query instead of a `resize` listener that calls `setState` inside an
 *    effect (React 19's `react-hooks/set-state-in-effect` rule);
 *  - "close the drawer on route change" uses React's documented
 *    *adjust-state-during-render* pattern instead of an effect.
 */
type SidebarContextType = {
  isExpanded: boolean
  isMobileOpen: boolean
  isHovered: boolean
  activeItem: string | null
  openSubmenu: string | null
  toggleSidebar: () => void
  toggleMobileSidebar: () => void
  setIsHovered: (isHovered: boolean) => void
  setActiveItem: (item: string | null) => void
  toggleSubmenu: (item: string) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function useSidebar(): SidebarContextType {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a TailAdminSidebarProvider')
  }
  return context
}

/** TailAdmin collapses the sidebar into a drawer below its `xl` breakpoint. */
const MOBILE_QUERY = '(max-width: 1279px)'

function subscribeToMobile(callback: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getIsMobile(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getIsMobileOnServer(): boolean {
  return false
}

export const TailAdminSidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname() ?? ''

  const [isExpanded, setIsExpanded] = useState(true)
  const [isMobileOpenState, setIsMobileOpenState] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)

  const isMobile = useSyncExternalStore(subscribeToMobile, getIsMobile, getIsMobileOnServer)

  // Close the mobile drawer whenever the route changes. Setting state during
  // render (guarded by a comparison with the previous value) is the pattern
  // React recommends for "reset state when a prop changes" — it avoids the
  // extra commit an effect would cause.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    if (isMobileOpenState) setIsMobileOpenState(false)
  }

  const toggleSidebar = useCallback(() => setIsExpanded((prev) => !prev), [])
  const toggleMobileSidebar = useCallback(() => setIsMobileOpenState((prev) => !prev), [])
  const toggleSubmenu = useCallback(
    (item: string) => setOpenSubmenu((prev) => (prev === item ? null : item)),
    [],
  )

  return (
    <SidebarContext.Provider
      value={{
        isExpanded: isMobile ? false : isExpanded,
        isMobileOpen: isMobile ? isMobileOpenState : false,
        isHovered,
        activeItem,
        openSubmenu,
        toggleSidebar,
        toggleMobileSidebar,
        setIsHovered,
        setActiveItem,
        toggleSubmenu,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export default TailAdminSidebarProvider
