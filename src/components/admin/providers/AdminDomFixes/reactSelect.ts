/**
 * Payload's select decorations are hidden from assistive technology but still focusable (P6.2).
 *
 * ReactSelect in @payloadcms/ui 3.90 renders
 *
 *   <button class="dropdown-indicator" aria-hidden="true" type="button"><svg/></button>
 *   <div class="clear-indicator" aria-hidden="true" role="button" tabindex="0"><svg/></div>
 *
 * so every relationship field and every create/edit form shows axe `aria-hidden-focus` (serious):
 * a keyboard user tabs into an element screen readers have been told not to announce, and lands on
 * a control with no name. The combobox input next to them opens and searches the list, and the
 * clear control is also reachable through that input (Backspace), so both are decoration; taking
 * them out of the tab order is what `aria-hidden` intended.
 *
 * Scoped to Payload's classes: other `aria-hidden` containers may be toggled by real menu patterns.
 */
export function skipHiddenSelectControls(root: ParentNode = document): void {
  for (const control of root.querySelectorAll<HTMLElement>(
    '.dropdown-indicator[aria-hidden="true"], .clear-indicator[aria-hidden="true"]',
  )) {
    if (control.getAttribute('tabindex') !== '-1') control.setAttribute('tabindex', '-1')
  }
}
