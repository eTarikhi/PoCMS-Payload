import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('can go on homepage', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveTitle(/Amir v\.Tarikhi Live Resume/)

    // The skip link is the first focusable element of every page (SiteChrome).
    const skipLink = page.locator('a[href="#main-content"]').first()
    await expect(skipLink).toHaveText('Skip to content')
  })
})
