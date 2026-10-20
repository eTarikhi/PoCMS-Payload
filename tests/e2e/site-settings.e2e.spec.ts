import { expect, test, request as playwrightRequest } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/**
 * CNT: the Navigation and Site settings globals (roadmap P3.4).
 *
 * The maintenance switch is the risky one: it replaces every public page, so every test that fails
 * halfway must still switch it back off. The resets here use the REST API, which keeps working
 * while maintenance is on (only the public pages are replaced).
 */
async function setMaintenance(api: Awaited<ReturnType<typeof playwrightRequest.newContext>>, on: boolean) {
  const loginResponse = await api.post('/api/users/login', {
    data: { email: testUser.email, password: testUser.password },
  })
  expect(loginResponse.ok()).toBe(true)
  const response = await api.post('/api/globals/site-settings', {
    data: {
      siteName: 'eTarikhi',
      supportEmail: 'etarikhi@gmail.com',
      maintenance: { enabled: on, title: 'Back soon', message: 'The site is being updated.' },
    },
  })
  expect(response.ok()).toBe(true)
}

test.describe('Site settings and navigation globals', () => {
  test.beforeAll(async () => {
    await seedTestUser()
    const api = await playwrightRequest.newContext({ baseURL: base })
    await setMaintenance(api, false)
    await api.dispose()
  })

  test.afterAll(async () => {
    const api = await playwrightRequest.newContext({ baseURL: base })
    await setMaintenance(api, false)
    await api.dispose()
    await cleanupTestUser()
  })

  test('renders the seeded navigation on the public site', async ({ page }) => {
    await page.goto(`${base}/`)
    const nav = page.locator('nav.navbar')
    // The template hides the bar at the top of the page and reveals it on scroll
    // (`.navbar.fixed-top { display: none }` + the `d-flex` class after 300px), so scroll first.
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect(nav).toHaveClass(/d-flex/)
    await expect(nav).toBeVisible()
    for (const label of ['Home', 'About', 'Skills', 'Services', 'Projects', 'Contact']) {
      await expect(nav.getByRole('link', { name: label, exact: true }).first()).toBeVisible()
    }
  })

  test('switches the public site to the maintenance page and back, keeping the admin open', async ({
    page,
  }) => {
    await login({ page, user: testUser })
    await page.goto(`${base}/admin/globals/site-settings`)

    const toggle = page.getByLabel('Show the maintenance page')
    await expect(toggle).toBeVisible()
    if (!(await toggle.isChecked())) await toggle.check()

    // The admin posts the global to the REST API; waiting for that response is steadier than
    // waiting for a toast.
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/globals/site-settings') &&
        response.request().method() === 'POST' &&
        response.ok(),
    )
    await page.locator('#action-save').click()
    await saved

    await page.goto(`${base}/`)
    await expect(page.locator('main.maintenance-page')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Back soon' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Email us' })).toBeVisible()

    // An article page is replaced as well, not only the home page.
    await page.goto(`${base}/articles/does-not-exist`)
    await expect(page.locator('main.maintenance-page')).toBeVisible()

    // The admin keeps working — otherwise nobody could switch maintenance off again.
    await page.goto(`${base}/admin`)
    await expect(page.locator('span[title="Dashboard"]')).toBeVisible()

    // Switch it off through the UI and check the site comes back.
    await page.goto(`${base}/admin/globals/site-settings`)
    await toggle.uncheck()
    const savedOff = page.waitForResponse(
      (response) =>
        response.url().includes('/api/globals/site-settings') &&
        response.request().method() === 'POST' &&
        response.ok(),
    )
    await page.locator('#action-save').click()
    await savedOff

    await page.goto(`${base}/`)
    await expect(page.locator('main.maintenance-page')).toHaveCount(0)
    await expect(page.locator('#home')).toBeVisible()
    // The bar only shows after scrolling, which the first test covers.
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect(page.locator('nav.navbar')).toBeVisible()
  })
})
