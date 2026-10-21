import { expect, test } from '@playwright/test'

import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'
const stamp = Date.now().toString(36)
const publishedSlug = `sitemap-published-${stamp}`
const draftSlug = `sitemap-draft-${stamp}`

/**
 * `/sitemap.xml` and `/robots.txt`.
 *
 * A sitemap is only worth having if it matches the site: every listed URL must answer 200, and
 * nothing that shouldn't be crawled (drafts, the admin, the API, the preview) may be listed or
 * allowed. The spec publishes one article and leaves one as a draft, then checks the XML, the
 * status of each listed URL, and the robots policy. It also proves the list keeps up with content:
 * the sitemap is prerendered, so a new article only appears if saving in the admin revalidates it.
 */
test.describe('sitemap and robots', () => {
  const created: (number | string)[] = []

  test.beforeAll(async ({ request }) => {
    await seedTestUser()
    const login = await request.post(`${base}/api/users/login`, {
      data: { email: testUser.email, password: testUser.password },
    })
    expect(login.ok(), await login.text()).toBeTruthy()

    // A published article with a body: only those have a page, so only those belong in the sitemap.
    const published = await request.post(`${base}/api/articles`, {
      data: {
        title: `Sitemap probe ${stamp}`,
        slug: publishedSlug,
        excerpt: 'An excerpt for the sitemap spec.',
        description: 'A paragraph.\n\nAnother paragraph.',
        category: 'articles',
        publishedAt: '2025-04-04T00:00:00.000Z',
        link: 'https://example.com/sitemap',
        _status: 'published',
      },
    })
    expect(published.ok(), await published.text()).toBeTruthy()
    created.push(((await published.json()) as { doc: { id: number | string } }).doc.id)

    // A draft is not a page, even though it has a slug and a body.
    const draft = await request.post(`${base}/api/articles`, {
      data: {
        title: `Sitemap draft ${stamp}`,
        slug: draftSlug,
        excerpt: 'Draft excerpt.',
        description: 'Draft body.',
        category: 'articles',
        publishedAt: '2025-04-05T00:00:00.000Z',
        link: 'https://example.com/sitemap-draft',
        _status: 'draft',
      },
    })
    expect(draft.ok(), await draft.text()).toBeTruthy()
    created.push(((await draft.json()) as { doc: { id: number | string } }).doc.id)
  })

  test.afterAll(async ({ request }) => {
    await request.post(`${base}/api/users/login`, {
      data: { email: testUser.email, password: testUser.password },
    })
    for (const id of created) {
      await request.delete(`${base}/api/articles/${id}`).catch(() => undefined)
    }
    await cleanupTestUser()
  })

  test('lists the home page and every published page', async ({ request }) => {
    const response = await request.get(`${base}/sitemap.xml`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('xml')

    const xml = await response.text()
    expect(xml).toContain('<urlset')
    expect(xml).toContain(`<loc>${base}/</loc>`)
    expect(xml).toContain(`<loc>${base}/articles/${publishedSlug}</loc>`)
    // The draft has a slug and a body but no page, so advertising it would point crawlers at a 404.
    expect(xml).not.toContain(draftSlug)
    // The home page is the entry point: it comes first and carries the highest priority.
    expect(xml.indexOf(`<loc>${base}/</loc>`)).toBeLessThan(xml.indexOf(publishedSlug))
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/)
  })

  test('every listed URL answers 200', async ({ request }) => {
    const xml = await (await request.get(`${base}/sitemap.xml`)).text()
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    expect(locations.length).toBeGreaterThan(0)

    for (const location of locations) {
      const response = await request.get(location)
      expect(response.status(), location).toBe(200)
    }
  })

  test('robots.txt allows the site, blocks the admin, the API and the preview, and names the sitemap', async ({
    request,
  }) => {
    const response = await request.get(`${base}/robots.txt`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/plain')

    const body = await response.text()
    expect(body).toContain('User-Agent: *')
    expect(body).toContain('Allow: /')
    for (const path of ['/admin', '/api', '/preview']) {
      expect(body).toContain(`Disallow: ${path}`)
    }
    expect(body).toContain(`Sitemap: ${base}/sitemap.xml`)
  })
})
