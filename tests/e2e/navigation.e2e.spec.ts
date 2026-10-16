import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/** Branding and information architecture (roadmap P3). */
test.describe('Admin navigation and branding', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    page = await (await browser.newContext()).newPage()
    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  /**
   * A closed sidebar stays in the DOM (inert, behind the page), so check the open state, after
   * hydration: the client applies the saved nav preference.
   */
  async function openNav() {
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1)
    const openNavigation = page.locator('.nav.nav--nav-open')
    if ((await openNavigation.count()) === 0) {
      await page.locator('.nav-toggler').first().click()
      await expect(openNavigation).toHaveCount(1)
    }
    return page.getByTestId('quick-create').locator('summary')
  }

  test('uses the PoCMS title suffix', async () => {
    await page.goto(`${base}/admin`)
    await expect(page).toHaveTitle(/· PoCMS$/)
  })

  test('groups the sidebar and links to the public site', async () => {
    await page.goto(`${base}/admin`)
    await openNav()
    const nav = page.locator('nav.nav__wrap')
    for (const group of ['Content', 'Profile', 'Admin']) {
      await expect(nav.getByText(group, { exact: true }).first()).toBeVisible()
    }
    await expect(page.locator('#nav-view-site')).toHaveAttribute('target', '_blank')
    await expect(page.locator('#nav-ui-kit')).toBeVisible()
  })

  test('Create menu opens the create form', async () => {
    await page.goto(`${base}/admin`)
    await (await openNav()).click()
    await page
      .getByTestId('quick-create')
      .getByRole('link', { name: 'New article', exact: true })
      .click()
    await expect(page).toHaveURL(/\/admin\/collections\/articles\/create/)
  })

  test('Header list opens the single document or the create form', async () => {
    await page.goto(`${base}/admin/collections/header`)
    await expect(page).toHaveURL(/\/admin\/collections\/header\/(\d+|create)$/)
  })
})
