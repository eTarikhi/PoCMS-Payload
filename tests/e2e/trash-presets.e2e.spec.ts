import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/** Trash (soft delete with restore) and saved list views (query presets), in the admin UI. */
test.describe('Trash and saved views', () => {
  let page: Page
  const stamp = Date.now()
  const label = `E2E trash ${stamp}`
  let skillId: number

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await login({ page, user: testUser })
    const res = await page.request.post(`${base}/api/skills`, {
      data: { label, value: 40, group: 'backend', color: 'info' },
    })
    expect(res.ok()).toBe(true)
    skillId = (await res.json()).doc.id
  })

  test.afterAll(async () => {
    await page.request.delete(`${base}/api/skills/${skillId}?trash=true`)
    await cleanupTestUser()
  })

  async function openSkills(path = '/admin/collections/skills') {
    await page.goto(`${base}${path}`)
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
  }

  test('deleting moves a document to the trash, where it can be restored', async () => {
    await openSkills()
    await page
      .getByRole('row', { name: new RegExp(label) })
      .getByRole('checkbox')
      .click()
    await page
      .locator('.list-selection')
      .getByRole('button', { name: /^Delete$/ })
      .click()
    await expect(page.getByText(/move 1 Skill to the trash/)).toBeVisible()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('1 Skill moved to trash.')).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(label) })).toHaveCount(0)

    // The summary links to the trash; the trash view explains what can be done there.
    await page
      .getByTestId('list-summary')
      .getByRole('link', { name: /in the trash/ })
      .click()
    await expect(page).toHaveURL(/\/collections\/skills\/trash/)
    await expect(page.getByTestId('list-summary')).toContainText('in the trash')

    await page
      .getByRole('row', { name: new RegExp(label) })
      .getByRole('checkbox')
      .click()
    await page
      .locator('.list-selection')
      .getByRole('button', { name: /Restore/ })
      .click()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText(/Restored 1 Skill/)).toBeVisible()

    await openSkills()
    await expect(page.getByRole('row', { name: new RegExp(label) })).toHaveCount(1)
  })

  test('a saved view filters the list', async () => {
    const created = await page.request.post(`${base}/api/payload-query-presets`, {
      data: {
        title: `Only ${stamp}`,
        relatedCollection: 'skills',
        where: { and: [{ label: { like: String(stamp) } }] },
        access: {
          read: { constraint: 'onlyMe' },
          update: { constraint: 'onlyMe' },
          delete: { constraint: 'onlyMe' },
        },
      },
    })
    expect(created.ok()).toBe(true)
    const presetId = (await created.json()).doc.id

    try {
      await openSkills()
      await page.getByRole('button', { name: /Select Saved view/ }).click()
      await page.getByText(`Only ${stamp}`).click()
      await expect(page).toHaveURL(/preset=/)
      await expect(page.locator('table tbody tr')).toHaveCount(1)
      await expect(page.getByRole('row', { name: new RegExp(label) })).toHaveCount(1)
    } finally {
      await page.request.delete(`${base}/api/payload-query-presets/${presetId}`)
    }
  })
})
