'use client'

import { useTheme } from '@payloadcms/ui'
import React from 'react'

const SunIcon: React.FC = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="18"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    width="18"
  >
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M4.7 4.7l1.7 1.7M17.6 17.6l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.7 19.3l1.7-1.7M17.6 6.4l1.7-1.7" />
  </svg>
)

const MoonIcon: React.FC = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="18"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    width="18"
  >
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
  </svg>
)

/**
 * Dark/light theme toggle for the admin header actions cluster.
 * Shows the mode you would switch to (moon in light mode, sun in dark).
 * Writes Payload's `payload-theme` cookie through the ThemeProvider, so the
 * choice persists across reloads and html[data-theme] flips instantly.
 */
export const ThemeToggleButton: React.FC = () => {
  const { theme, setTheme } = useTheme()

  const isDark = theme === 'dark'

  return (
    <button
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="pocms-theme-toggle"
      title={isDark ? 'Light mode' : 'Dark mode'}
      type="button"
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark')
      }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

export default ThemeToggleButton
