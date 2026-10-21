import { describe, expect, it } from 'vitest'

import { buildRobots, buildSitemap, ROBOTS_DISALLOW } from '@/app/(frontend)/lib/sitemap-entries'

/**
 * `/sitemap.xml` and `/robots.txt` (Next metadata routes).
 *
 * Only pages that exist may be listed: the home page and the articles with a slug and a body. A
 * sitemap that advertises a 404 wastes crawl budget and, worse, tells a search engine that the page
 * was removed. The rules live in `lib/sitemap.ts` so they can be tested without a server; the route
 * files only supply data.
 */
const SITE = 'https://example.test'
const NOW = new Date('2026-10-22T09:00:00.000Z')

describe('buildSitemap', () => {
  it('lists the home page first, then one entry per article', () => {
    const entries = buildSitemap(
      [
        { slug: 'first-post', updatedAt: '2026-10-01T12:00:00.000Z' },
        { slug: 'second-post', updatedAt: null },
      ],
      SITE,
      NOW,
    )

    expect(entries.map((entry) => entry.url)).toEqual([
      `${SITE}/`,
      `${SITE}/articles/first-post`,
      `${SITE}/articles/second-post`,
    ])
    expect(entries[0]).toMatchObject({ lastModified: NOW, changeFrequency: 'weekly', priority: 1 })
    expect(entries[1].lastModified?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    // No timestamp, no element: the schema allows omitting it, and a bad date would be worse.
    expect(entries[2]).not.toHaveProperty('lastModified')
  })

  it('drops an unparsable timestamp instead of writing "Invalid Date"', () => {
    const [entry] = buildSitemap([{ slug: 'broken-date', updatedAt: 'not a date' }], SITE, NOW).slice(1)
    expect(entry).not.toHaveProperty('lastModified')
  })

  it('is just the home page when there are no articles', () => {
    expect(buildSitemap([], SITE, NOW)).toHaveLength(1)
  })

  it('uses absolute URLs on the canonical site, whatever the environment default', () => {
    for (const entry of buildSitemap([{ slug: 'a-post' }], SITE, NOW)) {
      expect(entry.url.startsWith(`${SITE}/`)).toBe(true)
    }
  })
})

describe('buildRobots', () => {
  it('lets crawlers in, keeps them out of the admin, the API and the preview, and names the sitemap', () => {
    const robots = buildRobots(SITE)
    expect(robots.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: [...ROBOTS_DISALLOW],
    })
    expect(robots.sitemap).toBe(`${SITE}/sitemap.xml`)
    // Guard against someone relaxing the policy by accident: these three are never content.
    expect(ROBOTS_DISALLOW).toEqual(expect.arrayContaining(['/admin', '/api', '/preview']))
  })
})
