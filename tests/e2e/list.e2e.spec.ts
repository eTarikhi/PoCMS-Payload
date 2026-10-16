import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/** TanStack Table list view (ADR 0007): Payload's sorting and selection keep working inside it. */
test.describe('List view table', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('renders the TanStack table with Payload sorting and selection', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin/collections/users')

    const table = page.locator('[data-slot="data-table"][data-collection="users"]')
    await expect(table).toBeVisible()
    await expect(table.locator('#heading-email')).toBeVisible()

    const row = table.locator('tbody tr', { hasText: testUser.email })
    await expect(row).toBeVisible()

    // Selection: Payload's row checkbox drives the row state the table renders.
    await row.locator('.cell-_select input[type="checkbox"]').check()
    await expect(row).toHaveAttribute('data-state', 'selected')

    // Sorting: Payload's heading controls update the URL query.
    await table.locator('#heading-email button[aria-label*="ascending" i]').first().click()
    await expect(page).toHaveURL(/sort=email/)
    await expect(table).toBeVisible()
  })
})
