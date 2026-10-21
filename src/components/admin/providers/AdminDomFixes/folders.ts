/**
 * Accessibility fixes for Payload's folder browser (beta, 3.90).
 *
 * `folders: true` on Media adds `/admin/browse-by-folder`: folder cards, file cards, and a grid/list
 * toggle. Three pieces of that markup fail axe:
 *
 *   <button class="folder-view-toggle-button"><span class="btn__icon"><svg class="icon--grid-view">
 *   <button class="folder-view-toggle-button"><span class="btn__icon"><svg class="icon--list-view">
 *   <button class="popup-button"><div class="dots dots--vertical">
 *   <div class="folder-file-card__preview-area"><div class="thumbnail"><img src="…"></div></div>
 *
 * The two view toggles and the folder "…" menu are icon-only with no `aria-label` (`button-name`,
 * critical), and thumbnails are rendered without `alt` even though the media document has one
 * (`image-alt`, critical — 14 nodes in the seeded library). Payload passes no label or alt through
 * and there is no config slot for either, so this module fills them in from the surrounding card,
 * the same approach as the names for the document controls. Only missing attributes are touched, so
 * a Payload release that ships the fix wins.
 */

/**
 * "Create folder" is a `<div type="button">` (Payload renders `Button el="div"`), so it takes no
 * focus and a screen reader does not announce it as a button — keyboard and screen-reader users
 * cannot create a folder at all. The DOM fix gives it the button role, puts it in the tab order and
 * forwards Enter/Space to the click handler React attached.
 *
 * Only the single-collection variant is touched. With two or more folder-enabled collections
 * Payload renders a Popup instead, whose trigger is a real `<button>`; the div inside it must stay
 * inert or axe reports `nested-interactive`.
 */
export function makeFolderCreateButtonFocusable(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('.create-new-doc-in-folder__button')) {
    if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') continue
    element.setAttribute('role', 'button')
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0')
    if (element.dataset.pocmsKeyHandler) continue
    element.dataset.pocmsKeyHandler = 'true'
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      element.click()
    })
  }
}

export const FOLDER_LABELS = {
  gridView: 'a11y:gridView',
  listView: 'a11y:listView',
  folderActions: 'a11y:folderActions',
  filePreview: 'a11y:filePreview',
} as const

/** The view toggle is identified by the icon Payload renders inside it. */
const VIEW_ICONS: { icon: string; key: string }[] = [
  { icon: 'icon--grid-view', key: FOLDER_LABELS.gridView },
  { icon: 'icon--list-view', key: FOLDER_LABELS.listView },
]

export function nameFolderControls(
  root: ParentNode = document,
  translate: (key: string) => string = (key) => key,
): void {
  for (const button of root.querySelectorAll<HTMLElement>('.folder-view-toggle-button')) {
    if (button.getAttribute('aria-label')?.trim() || button.textContent?.trim()) continue
    const match = VIEW_ICONS.find(({ icon }) => button.querySelector(`svg.${icon}`))
    if (match) button.setAttribute('aria-label', translate(match.key))
  }

  for (const button of root.querySelectorAll<HTMLElement>(
    '.current-folder-actions button.popup-button',
  )) {
    if (button.getAttribute('aria-label')?.trim()) continue
    button.setAttribute('aria-label', translate(FOLDER_LABELS.folderActions))
  }
}

/**
 * The file card shows the file name under the thumbnail; that is the best alt text available in the
 * markup (the media document's own `alt` is not passed to the card). Folders get no image.
 */
export function nameFolderThumbnails(
  root: ParentNode = document,
  translate: (key: string) => string = (key) => key,
): void {
  for (const card of root.querySelectorAll<HTMLElement>('.folder-file-card--file')) {
    const name = card.querySelector('.folder-file-card__name')?.textContent?.trim()
    for (const image of card.querySelectorAll<HTMLImageElement>(
      '.folder-file-card__preview-area img',
    )) {
      if (image.hasAttribute('alt')) continue
      image.setAttribute('alt', name || translate(FOLDER_LABELS.filePreview))
    }
  }
}
