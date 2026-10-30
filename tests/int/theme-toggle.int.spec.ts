import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeToggle } from '@/app/(frontend)/components/ui/ThemeToggle'

describe('Decoupled ThemeToggle UI Component', () => {
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

  it('hydrates from persisted localStorage preference and supports controlled mode', () => {
    window.localStorage.setItem('pocms-theme', 'light')
    const { unmount } = render(React.createElement(ThemeToggle))

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
