'use client'

import { useEffect } from 'react'

/**
 * Gives Payload's list pagination arrows an accessible name.
 *
 * `ClickableArrow` in @payloadcms/ui 3.90 renders `<button class="clickable-arrow
 * clickable-arrow--left|right"><svg/></button>` with no text and no `aria-label`, so axe reports
 * `button-name` (critical) on every paginated list — the audit log, pages, articles, the media
 * drawer and the relationship pickers. There is no config slot to replace the paginator, and
 * patching the pre-bundled, minified `@payloadcms/ui` for one attribute would have to be redone on
 * every Payload upgrade, so this tiny client component labels the buttons in the DOM instead.
 *
 * It only ever adds `aria-label`, and only when the button has no accessible name yet, so a future
 * Payload version that ships its own label wins. Documented in
 * docs/ui-modernization/admin-ui-guide.md ("Known upstream gaps").
 */
const LABELS: Record<string, string> = { left: 'Previous page', right: 'Next page' }

function label(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('button.clickable-arrow')) {
    if (button.hasAttribute('aria-label')) continue
    const direction = button.classList.contains('clickable-arrow--left') ? 'left' : 'right'
    if (button.textContent?.trim()) continue
    button.setAttribute('aria-label', LABELS[direction])
  }
}

export function PaginationLabels() {
  useEffect(() => {
    label()
    let frame = 0
    // Lists re-render their paginator on every page change and inside drawers, so watch the DOM
    // instead of labelling once. The callback is coalesced into one animation frame.
    const observer = new MutationObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        label()
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return null
}

export default PaginationLabels
