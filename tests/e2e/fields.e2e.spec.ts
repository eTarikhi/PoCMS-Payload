import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/** Tile pickers for select fields (Skills color, Services icon): native radios, stored values unchanged. */
test.describe('Tile picker fields', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('Skills color picker selects a swatch and passes axe', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin/collections/skills/create')

    const group = page.getByRole('radiogroup', { name: 'Color' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('radio', { name: 'primary' })).toBeChecked() // the field default

    await group.getByText('danger', { exact: true }).click()
    await expect(group.getByRole('radio', { name: 'danger' })).toBeChecked()
    await expect(group.getByRole('radio', { name: 'primary' })).not.toBeChecked()

    const results = await new AxeBuilder({ page })
      .include('[role="radiogroup"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious.map((v) => v.id)).toEqual([])
  })

  test('Services icon picker lists the icons the site supports', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin/collections/services/create')

    const group = page.getByRole('radiogroup', { name: 'Icon Font' })
    await expect(group.getByRole('radio')).toHaveCount(4)
    await group.getByText('faLaptopCode', { exact: true }).click()
    await expect(group.getByRole('radio', { name: 'faLaptopCode' })).toBeChecked()
  })
})
