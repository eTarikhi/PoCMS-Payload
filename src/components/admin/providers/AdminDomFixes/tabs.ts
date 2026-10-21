/**
 * Payload's document tabs are a `<ul>` whose children are `<div>` and `<a>`, not `<li>` (P6.2).
 *
 * `DocTabs` renders `<ul class="doc-tabs__tabs">` with a `<div>` for the active tab and anchors for
 * the API/GraphQL/Live Preview tabs. Axe reports `list` (serious) on every document and global edit
 * screen, because a list may only directly contain list items. The row is a tab bar, not a list of
 * related items, so `role="presentation"` is the accurate description — it removes the list
 * semantics the markup does not honour while leaving every control reachable.
 *
 * Only applies when there is no real `<li>` child, so a Payload version that fixes the markup (or a
 * genuine list that happens to use the class) is left alone.
 */
export function presentTabRows(root: ParentNode = document): void {
  for (const list of root.querySelectorAll<HTMLElement>('ul.doc-tabs__tabs')) {
    if (list.querySelector(':scope > li')) continue
    if (!list.hasAttribute('role')) list.setAttribute('role', 'presentation')
  }
}

/**
 * Payload gives the Versions tab `aria-label="Versions"` while its visible text is "Versions 1"
 * (the version count), so axe `label-content-name-mismatch` (serious) fires: voice control users
 * cannot say what is written on the tab. The visible text is already a complete name, so dropping
 * the label is the fix; tabs without text keep theirs.
 */
export function trustVisibleTabText(root: ParentNode = document): void {
  for (const tab of root.querySelectorAll<HTMLAnchorElement>('a.doc-tab[aria-label]')) {
    if (tab.textContent?.trim()) tab.removeAttribute('aria-label')
  }
}
