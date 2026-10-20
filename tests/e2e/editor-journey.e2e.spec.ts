import { getPayload } from 'payload'
import { expect, test } from '@playwright/test'

import config from '../../src/payload.config.js'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Task-based acceptance test (roadmap QA): what an editor actually does in a day.
 *
 * Sign in, write an article in the admin, save it, and see it on the public site — including the
 * parts that are easy to break without noticing: the slug generated from the title, the static
 * article route finding the new document, the paragraphs rendered from plain text, the SEO
 * metadata, and the audit log recording the creation.
 */
const base = 'http://localhost:3000'
const title = `Acceptance journey ${Date.now()}`

test.describe('Editor journey', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    const payload = await getPayload({ config })
    await payload.delete({ collection: 'articles', where: { title: { equals: title } } })
    await cleanupTestUser()
  })

  test('writes an article, saves it, and reads it on the public site', async ({ page }) => {
    test.setTimeout(120_000)
    await login({ page, user: testUser })

    // 1. Write it.
    await page.goto(`${base}/admin/collections/articles/create`)
    await page.fill('#field-title', title)
    await page.fill('#field-excerpt', 'An article written through the admin, end to end.')
    await page.fill(
      '#field-description',
      'The first paragraph.\n\nA second paragraph with <angle brackets> & an ampersand.',
    )
    await page.fill('#field-link', 'https://example.com/acceptance-journey')
    // The sidebar date field: open the picker and take the preselected day.
    await page.locator('#field-publishedAt input').first().click()
    await page.locator('.react-datepicker__day--today').first().click()

    await page.getByRole('button', { name: 'Save' }).click()

    // 2. Payload creates the document and opens its edit view.
    await expect(page).toHaveURL(/\/admin\/collections\/articles\/\d+$/, { timeout: 30_000 })
    // The edit view now shows the saved document (the title field is filled again from the server).
    await expect(page.locator('#field-title')).toHaveValue(title)
    const slug = await page.locator('#field-slug').inputValue()
    expect(slug).toMatch(/^acceptance-journey-\d+$/)

    // 3. The public page, in a fresh session (no admin cookie, no preview code).
    const context = await page.context().browser()!.newContext()
    const reader = await context.newPage()
    const response = await reader.goto(`${base}/articles/${slug}`, { waitUntil: 'networkidle' })
    expect(response?.status()).toBe(200)
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(reader.locator('main')).toContainText('The first paragraph.')
    await expect(reader.locator('main')).toContainText('A second paragraph with <angle brackets> &')
    // Metadata and structured data are derived from the document.
    await expect(reader.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'An article written through the admin, end to end.',
    )
    // Scripts have no rendered text: read the element's content instead.
    const jsonLd = await reader
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()
    expect(jsonLd).toContain('"BlogPosting"')
    await context.close()

    // 4. The audit log has the entry, attributed to the editor.
    await page.goto(`${base}/admin/collections/audit-logs`)
    const row = page.locator('tbody tr', { hasText: title })
    await expect(row.first()).toBeVisible()
    await expect(row.first()).toContainText('Created')
    await expect(row.first()).toContainText(testUser.email)

    // 5. Trashing it from the list removes the public page (restorable, so the data is still there).
    await page.goto(`${base}/admin/collections/articles`)
    const listRow = page.getByRole('row', { name: new RegExp(title) })
    await expect(listRow).toHaveCount(1)
    await listRow.getByRole('checkbox').click()
    await page.locator('.list-selection').getByRole('button', { name: /^Delete$/ }).click()
    await expect(page.getByText(/move 1 Article to the trash/i)).toBeVisible()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText(/moved to trash/i)).toBeVisible({ timeout: 30_000 })

    const gone = await page.request.get(`${base}/articles/${slug}`)
    expect(gone.status()).toBe(404)

    // 6. Restore it from the trash: the editor changed their mind, and nothing was lost.
    await page.goto(`${base}/admin/collections/articles/trash`)
    const trashed = page.getByRole('row', { name: new RegExp(title) })
    await expect(trashed).toHaveCount(1)
    await trashed.getByRole('checkbox').click()
    await page.locator('.list-selection').getByRole('button', { name: /Restore/ }).click()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText(/Restored 1 Article/i)).toBeVisible({ timeout: 30_000 })

    const back = await page.request.get(`${base}/articles/${slug}`)
    expect(back.status()).toBe(200)
  })
})
