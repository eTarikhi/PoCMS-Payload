/**
 * Accessible names for Payload's row-selection checkboxes (roadmap P6.2).
 *
 * `SelectAll` and `SelectRow` in @payloadcms/ui 3.90 render
 *
 *   <input type="checkbox" aria-label="" id="select-all" aria-labelledby="select-all">
 *
 * — an empty `aria-label`, and an `aria-labelledby` that points at the input itself, so the
 * accessible name is empty. Axe reports `label` (critical) on every list that has bulk actions.
 * The markup lives in a pre-bundled package, so this module names the boxes in the DOM, the same
 * way `PaginationLabels` labels the paginator arrows.
 *
 * Only empty names are filled in, and a self-referencing `aria-labelledby` is the only attribute
 * removed, so a Payload version that ships real labels takes over automatically.
 */

export const SELECTION_LABELS = {
  all: 'a11y:selectAllRows',
  row: 'a11y:selectRow',
} as const

const SELECTOR =
  '.select-all input[type="checkbox"], .select-row__checkbox input[type="checkbox"], input[name="select-all"]'

/** True when `aria-labelledby` points at the element itself, which yields no name at all. */
function selfLabelled(box: HTMLInputElement): boolean {
  const labelledBy = box.getAttribute('aria-labelledby')
  return Boolean(labelledBy && box.id && labelledBy.split(/\s+/).includes(box.id))
}

export function nameSelectionCheckboxes(
  root: ParentNode = document,
  translate: (key: string) => string = (key) => key,
): void {
  for (const box of root.querySelectorAll<HTMLInputElement>(SELECTOR)) {
    if (selfLabelled(box)) box.removeAttribute('aria-labelledby')
    if (box.getAttribute('aria-label')?.trim()) continue
    const selectsAll =
      box.name === 'select-all' || box.closest('.select-all') !== null
    box.setAttribute('aria-label', translate(selectsAll ? SELECTION_LABELS.all : SELECTION_LABELS.row))
  }
}
