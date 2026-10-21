import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'

for (const path of ['/preview/error', '/preview/loading']) {
  test(`${path} is mobile-friendly and has no automated accessibility violations`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${baseURL}${path}`)
    await expect(page.locator('.preview-notice')).toContainText('UI state demonstration')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(scan.violations).toEqual([])
  })
}

test('recovery demonstration returns to the portfolio', async ({ page }) => {
  await page.goto(`${baseURL}/preview/error`)
  await page.getByRole('button', { name: 'Try again ↻' }).click()
  await expect(page.locator('#home')).toBeVisible()
})
