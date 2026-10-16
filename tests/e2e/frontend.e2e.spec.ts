import { expect, test } from '@playwright/test'

test.describe('Frontend', () => {
  test('renders the portfolio home page', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveTitle(/Tarikhi/)
    // The hero heading is the Header document's `sureName`; any non-empty value is fine here.
    await expect(page.locator('h1').first()).not.toBeEmpty()
  })
})
