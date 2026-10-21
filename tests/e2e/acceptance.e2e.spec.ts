import path from 'node:path'

import { expect, request as playwrightRequest, test } from '@playwright/test'

import { login } from '../helpers/login'
import { TaskMeter } from '../helpers/measure'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Task-based acceptance tests (roadmap P5.6).
 *
 * The feature suites check that a screen does what it says. These check the *job*: an editor
 * publishes an article with a cover image, writes a draft and publishes it in a second step, and
 * replaces a cover with an external URL. Each task is measured (`tests/helpers/measure.ts`) and
 * compared with `tests/acceptance-baseline.json`, so a change that adds clicks to a routine task
 * shows up as a baseline diff rather than as silent UX debt.
 *
 * The budgets are the P5 baseline: the first run recorded them, later runs must stay within two
 * steps and 60% of the recorded time.
 */
const base = 'http://localhost:3000'
const stamp = Date.now().toString(36)
const coverFile = path.join(process.cwd(), 'public/images/articles/1735708966846.webp')

const createdSlugs = new Set<string>()
/** The article the third task edits: it must start with a media-library cover. */
const imageFixtureSlug = `acceptance-image-${stamp}`

test.describe('Editor acceptance tasks', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await seedTestUser()
    // One fixture through the API: a published article with a media-library cover. Building it
    // here keeps the measured task pure UI (find it, swap the cover, save).
    const api = await playwrightRequest.newContext({ baseURL: base })
    await api.post('/api/users/login', {
      data: { email: testUser.email, password: testUser.password },
    })
    const media = await (await api.get('/api/media?limit=1&depth=0')).json()
    const created = await api.post('/api/articles?draft=true', {
      data: {
        title: `Acceptance image ${stamp}`,
        excerpt: 'Starts with a media-library cover.',
        description: 'Body text so the article has a page.',
        link: 'https://example.com/acceptance-image',
        slug: imageFixtureSlug,
        publishedAt: '2026-02-01T00:00:00.000Z',
        image: media.docs[0].id,
        _status: 'published',
      },
    })
    expect(created.ok()).toBe(true)
    createdSlugs.add(imageFixtureSlug)
    await api.dispose()
  })

  test.afterAll(async () => {
    // Remove what the tasks created, so a rerun starts from the seeded state.
    const api = await playwrightRequest.newContext({ baseURL: base })
    await api.post('/api/users/login', {
      data: { email: testUser.email, password: testUser.password },
    })
    for (const slug of createdSlugs) {
      const list = await (await api.get(`/api/articles?where[slug][equals]=${slug}&limit=5`)).json()
      for (const doc of list.docs ?? []) await api.delete(`/api/articles/${doc.id}`)
    }
    await api.dispose()
    await cleanupTestUser()
  })

  test('publishes an article with a cover image', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const slug = `acceptance-cover-${stamp}`
    createdSlugs.add(slug)
    const title = `Acceptance cover ${stamp}`
    const meter = new TaskMeter('publish-article-with-cover')

    await login({ page, user: testUser })
    await meter.goto(page, `${base}/admin/collections/articles/create`)

    await meter.fill(page, '#field-title', title)
    await meter.fill(page, '#field-excerpt', 'An article published with a cover image.')
    await meter.fill(page, '#field-description', 'The body of the acceptance article.')
    await meter.fill(page, '#field-link', 'https://example.com/acceptance-cover')
    await meter.fill(page, '#field-slug', slug)
    await meter.fill(page, '#field-publishedAt input', '2026-02-05')
    await page.locator('#field-publishedAt input').blur()

    // The cover goes through the media library tab. "Create New" opens the media drawer: choose the
    // file, write the alt text the collection requires, save the media, then publish the article.
    await meter.click(page.getByRole('button', { name: 'Create New' }).first())
    await meter.setInputFiles(page.locator('.drawer input[type="file"]').first(), coverFile)
    await meter.fill(page, '.drawer #field-alt', 'Acceptance cover image')
    await meter.click(page.locator('.drawer #action-save'))
    await expect(page.locator('.drawer')).toHaveCount(0, { timeout: 60_000 })

    await meter.click(page.locator('#action-save'))

    const result = await meter.record(testInfo)
    expect(result.ok, `steps ${result.steps}, ms ${result.ms}`).toBe(true)

    // The task is only done when a reader sees it, with the cover rendered. The document's relation
    // is what proves the media library is the source.
    const saved = await (
      await page.request.get(`${base}/api/articles?where[slug][equals]=${slug}&depth=0&limit=1`)
    ).json()
    expect(saved.docs[0]?.image).toBeTruthy()
    const response = await page.request.get(`${base}/articles/${slug}`)
    expect(response.status()).toBe(200)
    await page.goto(`${base}/articles/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.locator('figure.article-cover img')).toBeVisible()
  })

  test('writes a draft and publishes it in a second step', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const slug = `acceptance-draft-${stamp}`
    createdSlugs.add(slug)
    const title = `Acceptance draft ${stamp}`
    const meter = new TaskMeter('draft-then-publish')

    await login({ page, user: testUser })
    await meter.goto(page, `${base}/admin/collections/articles/create`)

    await meter.fill(page, '#field-title', title)
    await meter.fill(page, '#field-excerpt', 'Written now, published after a review.')
    await meter.fill(page, '#field-description', 'A body that only appears once published.')
    await meter.fill(page, '#field-link', 'https://example.com/acceptance-draft')
    await meter.fill(page, '#field-slug', slug)
    await meter.fill(page, '#field-publishedAt input', '2026-02-06')
    await page.locator('#field-publishedAt input').blur()

    // Step one: save as a draft. Nothing is public yet.
    await meter.click(page.locator('#action-save-draft'))
    await expect(page.locator('#field-title')).toHaveValue(title)
    const whileDraft = await page.request.get(`${base}/articles/${slug}`)
    expect(whileDraft.status()).toBe(404)

    // Step two: publish the same document.
    await meter.click(page.locator('#action-save'))

    const result = await meter.record(testInfo)
    expect(result.ok, `steps ${result.steps}, ms ${result.ms}`).toBe(true)

    await expect(async () => {
      const response = await page.request.get(`${base}/articles/${slug}`)
      expect(response.status()).toBe(200)
    }).toPass({ timeout: 20_000 })
  })

  test('replaces a cover with an external URL', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const meter = new TaskMeter('replace-cover-with-external-url')
    const externalUrl = 'https://images.example.com/replacement-cover.jpg'

    await login({ page, user: testUser })
    // The editor finds the article in the list, not by URL.
    await meter.goto(page, `${base}/admin/collections/articles?search=${encodeURIComponent('Acceptance image')}`)
    await meter.click(
      page.getByRole('row', { name: /Acceptance image/ }).first().getByRole('link').first(),
    )
    await expect(page.locator('#field-title')).toHaveValue(/Acceptance image/)
    await expect(page.getByTestId('image-source-status')).toContainText(/media library/i)

    // The file wins over the URL while it is attached, so replacing the cover is: remove the file,
    // switch to the URL tab, type the URL, save — four actions after opening the article.
    await meter.click(page.locator('.upload-relationship-details__remove').first())
    await meter.click(page.getByRole('tab', { name: 'External URL' }))
    await meter.fill(page, '#field-imageUrl-source', externalUrl)
    await meter.click(page.locator('#action-save'))

    const result = await meter.record(testInfo)
    expect(result.ok, `steps ${result.steps}, ms ${result.ms}`).toBe(true)

    await expect(page.getByTestId('image-source-status')).toContainText(/external URL/i)
    const saved = await (
      await page.request.get(
        `${base}/api/articles?where[slug][equals]=${imageFixtureSlug}&depth=0&limit=1`,
      )
    ).json()
    expect(saved.docs[0]?.imageUrl).toBe(externalUrl)
    expect(saved.docs[0]?.image ?? null).toBeNull()
  })
})
