import type { CollectionSlug } from 'payload'

/** "G then <key>" navigation shortcuts. Collections the user can't see are skipped at runtime. */
export const GO_SHORTCUTS: { key: string; label: string; target: CollectionSlug | null }[] = [
  { key: 'd', label: 'Dashboard', target: null },
  { key: 'a', label: 'Articles', target: 'articles' },
  { key: 'p', label: 'Projects', target: 'projects' },
  { key: 's', label: 'Services', target: 'services' },
  { key: 'm', label: 'Media', target: 'media' },
  { key: 'e', label: 'Experiences', target: 'experiences' },
  { key: 'k', label: 'Skills', target: 'skills' },
  { key: 'c', label: 'Certificates', target: 'certificates' },
  { key: 'u', label: 'Users', target: 'users' },
  { key: 'l', label: 'Audit logs', target: 'audit-logs' },
]

const KEY = 'pocms-key-shortcuts'

/**
 * Single-key shortcuts (`/`, `?`, `G then …`) can be turned off (WCAG 2.1.4, Character Key
 * Shortcuts). Ctrl+K / Cmd+K always works.
 */
export function keyShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setKeyShortcutsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEY, enabled ? 'on' : 'off')
  } catch {
    // Not persisted in private mode.
  }
}

/** Typing in a field, an editor or a select must never trigger single-key shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]',
    ),
  )
}
