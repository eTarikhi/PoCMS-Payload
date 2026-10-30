import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import {
  ENABLE_FLOATING_THEME_TOGGLE,
  FloatingThemeToggle,
  ThemeInitScript,
  ThemeToggle,
} from '@/app/(frontend)/components/ui/ThemeToggle'

describe('Decoupled & Feature-Flagged ThemeToggle UI Component', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    document.documentElement.style.colorScheme = ''
  })

  afterEach(() => {
    cleanup()
  })

  it('defaults to PoCMS dark mode, exposes WAI-ARIA switch semantics, and persists toggles', () => {
    render(React.createElement(ThemeToggle, { showLabel: true }))

    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Light')).toBeTruthy()
    expect(window.localStorage.getItem('pocms-theme')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(window.localStorage.getItem('pocms-theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('hides the floating pill in SiteChrome while ENABLE_FLOATING_THEME_TOGGLE is false and resets stale light mode', () => {
    expect(ENABLE_FLOATING_THEME_TOGGLE).toBe(false)
    document.documentElement.dataset.theme = 'light'

    render(
      React.createElement(
        SiteChrome,
        { footer: null },
        React.createElement('main', { id: 'main-content' }, 'Page content'),
      ),
    )

    expect(screen.queryByRole('switch')).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('renders FloatingThemeToggle and ThemeInitScript when enabled=true and supports controlled mode', () => {
    const { container: initContainer, unmount: unmountInit } = render(
      React.createElement(ThemeInitScript, { enabled: true }),
    )
    const scriptTag = initContainer.querySelector('script')
    expect(scriptTag?.innerHTML).toContain('pocms-theme')
    unmountInit()

    window.localStorage.setItem('pocms-theme', 'light')
    const { unmount } = render(React.createElement(FloatingThemeToggle, { enabled: true }))

    const region = screen.getByRole('complementary', { name: /Color theme/i })
    expect(region).toBeTruthy()
    const hydratedSwitch = screen.getByRole('switch')
    expect(hydratedSwitch.getAttribute('aria-checked')).toBe('false')
    expect(document.documentElement.dataset.theme).toBe('light')
    unmount()

    window.localStorage.clear()
    const onThemeChange = vi.fn()
    const { rerender } = render(
      React.createElement(ThemeToggle, {
        theme: 'dark',
        onThemeChange,
        storageKey: null,
        syncDocumentAttribute: false,
        size: 'sm',
      }),
    )

    const controlledSwitch = screen.getByRole('switch')
    expect(controlledSwitch.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(controlledSwitch)
    expect(onThemeChange).toHaveBeenCalledTimes(1)
    expect(onThemeChange).toHaveBeenCalledWith('light')
    expect(window.localStorage.getItem('pocms-theme')).toBeNull()

    rerender(
      React.createElement(ThemeToggle, {
        theme: 'light',
        onThemeChange,
        storageKey: null,
        syncDocumentAttribute: false,
        size: 'sm',
      }),
    )
    expect(controlledSwitch.getAttribute('aria-checked')).toBe('false')
  })
})
