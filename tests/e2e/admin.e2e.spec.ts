import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import { assertIntegrationEnvironment } from '../../scripts/integration/safety'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

test.describe('Admin Panel', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    assertIntegrationEnvironment()
    if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
      throw new Error('Admin integration tests require a loopback application.')

    const context = await browser.newContext()
    page = await context.newPage()

    await login({
      page,
      serverURL: baseURL,
      user: {
        email: 'studio-admin@example.test',
        password: process.env.INTEGRATION_ADMIN_PASSWORD!,
      },
    })
  })

  test.afterAll(async () => {
    await page?.context().close()
  })

  test('can navigate to dashboard', async () => {
    await page.goto(`${baseURL}/admin`)
    await expect(page).toHaveURL(`${baseURL}/admin`)
    const dashboardArtifact = page.getByRole('heading', { name: /Welcome back/ })
    await expect(dashboardArtifact).toBeVisible()
  })

  test('can navigate to list view', async () => {
    await page.goto(`${baseURL}/admin/collections/users`)
    await expect(page).toHaveURL((url) => url.pathname === '/admin/collections/users')
    const listViewArtifact = page.locator('h1', { hasText: 'Users' }).first()
    await expect(listViewArtifact).toBeVisible()
  })

  test('can navigate to edit view', async () => {
    await page.goto(`${baseURL}/admin/collections/users/create`)
    await expect(page).toHaveURL(/\/admin\/collections\/users\/[a-zA-Z0-9-_]+/)
    const editViewArtifact = page.locator('input[name="email"]')
    await expect(editViewArtifact).toBeVisible()
  })
})
