import AxeBuilder from '@axe-core/playwright'
import { getPayload } from 'payload'
import { expect, test } from '@playwright/test'

import config from '../../src/payload.config.js'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const SYSTEM = 'http://localhost:3000/admin/system'
const limitedUser = { email: 'system-limited@example.test', password: 'test' }
const roleName = 'System page reader'

/**
 * System page (CR-12 E6): versions, integrations, database and updates for users with the viewSystem
 * capability; a 404 for a signed-in user whose role does not grant it.
 */
test.describe('System page', () => {
  test.beforeAll(async () => {
    await seedTestUser()
    const payload = await getPayload({ config })
    const role =
      (
        await payload.find({
          collection: 'roles',
          where: { name: { equals: roleName } },
          limit: 1,
        })
      ).docs[0] ??
      (await payload.create({
        collection: 'roles',
        data: {
          name: roleName,
          description: 'Reads content, no admin tools.',
          levels: { articles: 'read', projects: 'read' },
        },
      }))
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: limitedUser.email } },
      limit: 1,
    })
    if (docs[0]) {
      await payload.update({
        collection: 'users',
        id: docs[0].id,
        data: { password: limitedUser.password, roles: [role.id] },
      })
    } else {
      await payload.create({
        collection: 'users',
        data: { ...limitedUser, roles: [role.id] },
      })
    }
  })

  test.afterAll(async () => {
    const payload = await getPayload({ config })
    await payload.delete({
      collection: 'users',
      where: { email: { equals: limitedUser.email } },
    })
    await payload.delete({ collection: 'roles', where: { name: { equals: roleName } } })
    await cleanupTestUser()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`shows the deployment without serious axe violations (${theme})`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: 'payload-theme', value: theme, url: 'http://localhost:3000' },
      ])
      await login({ page, user: testUser })
      await page.goto(SYSTEM)

      await expect(page.getByRole('heading', { level: 1, name: 'System' })).toBeVisible()
      for (const title of ['Application', 'Integrations', 'Database', 'Updates']) {
        await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
      }
      // The sidebar links to the page for users who may open it.
      await expect(page.locator('#nav-system')).toBeVisible()
      // Database card: real tables from the test database.
      await expect(page.getByTestId('system')).toContainText('users')
      await expect(page.getByTestId('system')).toContainText('articles')
      // Updates card: both packages, whatever the registry answered.
      await expect(page.getByTestId('system')).toContainText('payload')
      await expect(page.getByTestId('system')).toContainText('next')
      // Never the values of secrets.
      await expect(page.getByTestId('system')).not.toContainText(process.env.POSTGRES_URL ?? '::')
      await expect(page.getByTestId('system')).not.toContainText('local-dev-secret')

      const results = await new AxeBuilder({ page })
        .include('[data-testid="system"]')
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

  test('is a 404 for a user without the capability', async ({ page }) => {
    await login({ page, user: limitedUser })
    const response = await page.goto(SYSTEM)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'System' })).toHaveCount(0)
  })
})
