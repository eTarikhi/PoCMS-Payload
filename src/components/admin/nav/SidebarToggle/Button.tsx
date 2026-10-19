'use client'

import { useNav } from '@payloadcms/ui'
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { NAV_RAIL_COOKIE } from './navRail'

const DESKTOP = '(min-width: 1025px)'

/**
 * The one sidebar control on desktop, at the top of the sidebar where Payload's toggler was:
 * collapses the sidebar to the icon rail (hoverable icons with tooltips) and expands it again.
 * Below 1025px it is hidden and Payload's toggler stays the mobile menu button.
 *
 * On desktop the sidebar is never fully hidden any more, so a closed sidebar (an older preference)
 * is reopened. The rail state is a cookie, so the server renders it on the next visit (no flash),
 * and `data-nav-rail` on this button drives nav-rail.css through :has().
 */
export function SidebarToggleButton({ initialRail }: { initialRail: boolean }) {
  const [rail, setRail] = useState(initialRail)
  const { hydrated, navOpen, setNavOpen } = useNav()

  useEffect(() => {
    document.cookie = `${NAV_RAIL_COOKIE}=${rail ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
    // Rail tooltips read the link text from data-nav-label (the label itself is visually hidden).
    document.querySelectorAll<HTMLElement>('.nav .nav__link').forEach((link) => {
      const label = link.querySelector('.nav__link-label')?.textContent?.trim()
      if (label) link.dataset.navLabel = label
    })
    document.querySelectorAll<HTMLElement>('.nav .nav-group__toggle').forEach((toggle) => {
      const label = toggle.querySelector('.nav-group__label')?.textContent?.trim()
      if (label) toggle.dataset.navLabel = label
    })
  }, [rail])

  useEffect(() => {
    if (!hydrated) return
    const desktop = window.matchMedia(DESKTOP)
    const reopen = () => {
      if (desktop.matches && !navOpen) setNavOpen(true)
    }
    reopen()
    desktop.addEventListener('change', reopen)
    return () => desktop.removeEventListener('change', reopen)
  }, [hydrated, navOpen, setNavOpen])

  const label = rail ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <button
      type="button"
      id="nav-rail-toggle"
      className="sidebar-toggle"
      data-nav-rail={rail ? 'true' : 'false'}
      aria-pressed={rail}
      aria-label={label}
      title={label}
      onClick={() => setRail((value) => !value)}
    >
      {rail ? <PanelLeftOpenIcon aria-hidden /> : <PanelLeftCloseIcon aria-hidden />}
    </button>
  )
}
