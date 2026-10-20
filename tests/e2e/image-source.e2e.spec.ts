import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * The Image source control (P5.2): one upload field, two sources. The tab that is not active is
 * hidden; the status line names the source the site will use; the URL input writes the sibling text
 * field and nothing else.
 */
test.describe('Image source field', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('switches between the media library and an external URL on an article', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin/collections/articles/create')

    const uploadTab = page.getByRole('tab', { name: 'Media library' })
    const urlTab = page.getByRole('tab', { name: 'External URL' })
    await expect(uploadTab).toHaveAttribute('aria-selected', 'true')
    // A new article has neither source yet.
    await expect(page.getByTestId('image-source-status')).toContainText('No image yet')

    // The upload control from Payload is really there (it has its own remove/set buttons).
    await expect(page.locator('.upload').first()).toBeVisible()

    await urlTab.click()
    await expect(urlTab).toHaveAttribute('aria-selected', 'true')
    await expect(uploadTab).toHaveAttribute('aria-selected', 'false')

    await page.locator('#field-imageUrl-source').fill('https://example.com/picture.jpg')
    await expect(page.getByTestId('image-source-status')).toContainText(
      'The site uses the external URL',
    )

    // The hidden field Payload submits carries the same value (that is the "two ids, one value"
    // arrangement described in the component).
    await expect(page.locator('input[type="hidden"]#field-imageUrl')).toHaveValue(
      'https://example.com/picture.jpg',
    )

    // The field still saves, and the URL lands in the text field it belongs to.
    await page.locator('#field-title').fill('Image source probe')
    await page.locator('#field-excerpt').fill('Checks the image source control.')
    await page.locator('#field-link').fill('https://example.com/article')
    // Payload's date field: the wrapper has the id, the input inside takes the text.
    await page.locator('#field-publishedAt input').fill('2026-01-02')
    await page.locator('#field-publishedAt input').blur()
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/articles') &&
        response.request().method() === 'POST' &&
        response.ok(),
    )
    await page.locator('#action-save').click()
    const body = await (await saved).json()
    expect(body.doc.imageUrl).toBe('https://example.com/picture.jpg')

    // Clean up through the API, so the next run starts from the same state.
    const deleted = await page.request.delete(`http://localhost:3000/api/articles/${body.doc.id}`)
    expect(deleted.ok()).toBe(true)
  })

  test('has no serious axe violations on the control', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto('http://localhost:3000/admin/collections/articles/create')
    await page.getByRole('tab', { name: 'External URL' }).click()

    const results = await new AxeBuilder({ page })
      .include('.field-type.upload')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    )
    expect(serious.map((violation) => violation.id)).toEqual([])
  })
})
