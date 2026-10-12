'use client'

import { useEffect, useLayoutEffect } from 'react'

import '../styles/tailadmin-theme.css'

// Apply the theme attribute in the layout phase to minimize an unthemed frame
// during client navigation. The isomorphic alias also avoids a server-render
// warning while retaining the layout-phase update in the browser.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Registered through `admin.components.providers` in `full` mode.
 *
 * Payload wraps the whole admin panel in every component listed there, which
 * makes it the correct place to switch the TailAdmin theme on: the provider
 * sets `html[data-ta-theme="on"]`, and `styles/tailadmin-theme.css` keys every
 * rule off that attribute. Because providers wrap **every** admin route, the
 * theme applies to all pages and elements — login, dashboard, lists, edits,
 * drawers, modals, account, everything. Unmounting (or switching
 * `POCMS_ADMIN_UI` away from `full`) removes the attribute and the stock
 * Payload theme returns — no CSS is left behind.
 */
export function TailAdminThemeProvider({ children }: { children?: React.ReactNode }) {
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-ta-theme')
    root.setAttribute('data-ta-theme', 'on')

    return () => {
      if (previous === null) root.removeAttribute('data-ta-theme')
      else root.setAttribute('data-ta-theme', previous)
    }
  }, [])

  return <>{children}</>
}

export default TailAdminThemeProvider
