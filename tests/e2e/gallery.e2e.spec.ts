import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const GALLERY = 'http://localhost:3000/admin/gallery'

/**
 * The admin-only component gallery (/admin/gallery): the registry read from the Payload config, the
 * live components (widgets, field components inside a Payload form, cells), no serious
 * accessibility violations in either theme, and Base UI popups above Payload drawers.
 */
test.describe('Component gallery', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`renders without serious axe violations (${theme})`, async ({ page, context }) => {
      await context.addCookies([
        { name: 'payload-theme', value: theme, url: 'http://localhost:3000' },
      ])
      await login({ page, user: testUser })
      await page.goto(GALLERY)

      await expect(page.getByRole('heading', { level: 1, name: 'Component gallery' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      // The element demos are a lazily loaded chunk (ElementsLazy); wait for them before scanning.
      await expect(page.getByTestId('gallery-elements')).toBeVisible({ timeout: 30_000 })

      const results = await new AxeBuilder({ page })
        .include('[data-testid="gallery"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([])
    })
  }

  test('lists the registered components and keeps the full sidebar', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto(GALLERY)

    const registry = (category: string) => page.locator(`[data-registry="${category}"]`)
    await expect(registry('root')).toContainText(
      '/components/admin/actions/ThemeToggle#ThemeToggle',
    )
    await expect(registry('root')).toContainText('/components/admin/graphics/Logo#Logo')
    // One row per dashboard widget in src/components/admin/widgets/config.ts.
    await expect(registry('widgets').locator('tbody tr')).toHaveCount(10)
    await expect(registry('collections')).toContainText(
      '/components/admin/views/List#TanStackListView',
    )
    await expect(registry('fields')).toContainText(
      '/components/admin/fields/Checkbox/Cell#BooleanCell',
    )

    // Custom views read permissions from initPageResult: the nav keeps its groups and Create menu.
    await expect(page.locator('#nav-articles')).toBeVisible()
    await expect(page.getByTestId('quick-create')).toBeVisible()

    // Admin tools section: the four whole-view tools, each linked for an administrator.
    const tools = page.locator('#tools')
    await expect(tools.getByRole('link', { name: 'Open Scheduled jobs' })).toHaveAttribute(
      'href',
      /\/admin\/jobs$/,
    )
    await expect(tools.getByRole('link', { name: 'Open Audit log' })).toHaveAttribute(
      'href',
      /\/admin\/collections\/audit-logs$/,
    )
    await expect(tools.getByRole('link', { name: 'Open System' })).toHaveAttribute(
      'href',
      /\/admin\/system$/,
    )
    // The terminal's route exists only in development; the gallery lists it with its capability.
    await expect(tools).toContainText('useTerminal')
    await expect(page.getByRole('link', { name: 'Admin tools' })).toHaveAttribute(
      'href',
      '#tools',
    )
  })

  test('field components work inside a Payload form, cells show samples', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto(GALLERY)

    const fields = page.locator('#fields')
    const success = fields.getByRole('radio', { name: 'success', exact: true })
    // Server-rendered: a click before hydration does nothing, so retry until the value changes.
    await expect(async () => {
      await success.check({ force: true })
      await expect(success).toBeChecked({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect(fields.getByRole('radio', { name: 'primary', exact: true })).not.toBeChecked()
    await expect(fields.getByRole('radio', { name: 'faCode', exact: true })).toBeChecked()

    await expect(page.locator('[data-cell-sample="FileSizeCell"]').nth(1)).toHaveText('334 KB')
    await expect(page.locator('[data-cell-sample="BooleanCell"]').first()).toHaveText('Yes')
  })

  test('opens Base UI popups above a Payload drawer', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto(GALLERY)

    // Client chunk: a click before it hydrates does nothing, so retry until the drawer opens.
    await expect(async () => {
      await page.getByRole('button', { name: 'Open a Payload drawer' }).click()
      await expect(page.getByTestId('gallery-drawer')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await page.getByRole('combobox', { name: 'Skill group' }).click()
    const option = page.getByRole('option', { name: 'Back-End' })
    await expect(option).toBeVisible()
    const box = await option.boundingBox()
    const topmost = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="option"]')?.textContent,
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    )
    expect(topmost).toContain('Back-End')

    await option.click()
    await expect(page.getByRole('combobox', { name: 'Skill group' })).toContainText('Back-End')
  })
})
