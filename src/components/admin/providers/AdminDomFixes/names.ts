/**
 * Accessible names for Payload's icon-only document controls (P6.2).
 *
 * Four components in @payloadcms/ui 3.90 render a button whose only content is an SVG:
 *
 *   <button class="popup-button"><div class="doc-controls__dots">…</div></button>
 *   <button class="upload-relationship-details__edit"><span class="btn__icon">…</svg></button>
 *   <button class="upload-relationship-details__remove"><span class="btn__icon">…</svg></button>
 *   <button class="date-time-picker__clear-button"><svg/></button>
 *
 * so axe reports `button-name` (critical) on every edit screen that has a document with a file (the
 * article hero image) or an optional date field: five buttons with no name a screen reader can
 * announce. Payload passes no label to them and there is no config slot for document controls, so
 * this module names them in the DOM — the same approach as the pagination arrows and the selection
 * checkboxes.
 *
 * Only unnamed buttons are touched and the names come from the `a11y` namespace, so a translated
 * admin and a future Payload version that labels its own buttons both keep working.
 */

export const ICON_BUTTON_LABELS = {
  documentActions: 'a11y:moreDocumentActions',
  editFile: 'a11y:editFile',
  removeFile: 'a11y:removeFile',
  clearDate: 'a11y:clearDate',
} as const

/** Selector → label key. Scoped to the components that need it, not every icon button. */
const TARGETS: { selector: string; key: string }[] = [
  { selector: '.doc-controls__popup button.popup-button', key: ICON_BUTTON_LABELS.documentActions },
  { selector: '.upload-relationship-details__edit', key: ICON_BUTTON_LABELS.editFile },
  { selector: '.upload-relationship-details__remove', key: ICON_BUTTON_LABELS.removeFile },
  { selector: '.date-time-picker__clear-button', key: ICON_BUTTON_LABELS.clearDate },
]

export function nameIconOnlyControls(
  root: ParentNode = document,
  translate: (key: string) => string = (key) => key,
): void {
  for (const { selector, key } of TARGETS) {
    for (const button of root.querySelectorAll<HTMLElement>(selector)) {
      if (button.getAttribute('aria-label')?.trim()) continue
      if (button.textContent?.trim()) continue
      button.setAttribute('aria-label', translate(key))
    }
  }
}
