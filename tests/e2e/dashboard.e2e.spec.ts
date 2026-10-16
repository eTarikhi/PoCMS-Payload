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

  test('the publishing chart is interactive', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin')
    // The chart island replaces the server-rendered bars once its chunk has loaded.
    const chart = page.getByTestId('publishing-chart')
    await expect(chart).toBeVisible({ timeout: 60_000 })

    // Range: 24 months, remembered across reloads.
    await chart.getByRole('button', { name: /^24M/ }).click()
    await expect(chart.getByRole('button', { name: /^24M/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.reload()
    await expect(
      page.getByTestId('publishing-chart').getByRole('button', { name: /^24M/ }),
    ).toHaveAttribute('aria-pressed', 'true')

    // Tooltip on hover.
    await page.getByTestId('publishing-chart').locator('path.recharts-rectangle').first().hover()
    await expect(page.locator('.recharts-tooltip-wrapper')).toContainText(/Articles|Projects/)

    // Month stepper: defaults to the latest month with activity (the seeded projects).
    const month = page.getByTestId('publishing-month')
    const latest = await month.textContent()
    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(month).not.toHaveText(latest ?? '')
    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(month).toHaveText(latest ?? '')

    // Series toggles keep at least one series on.
    const projects = page.getByRole('button', { name: /^Projects/ })
    await projects.click()
    await expect(projects).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: /^Articles/ })).toBeDisabled()
    await projects.click()

    // Drill-down: the selected month's projects open as a filtered list.
    await page
      .getByTestId('publishing-chart')
      .getByRole('link', { name: /projects/ })
      .click()
    await expect(page).toHaveURL(/collections\/projects\?.*createdAt/)
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })

  test('month links filter the list by the date field', async ({ page }) => {
    await login({ page, user: testUser })
    // Seeded articles: two published in December 2024.
    const params = new URLSearchParams({
      'where[and][0][publishedAt][greater_than_equal]': '2024-12-01T00:00:00.000Z',
      'where[and][1][publishedAt][less_than]': '2025-01-01T00:00:00.000Z',
    })
    await page.goto(`http://localhost:3000/admin/collections/articles?${params}`)
    await expect(page.locator('table tbody tr')).toHaveCount(2)
  })
})
