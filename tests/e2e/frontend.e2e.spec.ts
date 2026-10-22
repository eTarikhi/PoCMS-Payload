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

  test('shows résumé sidebar navigation and accessible project filters', async ({ page }) => {
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

test('uses a consistent professional résumé shell on home and archives', async ({ page }) => {
  for (const path of ['/', '/projects', '/articles']) {
    await page.goto(`${baseURL}${path}`)
    await expect(page.locator('.studio').first()).toHaveCSS('color-scheme', 'light')
    await expect(page.locator('.studio').first()).toHaveCSS(
      'background-color',
      'rgb(245, 247, 250)',
    )
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Let’s talk' })).toHaveCSS(
      'color',
      'rgb(32, 59, 98)',
    )
  }
})

test('places a compact sidebar beside résumé content on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(baseURL)
  const sidebar = await page.locator('.studio-nav').boundingBox()
  const main = await page.getByRole('main').boundingBox()
  expect(sidebar).not.toBeNull()
  expect(main).not.toBeNull()
  expect(sidebar!.width).toBeLessThan(300)
  expect(main!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width)
  const order = await page.getByRole('main').evaluate((main) => {
    const experience = main.querySelector('#experience')!
    const projects = main.querySelector('#project')!
    return !!(experience.compareDocumentPosition(projects) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
})
