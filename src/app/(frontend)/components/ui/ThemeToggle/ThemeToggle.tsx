'use client'

import React, { useCallback, useEffect, useSyncExternalStore } from 'react'

import styles from './ThemeToggle.module.css'

export type ThemeMode = 'light' | 'dark'

export interface ThemeToggleProps {
  /**
   * Optional controlled theme value. When omitted, `ThemeToggle` manages
   * state via `useSyncExternalStore` (`localStorage` + `prefers-color-scheme`)
   * and syncs `document.documentElement.dataset.theme`.
   */
  theme?: ThemeMode
  /**
   * Initial fallback theme rendered during SSR and when no persisted or OS
   * preference overrides it. Defaults to `'dark'` to match PoCMS's obsidian
   * canvas (`#0d0f17`).
   */
  defaultTheme?: ThemeMode
  /**
   * Callback fired whenever the user toggles between `'light'` and `'dark'`.
   */
  onThemeChange?: (nextTheme: ThemeMode) => void
  /**
   * `localStorage` key used in uncontrolled mode. Set to `null` to disable persistence.
   * @default 'pocms-theme'
   */
  storageKey?: string | null
  /**
   * Synchronize `data-theme="<mode>"` and CSS `color-scheme` on `<html>`.
   * @default true
   */
  syncDocumentAttribute?: boolean
  /**
   * Show the inline `"Dark"` / `"Light"` editorial pill label beside the switch track.
   * @default false
   */
  showLabel?: boolean
  /**
   * Visual scale preset: `'md'` for discovery docks / topbars, `'sm'` for dense navbars.
   * @default 'md'
   */
  size?: 'sm' | 'md'
  /**
   * Optional extra class name applied to the outer wrapper.
   */
  className?: string
}

const THEME_CHANGE_EVENT = 'pocms:theme-change'
const inMemoryThemeFallback = new Map<string, ThemeMode>()
const IN_MEMORY_DEFAULT_KEY = '__pocms_ephemeral_theme__'

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.25v2.25M12 19.5v2.25M4.93 4.93l1.6 1.6M17.47 17.47l1.6 1.6M2.25 12h2.25M19.5 12h2.25M4.93 19.07l1.6-1.6M17.47 6.53l1.6-1.6" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.35 14.65A8.5 8.5 0 0 1 9.35 3.65a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  )
}

function applyDocumentTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
}

function readClientThemeSnapshot(storageKey: string | null, fallback: ThemeMode): ThemeMode {
  if (typeof window === 'undefined') return fallback

  if (storageKey) {
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored === 'light' || stored === 'dark') {
        return stored
      }
    } catch {
      const mem = inMemoryThemeFallback.get(storageKey)
      if (mem) return mem
    }
  } else {
    const ephemeral = inMemoryThemeFallback.get(IN_MEMORY_DEFAULT_KEY)
    if (ephemeral) return ephemeral
  }

  const rootAttr = document.documentElement.dataset.theme
  if (rootAttr === 'light' || rootAttr === 'dark') {
    return rootAttr
  }

  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
  }

  return fallback
}

function subscribeToThemeStore(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const mediaQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null

  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  mediaQuery?.addEventListener('change', onStoreChange)

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
    mediaQuery?.removeEventListener('change', onStoreChange)
  }
}

/**
 * Decoupled Light/Dark theme switch tailored to the PoCMS Obsidian & Solar-Gold
 * design language. Self-contained via CSS Modules + React 19 `useSyncExternalStore`
 * with zero global style side effects or context provider boilerplate.
 */
export function ThemeToggle({
  theme: controlledTheme,
  defaultTheme = 'dark',
  onThemeChange,
  storageKey = 'pocms-theme',
  syncDocumentAttribute = true,
  showLabel = false,
  size = 'md',
  className,
}: ThemeToggleProps) {
  const isControlled = controlledTheme !== undefined

  const getClientSnapshot = useCallback(
    () => readClientThemeSnapshot(storageKey, defaultTheme),
    [defaultTheme, storageKey],
  )
  const getServerSnapshot = useCallback((): ThemeMode => defaultTheme, [defaultTheme])

  const externalTheme = useSyncExternalStore(
    subscribeToThemeStore,
    getClientSnapshot,
    getServerSnapshot,
  )

  const activeTheme: ThemeMode = isControlled ? controlledTheme : externalTheme
  const isDark = activeTheme === 'dark'
  const nextTheme: ThemeMode = isDark ? 'light' : 'dark'

  // Synchronize external DOM attributes without triggering React state cascades.
  useEffect(() => {
    if (syncDocumentAttribute) {
      applyDocumentTheme(activeTheme)
    }
  }, [activeTheme, syncDocumentAttribute])

  const handleToggle = useCallback(() => {
    if (!isControlled && typeof window !== 'undefined') {
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, nextTheme)
        } catch {
          inMemoryThemeFallback.set(storageKey, nextTheme)
        }
      } else {
        inMemoryThemeFallback.set(IN_MEMORY_DEFAULT_KEY, nextTheme)
      }
      if (syncDocumentAttribute) {
        applyDocumentTheme(nextTheme)
      }
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
    } else if (syncDocumentAttribute) {
      applyDocumentTheme(nextTheme)
    }

    onThemeChange?.(nextTheme)
  }, [isControlled, nextTheme, onThemeChange, storageKey, syncDocumentAttribute])

  const wrapperClasses = [
    styles.wrapper,
    isDark ? styles.isDark : styles.isLight,
    size === 'sm' ? styles.sizeSm : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const buttonClasses = [
    styles.switchBtn,
    showLabel ? styles.switchBtnWithLabel : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapperClasses} data-theme-toggle-state={activeTheme}>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={`Dark mode (${isDark ? 'currently on, switch to light mode' : 'currently off, switch to dark mode'})`}
        title={`Switch to ${nextTheme} mode`}
        onClick={handleToggle}
        className={buttonClasses}
      >
        <span className={styles.track} aria-hidden="true">
          <span className={`${styles.trackCue} ${styles.trackCueSun}`}>
            <SunIcon />
          </span>
          <span className={`${styles.trackCue} ${styles.trackCueMoon}`}>
            <MoonIcon />
          </span>
          <span className={styles.thumb}>
            <SunIcon className={`${styles.thumbGlyph} ${styles.glyphSun}`} />
            <MoonIcon className={`${styles.thumbGlyph} ${styles.glyphMoon}`} />
          </span>
        </span>

        {showLabel ? (
          <span className={styles.labelGroup}>
            <span className={styles.labelText}>{isDark ? 'Dark' : 'Light'}</span>
          </span>
        ) : null}

        <span className={styles.srOnly} aria-live="polite">
          {isDark ? 'Dark theme active' : 'Light theme active'}
        </span>
      </button>
    </div>
  )
}

export default ThemeToggle
