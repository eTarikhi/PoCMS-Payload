import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

test.describe('Admin Panel', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()

    const context = await browser.newContext()
    page = await context.newPage()

    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('can navigate to dashboard', async () => {
    await page.goto('http://localhost:3000/admin')
    await expect(page).toHaveURL('http://localhost:3000/admin')
    const dashboardArtifact = page.locator('span[title="Dashboard"]').first()
    await expect(dashboardArtifact).toBeVisible()
  })

  test('dashboard shows the PoCMS widgets', async () => {
    await page.goto('http://localhost:3000/admin')
    for (const title of ['Content overview', 'Quick actions', 'Recent activity', 'Needs attention']) {
      await expect(page.locator('.pocms-widget__title', { hasText: title }).first()).toBeVisible()
    }
    // Quick actions surfaces the most common editor shortcut.
    await expect(page.locator('.pocms-links a', { hasText: 'New article' }).first()).toBeVisible()
  })

  test('navigation groups the content sections', async () => {
    await page.goto('http://localhost:3000/admin')
    await expect(page.locator('.nav', { hasText: 'Content' }).first()).toBeVisible()
    await expect(page.locator('.nav', { hasText: 'Portfolio' }).first()).toBeVisible()
  })

  test('articles list shows the summary strip', async () => {
    await page.goto('http://localhost:3000/admin/collections/articles')
    await expect(page.locator('.pocms-list-summary').first()).toBeVisible()
    await expect(page.locator('.pocms-list-summary__facts').first()).toBeVisible()
  })

  test('can navigate to list view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users')
    await expect(page).toHaveURL('http://localhost:3000/admin/collections/users')
    const listViewArtifact = page.locator('h1', { hasText: 'Users' }).first()
    await expect(listViewArtifact).toBeVisible()
  })

  test('can navigate to edit view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users/create')
    await expect(page).toHaveURL(/\/admin\/collections\/users\/[a-zA-Z0-9-_]+/)
    const editViewArtifact = page.locator('input[name="email"]')
    await expect(editViewArtifact).toBeVisible()
  })
})
