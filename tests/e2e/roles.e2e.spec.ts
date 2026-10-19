import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/** Roles, permissions and access levels (ADR 0011). */
test.describe('Roles and permissions', () => {
  let page: Page
  const stamp = Date.now()
  const editor = { email: `e2e-editor-${stamp}@example.test`, password: 'e2e-editor-1' }
  let editorId: number | undefined

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await login({ page, user: testUser })
    // No roles given: the user gets the default role (Editor).
    const res = await page.request.post(`${base}/api/users`, { data: editor })
    expect(res.ok()).toBe(true)
    editorId = (await res.json()).doc.id
  })

  test.afterAll(async () => {
    if (editorId) await page.request.delete(`${base}/api/users/${editorId}`)
    await cleanupTestUser()
  })

  test('administrators manage roles under Admin, with an access overview', async () => {
    await page.goto(`${base}/admin/collections/roles`)
    await expect(page.locator('#nav-roles')).toBeVisible({ timeout: 60_000 })
    const overview = page.getByRole('region', { name: 'Access overview' })
    await expect(overview).toBeVisible()
    await expect(overview.getByRole('columnheader', { name: /Administrator/ })).toBeVisible()
    await expect(overview.getByRole('columnheader', { name: /Editor/ })).toBeVisible()
    const articles = overview.getByRole('row', { name: /^Articles/ })
    await expect(articles).toContainText('Full')
    await expect(articles).toContainText('Edit')
  })

  test('a role sets one access level per collection and global', async () => {
    await page.goto(`${base}/admin/collections/roles`)
    await page.getByRole('link', { name: 'Editor', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Access levels' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('#field-levels\\.articles-edit')).toBeChecked()
    // Globals have no "Full" level.
    await expect(page.locator('#field-levels\\.footer-full')).toHaveCount(0)
    await expect(page.getByText('Users with this role.')).toBeVisible()
  })

  test('the built-in Administrator role has full access instead of levels', async () => {
    await page.goto(`${base}/admin/collections/roles`)
    await page.getByRole('link', { name: 'Administrator', exact: true }).first().click()
    await expect(page.getByLabel('Full access (administrator)')).toBeChecked({ timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Access levels' })).toHaveCount(0)
  })

  test('editors see content but not users, roles or developer tools', async ({ browser }) => {
    const editorPage = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage()
    await login({ page: editorPage, user: editor })
    // Payload's stable nav ids: #nav-<slug>.
    await expect(editorPage.locator('#nav-articles')).toBeVisible()
    await expect(editorPage.locator('#nav-users')).toHaveCount(0)
    await expect(editorPage.locator('#nav-roles')).toHaveCount(0)
    await expect(editorPage.locator('#nav-gallery')).toHaveCount(0)
    await expect(editorPage.getByRole('button', { name: /developer tools/i })).toHaveCount(0)

    const me = await (await editorPage.request.get(`${base}/api/users/me`)).json()
    expect(me.user.permissions).toMatchObject({ fullAccess: false, roles: ['Editor'] })
    const roles = await editorPage.request.post(`${base}/api/roles`, {
      data: { name: `Sneaky ${stamp}`, fullAccess: true },
    })
    expect(roles.status()).toBe(403)
    await editorPage.context().close()
  })
})
