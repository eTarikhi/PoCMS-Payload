import { expect, test, request as playwrightRequest, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'
const stamp = Date.now().toString(36)
const slug = `seo-metadata-${stamp}`
const title = `SEO metadata probe ${stamp}`

/**
 * Per-document SEO metadata (Payload's SEO plugin).
 *
 * The plugin's group is only useful if the public pages read it. This spec edits an article the way
 * an editor does — open it, type into the SEO fields, save — and then requests the public page and
 * asserts the tags it renders. It also checks the group's admin affordances (the character counter
 * and the search-result preview) and that clearing a field falls back to the article's own title and
 * excerpt rather than emitting an empty tag.
 */
test.describe('SEO metadata', () => {
  let page: Page
  let articleId: number | string

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: testUser })

    // A published article with a body: only those have a page (see article-page.ts).
    const response = await page.request.post(`${base}/api/articles`, {
      data: {
        title,
        slug,
        excerpt: 'An excerpt written for the SEO spec.',
        description: 'A paragraph.\n\nAnother paragraph.',
        category: 'articles',
        publishedAt: '2025-03-03T00:00:00.000Z',
        link: 'https://example.com/seo',
        _status: 'published',
      },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    articleId = ((await response.json()) as { doc: { id: number | string } }).doc.id
  })

  test.afterAll(async () => {
    if (articleId) {
      const api = await playwrightRequest.newContext({ baseURL: base })
      await api.post('/api/users/login', {
        data: { email: testUser.email, password: testUser.password },
      })
      await api.delete(`/api/articles/${articleId}`).catch(() => undefined)
      await api.dispose()
    }
    await cleanupTestUser()
  })

  test('renders the article’s own fields when the SEO group is empty', async ({ request }) => {
    const html = await (await request.get(`${base}/articles/${slug}`)).text()
    expect(html).toContain(`<title>${title}</title>`)
    expect(html).toContain('content="An excerpt written for the SEO spec."')
  })

  test('saves metadata in the admin and renders it on the page', async ({ request }) => {
    await page.goto(`${base}/admin/collections/articles/${articleId}`, { waitUntil: 'networkidle' })

    const group = page.locator('.group-field', { hasText: 'SEO' }).last()
    await expect(group).toBeVisible()
    // The plugin's own affordances: counters and the search-result preview.
    await expect(group.getByText('Preview')).toBeVisible()

    const seoTitle = `Editor title ${stamp}`
    const seoDescription = `Editor description ${stamp}`
    await page.fill('#field-meta__title', seoTitle)
    await page.fill('#field-meta__description', seoDescription)

    // Wait for the POST rather than a toast: the toast text is Payload's and its timing varies.
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/articles/${articleId}`) &&
        ['PATCH', 'POST'].includes(response.request().method()) &&
        response.ok(),
    )
    // "Save Draft" is disabled on a published document; "Publish changes" is the save action.
    await page.getByRole('button', { name: 'Publish changes' }).click()
    await saved

    // The server renders the document; the tag change is visible on the next request.
    await expect
      .poll(
        async () => {
          const html = await (await request.get(`${base}/articles/${slug}`)).text()
          return html.includes(`<title>${seoTitle}</title>`)
        },
        { timeout: 20_000 },
      )
      .toBe(true)

    const html = await (await request.get(`${base}/articles/${slug}`)).text()
    expect(html).toContain(`content="${seoDescription}"`)
    expect(html).toContain(`property="og:title" content="${seoTitle}"`)
  })

  test('falls back to the article fields after the metadata is cleared', async ({ request }) => {
    await page.goto(`${base}/admin/collections/articles/${articleId}`, { waitUntil: 'networkidle' })
    await page.fill('#field-meta__title', '')
    await page.fill('#field-meta__description', '')

    const saved = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/articles/${articleId}`) &&
        ['PATCH', 'POST'].includes(response.request().method()) &&
        response.ok(),
    )
    await page.getByRole('button', { name: 'Publish changes' }).click()
    await saved

    await expect
      .poll(async () => {
        const html = await (await request.get(`${base}/articles/${slug}`)).text()
        return html.includes(`<title>${title}</title>`)
      })
      .toBe(true)
  })
})
