import { expect, test, request as playwrightRequest } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'
// Unique per run: a slug left behind by an earlier failed run is published by then, and the
// "not in the public list" assertion would fail on the leftover rather than on this run's draft.
const stamp = Date.now().toString(36)
const title = `Draft visibility probe ${stamp}`
const slug = `draft-visibility-${stamp}`

/**
 * Drafts, publishing and scheduled publishing (CNT).
 *
 * A draft must be invisible on the public site, publishing must make it visible, and an article
 * whose `publishAt` has passed must be published by the `publish-scheduled` job. The job is started
 * through the same endpoint the admin's "Run now" calls.
 */
test.describe('Draft articles and scheduled publishing', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    // Remove anything this run left behind (a failed assertion can skip the inline cleanup).
    const api = await playwrightRequest.newContext({ baseURL: base })
    // Deleting needs the "full" level, so the cleanup context signs in before it tries.
    await api.post('/api/users/login', {
      data: { email: testUser.email, password: testUser.password },
    })
    for (const candidate of [slug, `scheduled-publish-${stamp}`]) {
      const list = await (
        await api.get(`/api/articles?where[slug][equals]=${candidate}&limit=10`)
      ).json()
      for (const doc of list.docs ?? []) {
        await api.delete(`/api/articles/${doc.id}`).catch(() => undefined)
      }
    }
    await api.dispose()
    await cleanupTestUser()
  })

  test('keeps a draft off the site until it is published', async ({ page }) => {
    // `page.request` carries the admin's session cookie; the public site must be checked without it.
    const publicApi = await playwrightRequest.newContext({ baseURL: base })
    await login({ page, user: testUser })
    await page.goto(`${base}/admin/collections/articles/create`)

    await page.locator('#field-title').fill(title)
    await page.locator('#field-excerpt').fill('Written but not published yet.')
    // The page needs a body: an article without one has no page whatever its status (D-A1).
    await page.locator('#field-description').fill('Body text for the draft test.')
    await page.locator('#field-link').fill('https://example.com/draft')
    await page.locator('#field-slug').fill(slug)
    await page.locator('#field-publishedAt input').fill('2026-02-03')
    await page.locator('#field-publishedAt input').blur()

    const created = page.waitForResponse(
      (response) =>
        response.url().includes('/api/articles') &&
        response.request().method() === 'POST' &&
        response.ok(),
    )
    await page.locator('#action-save-draft').click()
    const { doc } = await (await created).json()
    expect(doc._status).toBe('draft')

    // Not public: no page, and not in the public list.
    const article = await publicApi.get(`/articles/${slug}`)
    expect(article.status()).toBe(404)
    const list = await (await publicApi.get('/api/articles?limit=100&depth=0')).json()
    expect(list.docs.map((item: { slug?: string }) => item.slug)).not.toContain(slug)

    // Publish from the edit view, then the same URL answers.
    await page.goto(`${base}/admin/collections/articles/${doc.id}`)
    const published = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/articles/${doc.id}`) &&
        response.request().method() === 'PATCH' &&
        response.ok(),
    )
    await page.locator('#action-save').click()
    await published

    await expect(async () => {
      const response = await publicApi.get(`/articles/${slug}`)
      expect(response.status()).toBe(200)
    }).toPass({ timeout: 20_000 })

    // The page shows the draft's content, not an empty published shell.
    await page.goto(`${base}/articles/${slug}`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await publicApi.dispose()
  })

  test('publishes a scheduled draft when the job runs', async ({ page }) => {
    await login({ page, user: testUser })
    const draftSlug = `scheduled-publish-${stamp}`

    // A draft with a publish time in the past. The API takes the same payload the form builds.
    const created = await page.request.post(`${base}/api/articles?draft=true`, {
      data: {
        title: `Scheduled publish probe ${stamp}`,
        excerpt: 'Should go live when the job runs.',
        description: 'Body text for the scheduled publishing test.',
        link: 'https://example.com/scheduled',
        slug: draftSlug,
        publishedAt: '2026-02-04T09:00:00.000Z',
        publishAt: '2026-02-04T09:00:00.000Z',
        _status: 'draft',
      },
    })
    expect(created.ok()).toBe(true)
    const { doc } = await created.json()
    expect(doc._status).toBe('draft')

    const publicApi = await playwrightRequest.newContext({ baseURL: base })
    const before = await publicApi.get(`/articles/${draftSlug}`)
    expect(before.status()).toBe(404)

    // The admin's Run now button calls this endpoint; the daily cron calls /api/jobs/cron.
    const run = await page.request.post(`${base}/api/jobs/run`, {
      data: { task: 'publish-scheduled' },
    })
    expect(run.ok()).toBe(true)

    await expect(async () => {
      const after = await publicApi.get(`/articles/${draftSlug}`)
      expect(after.status()).toBe(200)
    }).toPass({ timeout: 20_000 })

    const published = await (
      await page.request.get(`${base}/api/articles?where[slug][equals]=${draftSlug}&draft=true`)
    ).json()
    expect(published.docs[0]?._status).toBe('published')

    // Leave the database as it was found.
    await page.request.delete(`${base}/api/articles/${doc.id}`)
    await publicApi.dispose()
  })
})
