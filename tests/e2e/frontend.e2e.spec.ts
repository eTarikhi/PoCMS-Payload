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

  test('shows work-first navigation and accessible project filters', async ({ page }) => {
    await page.goto(baseURL)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page.locator('#home')).toHaveCSS('background-image', 'none')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.getByRole('link', { name: 'Work', exact: true }).click()
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
