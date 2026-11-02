import { expect, type BrowserContext, type Page, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

test.describe('PoCMS Admin Panel (RBAC, Content, SEO Tabs, Forms, Globals, Inbox & Database)', () => {
  test.describe.configure({ mode: 'serial' })

  let context: BrowserContext | undefined
  let page: Page
  let didSeedUser = false

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    await seedTestUser()
    didSeedUser = true
    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await context?.close()
    if (didSeedUser) {
      await cleanupTestUser()
    }
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
    await expect(page.locator('#nav-global-custom-code')).toBeVisible()
    await expect(page.locator('#nav-users')).toBeVisible()
    await expect(page.locator('#nav-roles')).toBeVisible()
    await expect(page.locator('#nav-inbox')).toBeVisible()
    await expect(page.locator('#nav-database')).toBeVisible()
    await expect(page.locator('#nav-system')).toBeVisible()
    await expect(page.locator('#nav-jobs')).toBeVisible()
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

  test('navigates to Forms, Form Submissions, Redirects, Header Studio, and Codes globals', async () => {
    await page.goto('/admin/collections/forms')
    await expect(page).toHaveURL(/\/admin\/collections\/forms/)
    await expect(page.locator('h1', { hasText: /Forms/i }).first()).toBeVisible()

    await page.goto('/admin/collections/form-submissions')
    await expect(page).toHaveURL(/\/admin\/collections\/form-submissions/)
    await expect(page.locator('h1', { hasText: /Submissions/i }).first()).toBeVisible()

    await page.goto('/admin/collections/redirects')
    await expect(page).toHaveURL(/\/admin\/collections\/redirects/)
    await expect(page.locator('h1', { hasText: /Redirects/i }).first()).toBeVisible()

    await page.goto('/admin/globals/header')
    await expect(page).toHaveURL(/\/admin\/globals\/header/)
    await expect(page.locator('h1', { hasText: /Header/i }).first()).toBeVisible()

    await page.goto('/admin/globals/custom-code')
    await expect(page).toHaveURL(/\/admin\/globals\/custom-code/)
    await expect(page.locator('h1', { hasText: /Codes/i }).first()).toBeVisible()
  })

  test('navigates to 3-pane Mail Inbox (/admin/inbox) and Database Manager (/admin/database)', async () => {
    await page.goto('/admin/inbox')
    await expect(page).toHaveURL(/\/admin\/inbox/)
    await expect(page.locator('h1', { hasText: /Mail inbox/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Compose/i }).first()).toBeVisible()

    await page.goto('/admin/database')
    await expect(page).toHaveURL(/\/admin\/database/)
    await expect(page.getByTestId('database-view')).toBeVisible()
    await expect(page.locator('h1', { hasText: /Database manager/i }).first()).toBeVisible()

    // Verify responsive tab navigation enclosure, card clearance & grid column alignment across viewports
    const initialViewport = page.viewportSize() ?? { width: 1280, height: 720 }
    try {
      for (const vp of [
        { width: 390, height: 844, mode: 'mobile-scroll' as const },
        { width: 1024, height: 768, mode: 'grid' as const },
        { width: 1720, height: 900, mode: 'single-row' as const },
      ]) {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        const tabList = page.getByTestId('database-view').getByRole('tablist')
        await expect(tabList).toBeVisible()
        const listBox = await tabList.boundingBox()
        const tabs = tabList.getByRole('tab')
        await expect(tabs).toHaveCount(7)

        const firstBox = await tabs.nth(0).boundingBox()
        const lastBox = await tabs.nth(6).boundingBox()
        const panelBox = await page
          .getByTestId('database-view')
          .locator('[data-slot="tabs-content"]')
          .first()
          .boundingBox()

        expect(listBox).not.toBeNull()
        expect(firstBox).not.toBeNull()
        expect(lastBox).not.toBeNull()
        expect(panelBox).not.toBeNull()

        // Every tab must sit vertically inside the muted TabsList container (zero vertical overflow)
        for (let i = 0; i < 7; i++) {
          const box = await tabs.nth(i).boundingBox()
          expect(box).not.toBeNull()
          expect(box!.y).toBeGreaterThanOrEqual(listBox!.y - 1)
          expect(box!.y + box!.height).toBeLessThanOrEqual(listBox!.y + listBox!.height + 1)
        }

        // Content card below must never overlap TabsList
        expect(panelBox!.y).toBeGreaterThanOrEqual(listBox!.y + listBox!.height + 16)

        if (vp.mode === 'grid') {
          // On multi-row grid viewports, the 7th tab must align with a grid column (never stretch 100% centered)
          expect(Math.abs(lastBox!.width - firstBox!.width)).toBeLessThanOrEqual(2)
        } else if (vp.mode === 'single-row') {
          // On wide desktop viewports, all 7 tabs sit on a single horizontal row
          expect(Math.abs(lastBox!.y - firstBox!.y)).toBeLessThanOrEqual(2)
        }
      }
    } finally {
      await page.setViewportSize(initialViewport)
    }
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
