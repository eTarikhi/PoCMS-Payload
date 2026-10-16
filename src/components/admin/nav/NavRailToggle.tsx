'use client'

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { NAV_RAIL_COOKIE } from './navRail'

/**
 * Collapses the open sidebar to an icon rail on desktop (and back). Payload's own toggler still
 * hides the sidebar completely; this only changes its width. The state lives in a cookie, so the
 * server renders the rail directly on the next visit (no flash), and in `data-nav-rail`, which the
 * styles in nav-rail.css read through :has().
 */
export function NavRailToggle({ initialRail }: { initialRail: boolean }) {
  const [rail, setRail] = useState(initialRail)

  useEffect(() => {
    document.cookie = `${NAV_RAIL_COOKIE}=${rail ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
    // Rail tooltips read the link text from data-nav-label (the label itself is visually hidden).
    document.querySelectorAll<HTMLElement>('.nav .nav__link').forEach((link) => {
      const label = link.querySelector('.nav__link-label')?.textContent?.trim()
      if (label) link.dataset.navLabel = label
    })
  }, [rail])

  const label = rail ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <button
      type="button"
      id="nav-rail-toggle"
      className="nav__link nav-rail-toggle"
      data-nav-rail={rail ? 'true' : 'false'}
      data-nav-label={label}
      aria-pressed={rail}
      onClick={() => setRail((value) => !value)}
    >
      {rail ? <PanelLeftOpenIcon aria-hidden /> : <PanelLeftCloseIcon aria-hidden />}
      <span className="nav__link-label">{label}</span>
    </button>
  )
}
