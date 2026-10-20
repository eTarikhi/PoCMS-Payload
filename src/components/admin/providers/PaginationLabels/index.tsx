'use client'

import { useEffect } from 'react'

import { useCustomT } from '@/i18n/useCustomT'

import { labelPaginationArrows, PAGINATION_LABELS } from './labels'

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
/** Re-exported so existing imports keep working; the implementation is in `./labels`. */
export { labelPaginationArrows, PAGINATION_LABELS }

export function PaginationLabels() {
  const t = useCustomT()
  useEffect(() => {
    labelPaginationArrows(document, t)
    let frame = 0
    // Lists re-render their paginator on every page change and inside drawers, so watch the DOM
    // instead of labelling once. The callback is coalesced into one animation frame.
    const observer = new MutationObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        labelPaginationArrows(document, t)
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [t])

  return null
}

export default PaginationLabels
