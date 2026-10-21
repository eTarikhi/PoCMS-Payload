import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// These fixtures exercise the standalone preview, not published CMS article content.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'

test.describe('Studio writing preview', () => {
  test('searches writing and restores results when cleared', async ({ page }) => {
    await page.goto(`${baseURL}/articles`)
    const search = page.getByRole('searchbox', { name: 'Search writing' })
    await search.fill('no-such-topic-89235')
    await expect(page.getByRole('status')).toHaveText('0 articles found')
    await expect(page.getByRole('heading', { name: 'No matching articles.' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search).toHaveValue('')
    await expect(search).toBeFocused()
    await expect(page.locator('.studio-writing-archive article')).not.toHaveCount(0)
  })

  test('opens a local article and returns to the archive', async ({ page }) => {
    await page.goto(`${baseURL}/articles`)
    await page.locator('.studio-writing-archive article a').first().click()
    await expect(page).toHaveURL(/\/articles\/design-preview$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inside the Engineer’s Studio')
    await expect(page.locator('.preview-notice')).toContainText('Demonstration article')
    await expect(page.getByRole('link', { name: 'Work', exact: true })).toHaveAttribute(
      'href',
      '/projects',
    )
    await page.getByRole('link', { name: 'Back to articles' }).click()
    await expect(page).toHaveURL(/\/articles$/)
  })

  for (const path of ['/articles', '/articles/design-preview']) {
    test(`${path} has no automated accessibility violations and fits mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${baseURL}${path}`)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('shows the missing-article view for an unknown preview path', async ({ page }) => {
    await page.goto(`${baseURL}/articles/no-such-article`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Article not found')
    await page.getByRole('link', { name: 'Back to articles' }).click()
    await expect(page).toHaveURL(/\/articles$/)
  })

  test('updates reading progress while scrolling', async ({ page }) => {
    await page.goto(`${baseURL}/articles/design-preview`)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(page.locator('.article-progress')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    )
  })

  test('hides reading progress when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${baseURL}/articles/design-preview`)
    await expect(page.locator('.article-progress')).toHaveCount(0)
  })

  test('supports keyboard skip navigation on an article', async ({ page }) => {
    await page.goto(`${baseURL}/articles/design-preview`)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main-content$/)
  })
})
