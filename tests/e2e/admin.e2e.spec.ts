import { expect, type BrowserContext, type Page, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

test.describe('PoCMS Admin Panel (RBAC, Content, SEO Tabs, Forms & Globals)', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await context?.close()
    await cleanupTestUser()
  })

  test('renders governed sidebar navigation across Content, Site settings, and Admin groups', async () => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/?$/)

    await expect(page.locator('#nav-articles')).toBeVisible()
    await expect(page.locator('#nav-projects')).toBeVisible()
    await expect(page.locator('#nav-forms')).toBeVisible()
    await expect(page.locator('#nav-form-submissions')).toBeVisible()
    await expect(page.locator('#nav-redirects')).toBeVisible()
    await expect(page.locator('#nav-global-header')).toBeVisible()
    await expect(page.locator('#nav-global-site-settings')).toBeVisible()
    await expect(page.locator('#nav-users')).toBeVisible()
    await expect(page.locator('#nav-roles')).toBeVisible()
  })

  test('navigates to Articles & Projects list views and renders Content + SEO tabs on create view', async () => {
    await page.goto('/admin/collections/articles')
    await expect(page).toHaveURL(/\/admin\/collections\/articles/)
    await expect(page.locator('h1', { hasText: /Articles/i }).first()).toBeVisible()

    await page.goto('/admin/collections/articles/create')
    await expect(page.getByRole('button', { name: 'Content', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'SEO', exact: true }).first()).toBeVisible()

    await page.goto('/admin/collections/projects')
    await expect(page).toHaveURL(/\/admin\/collections\/projects/)
    await expect(page.locator('h1', { hasText: /Projects/i }).first()).toBeVisible()
  })

  test('navigates to Forms, Form Submissions, Redirects, and Header Studio global', async () => {
    await page.goto('/admin/collections/forms')
    await expect(page).toHaveURL(/\/admin\/collections\/forms/)
    await expect(page.locator('h1', { hasText: /Forms/i }).first()).toBeVisible()

    await page.goto('/admin/collections/form-submissions')
    await expect(page).toHaveURL(/\/admin\/collections\/form-submissions/)
    await expect(page.locator('h1', { hasText: /Form Submissions/i }).first()).toBeVisible()

    await page.goto('/admin/collections/redirects')
    await expect(page).toHaveURL(/\/admin\/collections\/redirects/)
    await expect(page.locator('h1', { hasText: /Redirects/i }).first()).toBeVisible()

    await page.goto('/admin/globals/header')
    await expect(page).toHaveURL(/\/admin\/globals\/header/)
    await expect(page.locator('h1', { hasText: /Header/i }).first()).toBeVisible()
  })

  test('navigates to Users and Roles RBAC administration views', async () => {
    await page.goto('/admin/collections/users')
    await expect(page).toHaveURL(/\/admin\/collections\/users/)
    await expect(page.locator('h1', { hasText: /Users/i }).first()).toBeVisible()

    await page.goto('/admin/collections/roles')
    await expect(page).toHaveURL(/\/admin\/collections\/roles/)
    await expect(page.locator('h1', { hasText: /Roles/i }).first()).toBeVisible()
  })
})
