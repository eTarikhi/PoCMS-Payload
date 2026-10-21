/**
 * The page landmark screen readers navigate by (roadmap P6.2).
 *
 * Payload's admin shell renders `<main>` only on document views (create/edit, globals); the
 * dashboard and every list view render a `<div>` after the header instead, so there is no main
 * landmark to jump to and no location to announce. There is no config slot for the shell template,
 * so this module names the content element and adds the skip link that points at it.
 *
 * Rules it follows so a future Payload version that ships its own landmark wins:
 *
 *   - a native `<main>` on the page is used as-is (only an id and `tabindex` are added);
 *   - otherwise `role="main"` is added to the first element after the header, never replacing an
 *     existing role;
 *   - the skip link is only added when there is a target, is always the first element in `<body>`
 *     (so it is the first tab stop), and keeps its href in sync after client-side navigation.
 */

export const MAIN_ID = 'pocms-main'
export const SKIP_LINK_ID = 'pocms-skip-link'
export const SKIP_LINK_KEY = 'a11y:skipToContent'

/** The element that holds the current view: the page's own `<main>`, or the header's sibling. */
function contentElement(root: Document): HTMLElement | null {
  const nativeMain = root.querySelector<HTMLElement>('main')
  if (nativeMain) return nativeMain

  const wrap = root.querySelector<HTMLElement>('.template-default__wrap')
  if (wrap) {
    // The shell wraps the header and the view in one div: `header.app-header` then the view.
    return (
      [...wrap.children].find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && !child.matches('header.app-header'),
      ) ?? null
    )
  }

  // Sign-in and the other minimal screens: no sidebar to skip, but still a main landmark.
  return root.querySelector<HTMLElement>('.template-minimal .login, section.login')
}

/**
 * Gives the view a main landmark and the admin a skip link. Idempotent, and safe to call on every
 * DOM mutation: it only adds missing attributes and re-points the link after a route change.
 * `translate` receives the translation key; without one the key itself is used.
 */
export function ensureLandmarks(
  root: Document = document,
  translate: (key: string) => string = (key) => key,
): void {
  const content = contentElement(root)
  if (!content) return

  if (content.tagName !== 'MAIN' && !content.hasAttribute('role')) {
    content.setAttribute('role', 'main')
  }
  if (!content.id) content.id = MAIN_ID
  // A skip link moves focus only to an element that can receive it.
  if (!content.hasAttribute('tabindex')) content.setAttribute('tabindex', '-1')

  // No nav on the minimal screens, so there is nothing a skip link would skip.
  if (!root.querySelector('.template-default__wrap')) return

  let link = root.getElementById(SKIP_LINK_ID) as HTMLAnchorElement | null
  if (!link) {
    link = root.createElement('a')
    link.id = SKIP_LINK_ID
    link.className = 'pocms-skip-link'
  }
  link.setAttribute('href', `#${content.id}`)
  link.textContent = translate(SKIP_LINK_KEY)

  // Keep it first in the document, and outside React's root so hydration never sees it.
  if (root.body.firstElementChild !== link) root.body.prepend(link)
}
