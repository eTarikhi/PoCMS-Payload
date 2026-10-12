import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

async function expectSharedAdminTheme(page: Page) {
  const primary = await page
    .locator('html')
    .evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--pocms-admin-primary').trim(),
    )
  expect(primary).toMatch(/^#[0-9a-f]{6}$/i)
}

test.describe('Admin Panel', () => {
  let page: Page

  test.beforeAll(async ({ browser }, testInfo) => {
    await seedTestUser()

    const context = await browser.newContext()
    page = await context.newPage()

    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('can navigate to the custom content dashboard', async () => {
    await page.goto('http://localhost:3000/admin')
    await expect(page).toHaveURL('http://localhost:3000/admin')
    await expect(page.getByRole('heading', { name: 'Your content, at a glance.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New article' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New project' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Content totals' })).toBeVisible()
  })

  test('custom dashboard fits a narrow mobile viewport', async () => {
    const originalViewport = page.viewportSize()
    await page.setViewportSize({ width: 375, height: 812 })

    try {
      await page.goto('http://localhost:3000/admin')
      await expect(page.getByRole('heading', { name: 'Your content, at a glance.' })).toBeVisible()

      const dashboard = page.locator('.pocms-admin')
      await expect(dashboard).toBeVisible()
      const fitsViewport = await dashboard.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      )
      expect(fitsViewport).toBe(true)
    } finally {
      if (originalViewport) await page.setViewportSize(originalViewport)
    }
  })

  test('can navigate to list view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users')
    await expect(page).toHaveURL('http://localhost:3000/admin/collections/users')
    await expectSharedAdminTheme(page)
    const listViewArtifact = page.locator('h1', { hasText: 'Users' }).first()
    await expect(listViewArtifact).toBeVisible()
  })

  test('shows the styled article checklist above the native list', async () => {
    await page.goto('http://localhost:3000/admin/collections/articles')
    await expect(page.getByRole('heading', { name: 'A quick article checklist' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create article' })).toBeVisible()
  })

  test('can navigate to edit view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users/create')
    await expect(page).toHaveURL(/\/admin\/collections\/users\/[a-zA-Z0-9-_]+/)
    await expectSharedAdminTheme(page)
    const editViewArtifact = page.locator('input[name="email"]')
    await expect(editViewArtifact).toBeVisible()
  })
})
