import { expect, test, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Media folders, end to end (Payload's beta folders feature).
 *
 * The seed files the images into three folders (Project covers, Article covers, Certificates), so
 * the admin's folder browser at /admin/browse-by-folder has something to list. What this spec pins:
 *
 * - the browser lists the folders and opening one shows the images filed into it,
 * - the thumbnails carry the file name as alt text (Payload renders them without `alt`; the
 *   AdminDomFixes fill it in — a11y.e2e.spec.ts runs the full axe sweep),
 * - the icon-only grid/list toggles and the folder "…" menu have accessible names,
 * - the "Create folder" control is reachable as a button (Payload renders a `<div type="button">`;
 *   the DOM fix adds the role and Enter/Space handling),
 * - creating a folder in the drawer works without picking a folder type, because the collection
 *   override defaults it to Media — the only collection folders are enabled on.
 */
test.describe('Media folders', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  const deleteFolder = async (name: string) => {
    const response = await page.request.get(
      `http://localhost:3000/api/payload-folders?limit=100&depth=0&where[name][equals]=${encodeURIComponent(name)}`,
    )
    const data = (await response.json()) as { docs?: { id?: number | string }[] }
    for (const doc of data.docs ?? []) {
      await page.request.delete(`http://localhost:3000/api/payload-folders/${doc.id}`)
    }
  }

  test('lists the seeded folders and opens one', async () => {
    await page.goto('http://localhost:3000/admin/browse-by-folder', { waitUntil: 'networkidle' })

    await expect(page.locator('h1', { hasText: 'Browse by Folder' })).toBeVisible()
    const folders = page.locator('.folder-file-card--folder')
    await expect(folders.filter({ hasText: 'Project covers' })).toBeVisible()
    await expect(folders.filter({ hasText: 'Article covers' })).toBeVisible()
    await expect(folders.filter({ hasText: 'Certificates' })).toBeVisible()

    await folders.filter({ hasText: 'Project covers' }).locator('.folder-file-card__name').dblclick()

    await expect(page).toHaveURL(/\/admin\/browse-by-folder\/\d+/)
    await expect(page.locator('h1')).toHaveText('Project covers')

    const files = page.locator('.folder-file-card--file')
    expect(await files.count()).toBeGreaterThan(0)

    // Alt text comes from the card's file name; an empty alt would be a decorative lie here.
    // The DOM fix runs from a MutationObserver, so poll instead of sampling the first frame.
    await expect
      .poll(async () => {
        const alts = await page
          .locator('.folder-file-card--file img')
          .evaluateAll((images) => images.map((image) => image.getAttribute('alt') ?? ''))
        return alts.length > 0 && alts.every((alt) => alt.trim() !== '')
      })
      .toBe(true)
  })

  test('the folder controls expose names and the create button is a button', async () => {
    await page.goto('http://localhost:3000/admin/browse-by-folder', { waitUntil: 'networkidle' })

    await expect(page.locator('.folder-view-toggle-button[aria-label="Grid view"]')).toBeAttached()
    await expect(page.locator('.folder-view-toggle-button[aria-label="List view"]')).toBeAttached()

    const create = page.getByRole('button', { name: 'Create folder' })
    await expect(create).toBeVisible()
    await expect(create).toHaveAttribute('tabindex', '0')
  })

  test('creates a folder with just a name, then deletes it', async () => {
    const name = `E2E folder ${Date.now()}`
    await page.goto('http://localhost:3000/admin/browse-by-folder', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: 'Create folder' }).click()
    await expect(page.getByText('Creating new Folder')).toBeVisible()

    // The collection override hides Payload's "Folder Type" select (only media can be in a folder)
    // and defaults the value, so the drawer only asks for a name.
    await expect(page.locator('#field-folderType')).toBeHidden()

    await page.fill('#field-name', name)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 })
    await deleteFolder(name)
  })
})
