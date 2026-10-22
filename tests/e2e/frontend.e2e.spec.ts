import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

test('restores the owner’s original homepage composition rather than a replacement theme', async ({
  page,
}) => {
  await page.goto(baseURL)
  await expect(page.locator('.original-portfolio')).toBeVisible()
  await expect(page.locator('.studio')).toHaveCount(0)
  await expect(page.locator('#home .typed-text-output')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My Services' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Latest Articles' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'All Articles >' })).toHaveAttribute(
    'href',
    '/articles',
  )
})

test('opens the redesigned project archive and filters projects', async ({ page }) => {
  await page.goto(baseURL)
  await page.getByRole('link', { name: 'Explore all projects ↗' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  const filter = page.getByRole('group', { name: 'Filter projects' }).getByRole('button').first()
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
})

test('fits the restored homepage in a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseURL)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 500))
  await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeVisible()
  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await expect(
    page
      .getByRole('navigation', { name: 'Portfolio navigation' })
      .getByRole('link', { name: 'Blog', exact: true }),
  ).toBeVisible()
})

for (const path of ['/blog', '/articles', '/projects']) {
  test(`${path} extends the original charcoal/amber theme and has no automated accessibility violations`, async ({
    page,
  }) => {
    await page.goto(`${baseURL}${path}`)
    await expect(page.locator('.amber-journal')).toHaveCSS('color-scheme', 'dark')
    await expect(page.locator('.amber-journal')).toHaveCSS('--accent', '#ffc448')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(scan.violations).toEqual([])
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
