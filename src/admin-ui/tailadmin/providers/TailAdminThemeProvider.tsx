'use client'

import { useEffect } from 'react'

import '../styles/payload-bridge.css'

/**
 * Registered through `admin.components.providers` in `full` mode.
 *
 * Payload wraps the whole admin panel in every component listed there, which
 * makes it the correct place to switch the TailAdmin theme bridge on: the
 * provider sets `html[data-ta-theme="on"]`, and `styles/payload-bridge.css`
 * keys every rule off that attribute. Unmounting (or switching
 * `POCMS_ADMIN_UI` back to `additive`) removes the attribute and the stock
 * Payload theme returns — no CSS is left behind.
 */
export function TailAdminThemeProvider({ children }: { children?: React.ReactNode }) {
  useEffect(() => {
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
