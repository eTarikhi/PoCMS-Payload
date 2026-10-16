import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * The admin-only UI kit (/admin/ui-kit): renders inside Payload's shell, has no serious
 * accessibility violations in either theme, and Base UI popups open above Payload drawers.
 */
test.describe('UI kit', () => {
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
      await page.goto('http://localhost:3000/admin/ui-kit')

      await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      // The kit itself is a lazily loaded chunk (UIKitLazy); wait for it before scanning.
      await expect(page.getByTestId('ui-kit')).toBeVisible()

      const results = await new AxeBuilder({ page })
        .include('[data-testid="ui-kit"]')
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

  test('opens Base UI popups above a Payload drawer', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin/ui-kit')

    // The kit is server-rendered: a click before hydration does nothing, so retry until it opens.
    await expect(async () => {
      await page.getByRole('button', { name: 'Open a Payload drawer' }).click()
      await expect(page.getByTestId('ui-kit-drawer')).toBeVisible({ timeout: 2_000 })
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
