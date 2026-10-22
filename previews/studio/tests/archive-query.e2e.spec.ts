import { test, expect } from '@playwright/test'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'

test.describe('Shareable archive views', () => {
  test('restores project filters from a link and browser history', async ({ page }) => {
    await page.goto(`${baseURL}/projects?q=SepiWhite&category=front-end&ref=preview`)
    const search = page.getByRole('searchbox', { name: 'Search projects' })
    await expect(search).toHaveValue('SepiWhite')
    await expect(page.getByRole('button', { name: 'Front-End', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('.studio-project')).toHaveCount(1)
    await page.getByRole('button', { name: 'Back-End', exact: true }).click()
    await expect(page).toHaveURL(/category=back-end/)
    await page.reload()
    await expect(search).toHaveValue('SepiWhite')
    await expect(page.getByRole('button', { name: 'Back-End', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Front-End', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.goForward()
    await expect(page.getByRole('button', { name: 'Back-End', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: 'Reset all filters' }).click()
    await expect(search).toHaveValue('')
    expect(new URL(page.url()).searchParams.get('ref')).toBe('preview')
    expect(new URL(page.url()).searchParams.has('q')).toBe(false)
    expect(new URL(page.url()).searchParams.has('category')).toBe(false)
    await expect(search).toBeFocused()
  })

  test('retains writing search when returning from an article', async ({ page }) => {
    await page.goto(`${baseURL}/articles?q=DevOps`)
    await expect(page.getByRole('searchbox')).toHaveValue('DevOps')
    const count = await page.locator('.studio-writing-archive article').count()
    expect(count).toBeGreaterThan(0)
    await page.locator('.studio-writing-archive article a').first().click()
    await expect(page).toHaveURL(/design-preview$/)
    await page.goBack()
    await expect(page.getByRole('searchbox')).toHaveValue('DevOps')
    await expect(page.locator('.studio-writing-archive article')).toHaveCount(count)
  })

  test('treats an unknown category as All and marks the current archive', async ({ page }) => {
    await page.goto(`${baseURL}/projects?category=not-a-category`)
    await expect(page.getByRole('button', { name: 'All Projects', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await page.getByRole('link', { name: 'Articles', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Articles', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
