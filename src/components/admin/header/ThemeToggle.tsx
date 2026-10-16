'use client'

import { useTheme } from '@payloadcms/ui'
import { MoonIcon, SunIcon } from 'lucide-react'
import React from 'react'

import { cn } from '../lib/utils'
import { buttonVariants } from '../ui/button'
import { switchTheme } from './themeTransition'

/**
 * Header action (`admin.components.actions`): switches between light and dark. It uses Payload's
 * theme provider, so the choice is stored in Payload's own cookie and matches the account
 * settings. The icon shows the theme you switch to; the new theme spreads from the button.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'
  return (
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
  )
}

export default ThemeToggle
