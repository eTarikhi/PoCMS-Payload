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

    // Verify 5-stage hole-free responsive tab navigation across all device breakpoints
    const initialViewport = page.viewportSize() ?? { width: 1280, height: 720 }
    try {
      for (const vp of [
        { width: 320, height: 640, expectedRows: 7 },
        { width: 390, height: 844, expectedRows: 4 },
        { width: 626, height: 897, expectedRows: 3 },
        { width: 1024, height: 768, expectedRows: 2 },
        { width: 1485, height: 900, expectedRows: 1 },
        { width: 1720, height: 900, expectedRows: 1 },
      ]) {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        // Allow Payload's @faceless-ui/window-info debounced resize observer to settle
        await page.waitForTimeout(250)

        const tabList = page.getByTestId('database-view').getByRole('tablist')
        await expect(tabList).toBeVisible()
        await expect(tabList.getByRole('tab')).toHaveCount(7)

        // Read all bounding rects atomically in the same layout frame (avoid inner named functions for esbuild __name)
        const geometry = await page.getByTestId('database-view').evaluate((root) => {
          const listEl = root.querySelector<HTMLElement>('[role="tablist"]')
          const tabEls = Array.from(root.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]'))
          const panelEl = root.querySelector<HTMLElement>('[data-slot="tabs-content"]')
          if (!listEl || !panelEl || tabEls.length !== 7) return null
          const lr = listEl.getBoundingClientRect()
          const pr = panelEl.getBoundingClientRect()
          return {
            listBox: {
              x: lr.x,
              y: lr.y,
              width: lr.width,
              height: lr.height,
              scrollWidth: listEl.scrollWidth,
              clientWidth: listEl.clientWidth,
            },
            tabBoxes: tabEls.map((t) => {
              const r = t.getBoundingClientRect()
              return { x: r.x, y: r.y, width: r.width, height: r.height }
            }),
            panelBox: { x: pr.x, y: pr.y, width: pr.width, height: pr.height },
          }
        })

        expect(geometry).not.toBeNull()
        const { listBox, tabBoxes, panelBox } = geometry!
        const firstBox = tabBoxes[0]!
        const lastBox = tabBoxes[6]!
        const debugCtx = JSON.stringify({ vp, listBox, tabBoxes, panelBox })

        // Zero horizontal scrollbar / off-screen clipping at every breakpoint
        expect(listBox.scrollWidth, debugCtx).toBeLessThanOrEqual(listBox.clientWidth + 1)

        // Every tab must sit strictly inside the muted TabsList container (horizontally & vertically)
        const rowYs: number[] = []
        for (const box of tabBoxes) {
          expect(box.x, debugCtx).toBeGreaterThanOrEqual(listBox.x - 1)
          expect(box.x + box.width, debugCtx).toBeLessThanOrEqual(listBox.x + listBox.width + 1)
          expect(box.y, debugCtx).toBeGreaterThanOrEqual(listBox.y - 1)
          expect(box.y + box.height, debugCtx).toBeLessThanOrEqual(listBox.y + listBox.height + 1)
          if (!rowYs.some((ry) => Math.abs(ry - box.y) <= 4)) {
            rowYs.push(box.y)
          }
        }

        // Exact expected row count (1 row on 1485px/1720px desktop, 2 rows on 1024px tablet, 3 rows on 626px, 4 rows on 390px, 7 rows on 320px)
        expect(rowYs.length, debugCtx).toBe(vp.expectedRows)

        // Zero empty hole on either edge: 1st tab aligns with left inner edge and 7th tab reaches right inner edge of TabsList
        expect(firstBox.x - listBox.x, debugCtx).toBeLessThanOrEqual(8)
        expect(
          listBox.x + listBox.width - (lastBox.x + lastBox.width),
          debugCtx,
        ).toBeLessThanOrEqual(8)

        // Content card below must never overlap TabsList
        expect(panelBox.y, debugCtx).toBeGreaterThanOrEqual(listBox.y + listBox.height + 16)
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
