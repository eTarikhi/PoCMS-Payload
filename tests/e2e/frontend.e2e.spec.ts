import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

test.describe('Engineer’s Studio frontend', () => {
  test('has no automatically detectable WCAG A/AA violations', async ({ page }) => {
    await page.goto(baseURL)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('shows compact portfolio navigation and accessible project filters', async ({ page }) => {
    await page.goto(baseURL)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page.locator('#home')).toHaveCSS('background-image', 'none')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await expect(page).toHaveURL(/\/projects$/)
    const filters = page.getByRole('group', { name: 'Filter projects' })
    const firstFilter = filters.getByRole('button').first()
    await expect(firstFilter).toHaveAttribute('aria-pressed', 'true')
    const secondFilter = filters.getByRole('button').nth(1)
    await secondFilter.click()
    await expect(secondFilter).toHaveAttribute('aria-pressed', 'true')
    await expect(firstFilter).toHaveAttribute('aria-pressed', 'false')
  })

  test('fits a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(baseURL)
    await expect(page.getByRole('link', { name: 'Let’s talk' })).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflows).toBe(false)
  })
})

test('uses a consistent bento portfolio shell on home and archives', async ({ page }) => {
  for (const path of ['/', '/projects', '/articles']) {
    await page.goto(`${baseURL}${path}`)
    await expect(page.locator('.studio').first()).toHaveCSS('color-scheme', 'light')
    await expect(page.locator('.studio').first()).toHaveCSS(
      'background-color',
      'rgb(243, 242, 239)',
    )
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Let’s talk' })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    )
  }
})

test('uses an asymmetric bento board rather than a sidebar on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(baseURL)
  const intro = await page.locator('#home').boundingBox()
  const portrait = await page.locator('.bento-portrait').boundingBox()
  expect(intro).not.toBeNull()
  expect(portrait).not.toBeNull()
  expect(portrait!.x).toBeGreaterThan(intro!.x + intro!.width)
  expect(intro!.width).toBeGreaterThan(portrait!.width)
  expect(Math.abs(intro!.y - portrait!.y)).toBeLessThan(2)
  await expect(page.locator('.bento-board')).toHaveCSS('display', 'grid')
})
