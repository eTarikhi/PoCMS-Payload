import type { ArticleItem } from './types'

/** XML 1.0 text: discard forbidden codepoints, then escape markup (including user-written excerpts). */
function xml(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0)!
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        code >= 0x10000
      )
    })
    .join('')
    .replace(
      /[<>&"']/g,
      (character) =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
    )
}

/** Uses the existing anonymous, newest-first cache. No body migration or invented publication dates. */
export function buildWritingFeed(site: string, name: string, articles: ArticleItem[]): string {
  const origin = site.replace(/\/+$/, '')
  const seen = new Set<string>()
  const items: string[] = []
  for (const article of articles) {
    if (seen.has(article.id)) continue
    let destination: URL
    try {
      destination = article.pagePath ? new URL(article.pagePath, origin) : new URL(article.link)
    } catch {
      continue
    }
    if (
      !['https:', 'http:'].includes(destination.protocol) ||
      destination.username ||
      destination.password
    )
      continue
    seen.add(article.id)
    items.push(
      `<item><title>${xml(article.title)}</title><link>${xml(destination.href)}</link><guid isPermaLink="false">${xml(`urn:pocms:article:${article.id}`)}</guid><description>${xml(article.excerpt)}</description>${article.category ? `<category>${xml(article.category)}</category>` : ''}</item>`,
    )
    if (items.length === 50) break
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(name)} — Writing</title><link>${xml(`${origin}/articles`)}</link><description>Field notes on interfaces, systems, and software development.</description><language>en</language><atom:link href="${xml(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml"/>${items.join('')}</channel></rss>`
}
