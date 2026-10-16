import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/** Dashboard widgets (roadmap P4): render for an admin, with no serious axe violations. */
test.describe('Dashboard widgets', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`render without serious axe violations (${theme})`, async ({ page, context }) => {
      await context.addCookies([
        { name: 'payload-theme', value: theme, url: 'http://localhost:3000' },
      ])
      await login({ page, user: testUser })

      for (const title of ['Needs attention', 'Publishing activity', 'Recent changes']) {
        await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
      }
      await expect(page.getByRole('heading', { level: 2, name: /^Welcome back/ })).toBeVisible()
      for (const label of ['Articles', 'Projects', 'Media', 'Certificates']) {
        await expect(page.locator('a[data-dashboard-widget]', { hasText: label })).toBeVisible()
      }

      const results = await new AxeBuilder({ page })
        .include('[data-dashboard-widget]')
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
})
