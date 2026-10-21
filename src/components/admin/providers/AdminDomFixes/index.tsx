'use client'

import { useEffect } from 'react'

import { labelPaginationArrows } from '@/components/admin/providers/PaginationLabels/labels'
import { useCustomT } from '@/i18n/useCustomT'

import {
  makeFolderCreateButtonFocusable,
  nameFolderControls,
  nameFolderThumbnails,
} from './folders'
import { ensureLandmarks } from './landmarks'
import { nameIconOnlyControls } from './names'
import { fixSeoFieldNotes, hideSeoPreview } from './seo'
import { skipHiddenSelectControls } from './reactSelect'
import { nameSelectionCheckboxes } from './selection'
import { presentTabRows, trustVisibleTabText } from './tabs'

/**
 * The DOM-level accessibility fixes Payload's config cannot express (roadmap P6.2): the main
 * landmark and skip link, names for the row-selection checkboxes, the hidden select chevrons out of
 * the tab order, and the document tab row's list semantics. Each helper only fills in something
 * missing, so a Payload upgrade that ships the fix itself wins — see the module comments for the
 * upstream markup. Icon-only document controls (the "…" menu, edit/remove on an upload) get names,
 * and the same goes for the folder browser's view toggles and its unlabelled thumbnails. The SEO
 * plugin's inline-styled notes, pills and mock preview links are marked or hidden here so CSS can
 * colour them and the tab order skips the preview.
 *
 * One MutationObserver drives all of them, coalesced into an animation frame: the admin replaces
 * whole views on client-side navigation, re-renders the paginator on page changes and rebuilds
 * tables when a filter changes, so a one-shot pass would miss most screens.
 */
export function AdminDomFixes() {
  const t = useCustomT()

  useEffect(() => {
    const apply = () => {
      labelPaginationArrows(document, t)
      nameSelectionCheckboxes(document, t)
      skipHiddenSelectControls(document)
      nameIconOnlyControls(document, t)
      nameFolderControls(document, t)
      nameFolderThumbnails(document, t)
      fixSeoFieldNotes(document)
      hideSeoPreview(document)
      makeFolderCreateButtonFocusable(document)
      presentTabRows(document)
      trustVisibleTabText(document)
      ensureLandmarks(document, t)
    }
    apply()

    let frame = 0
    const observer = new MutationObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        apply()
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

export default AdminDomFixes
