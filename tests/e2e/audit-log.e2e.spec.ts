import AxeBuilder from '@axe-core/playwright'
import { getPayload } from 'payload'
import { expect, test } from '@playwright/test'

import config from '../../src/payload.config.js'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const LOG = 'http://localhost:3000/admin/collections/audit-logs'

/**
 * Audit log (CR-12 E5): signing in is recorded, the filterable list shows the entries, and the
 * dashboard widget shows the newest ones for users with the viewAuditLog capability.
 */
test.describe('Audit log', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('records the sign-in and lists it', async ({ page }) => {
    await login({ page, user: testUser })

    // The afterLogin hook writes the entry; give the request a moment to commit before reading.
    const payload = await getPayload({ config })
    await expect(async () => {
      const { totalDocs } = await payload.find({
        collection: 'audit-logs',
        where: {
          and: [
            { action: { equals: 'login' } },
            { userEmail: { equals: testUser.email } },
          ],
        },
        limit: 1,
      })
      expect(totalDocs).toBeGreaterThan(0)
    }).toPass({ timeout: 20_000 })

    await page.goto(LOG)
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible()
    await expect(page.locator('tbody')).toContainText('Signed in')
    await expect(page.locator('tbody')).toContainText(testUser.email)
    // Payload's toolbar is the filter interface.
    await expect(page.getByRole('searchbox').first()).toBeVisible()
  })

  test('shows the newest entries in the dashboard widget', async ({ page }) => {
    await login({ page, user: testUser })
    const widget = page.locator('[data-dashboard-widget]', { hasText: 'Audit log' })
    await expect(widget.getByRole('heading', { level: 2, name: 'Audit log' })).toBeVisible()
    await expect(widget.getByRole('link', { name: 'View log' })).toHaveAttribute(
      'href',
      /\/admin\/collections\/audit-logs$/,
    )
    await expect(widget).toContainText('Signed in')
  })

  test('has no serious axe violations', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto(LOG)
    await expect(page.locator('tbody tr').first()).toBeVisible()

    const results = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  })
})
