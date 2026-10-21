/**
 * The accessible names for Payload's pagination arrows, as translation keys. Kept in a module with
 * no React and no `@payloadcms/ui` import so the DOM behaviour is unit-testable without the admin's
 * stylesheets (the component itself pulls in all of Payload's UI).
 */
export const PAGINATION_LABELS: Record<'left' | 'right', string> = {
  left: 'pagination:previous',
  right: 'pagination:next',
}

/**
 * Labels every unlabelled pagination arrow under `root`. `translate` receives the translation key;
 * the default returns the key itself, which is what a caller without an i18n provider wants.
 */
export function labelPaginationArrows(
  root: ParentNode = document,
  translate: (key: string) => string = (key) => key,
): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('button.clickable-arrow')) {
    if (button.hasAttribute('aria-label')) continue
    if (button.textContent?.trim()) continue
    const direction = button.classList.contains('clickable-arrow--left') ? 'left' : 'right'
    button.setAttribute('aria-label', translate(PAGINATION_LABELS[direction]))
  }
}
