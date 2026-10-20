import { hasArticlePage } from '@/app/(frontend)/lib/article-page'

import type { JobTask } from '../types'

/** Bounds that keep a run inside the function's time limit (see docs/deployment.md). */
const MAX_LINKS = 60
const CONCURRENCY = 10
const TIMEOUT_MS = 6_000
const USER_AGENT = 'PoCMS-LinkChecker/1.0 (+admin maintenance job)'

const SKIP = /^(#|mailto:|tel:|data:|javascript:|blob:|sms:|whatsapp:)/i

type LinkCheck = {
  url: string
  foundOn: string
  status: number | null
  reason: string | null
}

/** Every href/src in the HTML, resolved against the page; same-origin and external alike. */
export function linksIn(html: string, pageURL: string): string[] {
  const found = new Set<string>()
  const pattern = /(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  for (const match of html.matchAll(pattern)) {
    const raw = (match[1] ?? match[2] ?? '').trim()
    if (!raw || SKIP.test(raw)) continue
    try {
      const url = new URL(raw, pageURL)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
      url.hash = ''
      found.add(url.toString())
    } catch {
      // Not a URL (a template, a relative path that does not resolve): ignore.
    }
  }
  return [...found]
}

/** HEAD, then GET when a server refuses HEAD (403/405/501 are common for bot filters). */
async function check(url: string): Promise<{ status: number | null; reason: string | null }> {
  const attempt = async (method: 'HEAD' | 'GET') => {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // The body is not needed; cancel it so the connection closes.
    if (method === 'GET') await response.body?.cancel().catch(() => {})
    return response.status
  }
  try {
    const head = await attempt('HEAD')
    if (head < 400) return { status: head, reason: null }
    if (head === 403 || head === 405 || head === 501) {
      const get = await attempt('GET')
      return get < 400 ? { status: get, reason: null } : { status: get, reason: `HTTP ${get}` }
    }
    return { status: head, reason: `HTTP ${head}` }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    return {
      status: null,
      reason:
        name === 'TimeoutError'
          ? `no answer within ${TIMEOUT_MS / 1000} s`
          : error instanceof Error
            ? error.message
            : String(error),
    }
  }
}

/**
 * Crawls the public pages the CMS owns (home, every article page), collects their links and checks
 * each one. Results land in the run's details: the count checked and every broken link with where
 * it was found. External services that block bots may report 403; the page shows the status so a
 * person can judge it.
 */
export const brokenLinks: JobTask = {
  slug: 'broken-links',
  label: 'Broken link check',
  description:
    'Crawls the home page and every article page, then requests each link to find the ones that no longer answer.',
  schedule: 'weekly',
  weekday: 1,
  estimate: '10–40 s',
  async run({ payload, log, siteURL }) {
    if (!siteURL) throw new Error('No public site address: set NEXT_PUBLIC_SITE_URL.')

    const pages = [new URL('/', siteURL).toString()]
    const { docs: articles } = await payload.find({
      collection: 'articles',
      limit: 200,
      depth: 0,
      overrideAccess: true,
      select: { slug: true, description: true, title: true },
    })
    for (const article of articles) {
      if (hasArticlePage(article))
        pages.push(new URL(`/articles/${article.slug}`, siteURL).toString())
    }
    log(`Checking ${pages.length} page(s): ${pages.join(', ')}`)

    const links = new Map<string, string>()
    const unreachablePages: { url: string; reason: string }[] = []
    for (const page of pages) {
      try {
        const response = await fetch(page, {
          cache: 'no-store',
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const html = await response.text()
        if (!response.ok) {
          unreachablePages.push({ url: page, reason: `HTTP ${response.status}` })
          log(`${page}: HTTP ${response.status}`)
          continue
        }
        const found = linksIn(html, page)
        log(`${page}: ${found.length} link(s)`)
        for (const link of found) if (!links.has(link)) links.set(link, page)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        unreachablePages.push({ url: page, reason })
        log(`${page}: ${reason}`)
      }
    }

    const targets = [...links.keys()]
    const toCheck = targets.slice(0, MAX_LINKS)
    if (targets.length > toCheck.length)
      log(`Checking the first ${toCheck.length} of ${targets.length} links (limit ${MAX_LINKS}).`)

    const results: LinkCheck[] = new Array(toCheck.length)
    let next = 0
    const worker = async () => {
      while (next < toCheck.length) {
        const index = next++
        const url = toCheck[index]
        const { status, reason } = await check(url)
        results[index] = { url, foundOn: links.get(url) ?? '', status, reason }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toCheck.length) }, worker))

    const broken = results.filter((result) => result.reason !== null)
    for (const result of broken)
      log(`Broken: ${result.url} (${result.reason}) on ${result.foundOn}`)

    const summary =
      broken.length === 0
        ? `All ${results.length} link${results.length === 1 ? '' : 's'} answer${results.length === 1 ? 's' : ''}${unreachablePages.length ? `; ${unreachablePages.length} page(s) could not be fetched` : ''}.`
        : `${broken.length} of ${results.length} link${results.length === 1 ? '' : 's'} ${broken.length === 1 ? 'is' : 'are'} broken${unreachablePages.length ? `; ${unreachablePages.length} page(s) could not be fetched` : ''}.`
    log(summary)
    return {
      summary,
      details: {
        pages: pages.length,
        linksFound: targets.length,
        checked: results.length,
        truncated: targets.length > toCheck.length,
        broken,
        unreachablePages,
      },
    }
  },
}
