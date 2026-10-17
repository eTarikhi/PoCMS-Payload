import { test, expect, request, type Page } from '@playwright/test'

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

  /** On desktop the sidebar is always open (collapsed or not); wait for hydration to apply it. */
  async function openNav() {
    // Generous: the first visit to a route compiles it on the dev server.
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
    await expect(page.locator('.nav.nav--nav-open')).toHaveCount(1)
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

  test('admins get GraphQL Playground and developer tools in the header', async () => {
    await page.goto(`${base}/admin/collections/articles`)
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
    const tools = page.getByTestId('dev-tools')
    await expect(tools.getByRole('link', { name: /GraphQL Playground/ })).toHaveAttribute(
      'href',
      '/api/graphql-playground',
    )
    expect((await page.request.get(`${base}/api/graphql-playground`)).status()).toBe(200)

    await tools.locator('summary').click()
    await expect(tools.getByRole('link', { name: /This list \(REST\)/ })).toHaveAttribute(
      'href',
      '/api/articles?depth=0&limit=10',
    )
    await expect(tools.getByRole('link', { name: /My permissions/ })).toHaveAttribute(
      'href',
      '/api/access',
    )
    await page.keyboard.press('Escape')
    await expect(tools.getByRole('link', { name: /My permissions/ })).toBeHidden()
  })

  test('one sidebar control: rail toggle on desktop, Payload menu button on small screens', async () => {
    await page.goto(`${base}/admin`)
    await openNav()
    const nav = page.locator('aside.nav')
    const toggle = page.locator('#nav-rail-toggle')
    // Desktop: Payload's toggler (which hid the whole sidebar) is gone; ours sits inside the sidebar.
    await expect(page.locator('.template-default__nav-toggler-wrapper')).toBeHidden()
    const inside = async () => {
      const box = (await nav.boundingBox())!
      const own = (await toggle.boundingBox())!
      expect(own.x).toBeGreaterThanOrEqual(box.x)
      expect(own.x + own.width).toBeLessThanOrEqual(box.x + box.width)
      return box
    }
    await inside()

    // Rail: the control is centred above the icons, and Create opens to the right of the rail.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await nav.boundingBox())?.width ?? 0).toBeLessThan(80)
    const box = await inside()
    await page.getByTestId('quick-create').locator('summary').click()
    const menu = page.getByTestId('quick-create').locator('nav')
    await expect(menu).toBeVisible()
    expect((await menu.boundingBox())!.x).toBeGreaterThanOrEqual(box.x + box.width)
    await page.keyboard.press('Escape')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    // Small screens: Payload's menu button is back, ours is hidden.
    await page.setViewportSize({ width: 800, height: 900 })
    await expect(page.locator('.nav-toggler').first()).toBeVisible()
    await expect(toggle).toBeHidden()
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('the header holds account and cache actions; the sidebar has neither', async () => {
    await page.goto(`${base}/admin`)
    await openNav()
    await expect(page.locator('.nav .nav__log-out')).toHaveCount(0)
    await expect(page.locator('.settings-menu-button')).toHaveCount(0)

    const account = page.getByTestId('account-menu')
    await account.locator('summary').click()
    await expect(account.getByRole('link', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/admin/account',
    )
    await expect(account.getByRole('link', { name: 'Log out' })).toHaveAttribute(
      'href',
      '/admin/logout',
    )
    await page.keyboard.press('Escape')

    const tools = page.getByTestId('dev-tools')
    await tools.locator('summary').click()
    await tools.getByTestId('dev-action-site').click()
    await expect(
      page.getByText('The site will show the latest content on the next visit.'),
    ).toBeVisible()

    // Reset bundler cache: admins only, development only (dry run, so nothing is deleted).
    const dryRun = await page.request.post(`${base}/api/reset-bundler-cache?dryRun=1`)
    await tools.locator('summary').click()
    if (dryRun.status() === 200) await expect(tools.getByTestId('dev-action-bundler')).toBeVisible()
    else {
      expect(dryRun.status()).toBe(404)
      await expect(tools.getByTestId('dev-action-bundler')).toHaveCount(0)
    }
    await page.keyboard.press('Escape')
    const anonymous = await request.newContext()
    expect((await anonymous.post(`${base}/api/reset-bundler-cache?dryRun=1`)).status()).toBe(403)
    await anonymous.dispose()
  })

  test('lists open with a summary line', async () => {
    await page.goto(`${base}/admin/collections/articles`)
    const summary = page.getByTestId('list-summary')
    await expect(summary).toContainText('in total')
    await expect(summary).toContainText('with a page')
    await expect(summary).toContainText(/Last edit/)
  })

  test('Live Preview follows the article as it is edited', async () => {
    // The preview iframe's first render compiles the article page on the dev server.
    test.setTimeout(120_000)
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
