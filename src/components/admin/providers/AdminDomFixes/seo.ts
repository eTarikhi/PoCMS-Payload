/**
 * Fixes for Payload's SEO plugin fields (Articles and Site settings).
 *
 * The plugin renders its own widgets with inline styles, so neither a class nor a token reaches
 * them from config:
 *
 *   <div class="plugin-seo__field">Title — Auto-generate</div>
 *   <div style="color:#9A9A9A">This should be between 50 and 60 characters…</div>
 *   <div style="background-color:orange;border-radius:2px;color:white"> <small>Almost there</small> </div>
 *   <div style="pointer-events:none">     ← the search-result preview
 *     <div><a href="/articles/x">http://…</a></div>
 *     <h4><a href="/"> </a></h4>          ← empty when the meta title is empty
 *
 * Three findings come from that markup: the instruction text is `#9A9A9A` (2.6:1 on the canvas),
 * the length pills are white on red/orange/green (2–3:1), and the preview's mock links are
 * focusable but have no name (or, for the URL link, a 16px target). The plugin sets
 * `pointer-events: none` on the preview, so it is decoration, not navigation: this module hides it
 * from assistive tech and takes its links out of the tab order, and marks the other two nodes so
 * `payload-overrides.css` can colour them with the muted token and a dark pill label.
 *
 * Everything is a data attribute, added only when missing, so a plugin release that fixes its own
 * styles is not fought — and the CSS overrides stay in one file.
 */

/** The inline colour as the browser reports it, without reading the computed style. */
const getComputedStyleColor = (element: HTMLElement): string => {
  // `element.style.color` is already normalised by the CSSOM (`#9A9A9A` → `rgb(154, 154, 154)`),
  // so no layout read is needed here.
  return element.style.color
}

/** The plugin's instruction grey, as the browser normalises the inline `#9A9A9A` to. */
const PLUGIN_NOTE_GREY = 'rgb(154, 154, 154)'

/** Marks the instruction lines: the one under a label row, and the preview's own caption. */
export function fixSeoFieldNotes(root: ParentNode = document): void {
  const isNote = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false
    if (!element.style.color) return false
    return (
      element.classList.contains('plugin-seo__field') === false &&
      getComputedStyleColor(element) === PLUGIN_NOTE_GREY
    )
  }

  for (const label of root.querySelectorAll<HTMLElement>('.plugin-seo__field')) {
    const note = label.nextElementSibling
    if (isNote(note)) note.dataset.pocmsSeo = 'note'
  }

  for (const element of root.querySelectorAll<HTMLElement>('div[style*="color"]')) {
    if (isNote(element)) element.dataset.pocmsSeo = 'note'
  }

  for (const pill of root.querySelectorAll<HTMLElement>('div[style*="border-radius: 2px"]')) {
    if (!pill.querySelector(':scope > small')) continue
    if (!pill.style.backgroundColor) continue
    pill.dataset.pocmsSeo = 'pill'
  }
}

/**
 * The search-result preview is a mock: the plugin makes it non-interactive with
 * `pointer-events: none`, but its anchors stay focusable and one of them is empty when no meta
 * title is set. Hiding the card from assistive tech (and unlinking its anchors) leaves the real
 * fields as the only interactive content.
 */
export function hideSeoPreview(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>('div[style*="pointer-events: none"]')) {
    if (card.dataset.pocmsSeoPreview === 'true') continue
    card.dataset.pocmsSeoPreview = 'true'
    card.setAttribute('aria-hidden', 'true')
    for (const link of card.querySelectorAll<HTMLAnchorElement>('a')) {
      link.removeAttribute('href')
      link.setAttribute('tabindex', '-1')
    }
  }
}
