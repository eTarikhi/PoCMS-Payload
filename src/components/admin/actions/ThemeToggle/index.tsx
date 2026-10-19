'use client'

import { useTheme } from '@payloadcms/ui'
import { MoonIcon, SunIcon } from 'lucide-react'
import React from 'react'

import { buttonVariants } from '@/components/admin/elements/Button'
import { cn } from '@/components/admin/utilities/cn'
import { switchTheme } from '@/components/admin/utilities/themeTransition'

/**
 * The page background per theme (--theme-bg: Payload's white, and --theme-elevation-0 in
 * tokens.css for dark). Chrome on Android and Safari tint the browser's toolbar with it.
 */
const THEME_COLOR = { light: '#ffffff', dark: '#12141d' } as const

/**
 * Header action (`admin.components.actions`): switches between light and dark. It uses Payload's
 * theme provider, so the choice is stored in Payload's own cookie and matches the account
 * settings. The icon shows the theme you switch to; the new theme spreads from the button.
 *
 * It also renders the theme-color meta tag (React puts it in the document head), so the browser's
 * toolbar on phones matches the admin's background in both themes.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <>
      <meta name="theme-color" content={THEME_COLOR[isDark ? 'dark' : 'light']} />
      <button
        type="button"
        data-slot="button"
        data-testid="theme-toggle"
        aria-label={label}
        title={label}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          switchTheme(setTheme, isDark ? 'light' : 'dark', {
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
          })
        }}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'acn:rounded-full')}
      >
        {isDark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
      </button>
    </>
  )
}

export default ThemeToggle
