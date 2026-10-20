import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const SERVER = 'http://localhost:3000'

/**
 * Scheduled jobs (CR-12 E4): the task cards, the Run now button and the runs table at /admin/jobs,
 * with the WCAG 2.2 AA axe tags in both themes.
 */
test.describe('Scheduled jobs', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('lists the tasks and runs one from the page', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto(`${SERVER}/admin/jobs`)

    await expect(page.getByRole('heading', { level: 1, name: 'Scheduled jobs' })).toBeVisible()
    for (const task of ['Empty the trash', 'Page speed report', 'Broken link check']) {
      await expect(page.getByRole('heading', { level: 3, name: task })).toBeVisible()
    }

    // The trash task needs no outside service: run it and see the recorded outcome.
    const trashCard = page
      .locator('li', { has: page.getByRole('heading', { level: 3, name: 'Empty the trash' }) })
      .first()
    await trashCard.getByRole('button', { name: /Run now/ }).click()
    const runs = page.getByRole('table')
    await expect(runs.getByText('Done').first()).toBeVisible({ timeout: 30_000 })
    await expect(runs.getByText(/trash/i).first()).toBeVisible()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`has no serious axe violations (${theme})`, async ({ page, context }) => {
      await seedTestUser()
      await context.addCookies([{ name: 'payload-theme', value: theme, url: SERVER }])
      await login({ page, user: testUser })
      await page.goto(`${SERVER}/admin/jobs`)
      await expect(page.getByTestId('jobs')).toBeVisible()

      const results = await new AxeBuilder({ page })
        .include('[data-testid="jobs"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      )
      expect(
        serious.map(
          (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([])
    })
  }
})
