import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/**
 * Admin shell: theme switch, collapsible icon rail, site cache refresh, list summaries and article
 * Live Preview.
 */
test.describe('Admin shell', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  /** The closed sidebar stays in the DOM (inert), so wait for hydration and open it if needed. */
  async function openNav() {
    // Generous: the first visit to a route compiles it on the dev server.
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
    if ((await page.locator('.nav.nav--nav-open').count()) === 0) {
      await page.locator('.nav-toggler').first().click()
      await expect(page.locator('.nav.nav--nav-open')).toHaveCount(1)
    }
  }

  test('the header switches between light and dark', async () => {
    await page.goto(`${base}/admin`)
    // The toggle is server-rendered; wait for hydration so the click is handled.
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    const after = before === 'dark' ? 'light' : 'dark'

    await page.getByTestId('theme-toggle').click()
    await expect(html).toHaveAttribute('data-theme', after)
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', after)
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })

    await page.getByTestId('theme-toggle').click()
    await expect(html).toHaveAttribute('data-theme', before ?? 'light')

    // Custom views forward the header actions too.
    await page.goto(`${base}/admin/ui-kit`)
    await expect(page.getByTestId('theme-toggle')).toBeVisible()
  })

  test('the sidebar collapses to an icon rail and remembers it', async () => {
    await page.goto(`${base}/admin`)
    await openNav()
    const nav = page.locator('aside.nav')
    const toggle = page.locator('#nav-rail-toggle')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await nav.boundingBox())?.width ?? 0).toBeLessThan(80)
    // Labels are hidden visually only: the links keep their names and still navigate.
    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/projects/)

    await page.reload()
    await openNav()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await nav.boundingBox())?.width ?? 0).toBeLessThan(80)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await nav.boundingBox())?.width ?? 0).toBeGreaterThan(200)
  })

  test('the settings menu refreshes the site cache', async () => {
    await page.goto(`${base}/admin`)
    await openNav()
    await page.locator('.settings-menu-button').getByRole('button').first().click()
    await page.getByTestId('refresh-site-cache').click()
    await expect(
      page.getByText('The site will show the latest content on the next visit.'),
    ).toBeVisible()
  })

  test('lists open with a summary line', async () => {
    await page.goto(`${base}/admin/collections/articles`)
    const summary = page.getByTestId('list-summary')
    await expect(summary).toContainText('in total')
    await expect(summary).toContainText('with a page')
    await expect(summary).toContainText(/Last edit/)
  })

  test('Live Preview follows the article as it is edited', async () => {
    const created = await page.request.post(`${base}/api/articles`, {
      data: {
        title: 'Live preview e2e',
        excerpt: 'Checks the article Live Preview.',
        description: 'First paragraph.\n\nSecond paragraph.',
        link: 'https://example.com/live-preview-e2e',
        category: 'articles',
        publishedAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(created.ok()).toBe(true)
    const { doc } = await created.json()

    try {
      await page.goto(`${base}/admin/collections/articles/${doc.id}`)
      const toggler = page.locator('.live-preview-toggler')
      await expect(toggler).toBeVisible()
      if (!(await toggler.getAttribute('class'))?.includes('live-preview-toggler--active')) {
        await toggler.click()
      }
      const title = page.frameLocator('iframe').first().locator('h1').first()
      await expect(title).toHaveText('Live preview e2e', { timeout: 30_000 })

      await page.locator('#field-title').fill('Edited in Live Preview')
      await expect(title).toHaveText('Edited in Live Preview', { timeout: 15_000 })
    } finally {
      await page.request.delete(`${base}/api/articles/${doc.id}`)
    }
  })
})
