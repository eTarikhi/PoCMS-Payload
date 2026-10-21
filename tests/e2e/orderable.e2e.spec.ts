import { expect, request as playwrightRequest, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Drag-and-drop ordering (P5.5).
 *
 * Payload's orderable list renders a drag handle per row and writes the new fractional index when
 * the row is dropped. Skills was the pilot; Educations, Experiences, Projects and Services were
 * converted with the same setting and a schema migration.
 *
 * The drag tests create two documents of their own (so the seeded order stays as the frontend
 * expects), drag the second above the first with real pointer events — dnd-kit listens to pointer
 * moves, not to HTML5 drag events — and check both the list and the API order. The list test then
 * covers the other collections cheaply: handles present, no editable order field.
 */
const base = 'http://localhost:3000'
const stamp = Date.now().toString(36)

/** Two documents in, drag the second to the top. Only the create/delete payload differs. */
const CASES = [
  {
    name: 'skills',
    collection: 'skills',
    titleField: 'label',
    titles: [`Order drag A ${stamp}`, `Order drag B ${stamp}`],
    data: (title: string) => ({ label: title, group: 'backend', value: 10, color: 'info' }),
    containsFilter: 'where[label][contains]=Order+drag',
  },
  {
    name: 'experiences',
    collection: 'experiences',
    titleField: 'title',
    titles: [`Order drag A ${stamp}`, `Order drag B ${stamp}`],
    data: (title: string) => ({ title, company: 'Order drag Co', date: '2020 - Present' }),
    containsFilter: 'where[title][contains]=Order+drag',
  },
] as const

for (const current of CASES) {
  test.describe(`Orderable ${current.name}`, () => {
    let idA = 0
    let idB = 0

    test.beforeAll(async () => {
      await seedTestUser()
      const api = await playwrightRequest.newContext({ baseURL: base })
      await api.post('/api/users/login', {
        data: { email: testUser.email, password: testUser.password },
      })
      const create = async (title: string) => {
        const response = await api.post(`/api/${current.collection}`, {
          data: current.data(title),
        })
        expect(response.ok()).toBe(true)
        return (await response.json()).doc.id as number
      }
      idA = await create(current.titles[0])
      idB = await create(current.titles[1])
      await api.dispose()
    })

    test.afterAll(async () => {
      const api = await playwrightRequest.newContext({ baseURL: base })
      await api.post('/api/users/login', {
        data: { email: testUser.email, password: testUser.password },
      })
      for (const id of [idA, idB]) if (id) await api.delete(`/api/${current.collection}/${id}`)
      await api.dispose()
      await cleanupTestUser()
    })

    test('reorders a row by dragging its handle', async ({ page }) => {
      test.setTimeout(120_000)
      await login({ page, user: testUser })

      // The orderable list sorts by the fractional index, not by the old numeric field.
      await page.goto(
        `${base}/admin/collections/${current.collection}?search=${encodeURIComponent('Order drag')}`,
      )
      const rows = page.locator('tbody tr')
      await expect(rows).toHaveCount(2)
      await expect(page).toHaveURL(/sort=_order/)
      await expect(rows.nth(0)).toContainText(current.titles[0])
      await expect(rows.nth(1)).toContainText(current.titles[1])

      // dnd-kit needs a press, a few intermediate moves (to pass its activation threshold) and a
      // release over the target row, so this is a manual pointer sequence rather than `dragTo`.
      // The handle is a div with role="button" (Payload's sortable row), not a <button>.
      const handle = rows.nth(1).locator('.sort-row').first()
      const from = (await handle.boundingBox())!
      const to = (await rows.nth(0).boundingBox())!
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 })
      await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 15 })
      await page.mouse.up()

      // The list redraws in the new order, and the site's API agrees.
      await expect(rows.nth(0)).toContainText(current.titles[1], { timeout: 15_000 })
      await expect(rows.nth(1)).toContainText(current.titles[0])

      const api = await playwrightRequest.newContext({ baseURL: base })
      const ordered = await (
        await api.get(
          `/api/${current.collection}?sort=_order&limit=100&depth=0&${current.containsFilter}`,
        )
      ).json()
      expect(ordered.docs.map((doc: { id: number }) => doc.id)).toEqual([idB, idA])
      await api.dispose()
    })
  })
}

/**
 * The other converted collections need no second drag: Payload's ordering machinery is the same,
 * and the int suite already proves the schema and the append hook. What can regress in the admin is
 * the list itself (no handle, or the old editable order column back), so one pass checks all five.
 */
test.describe('Every orderable list', () => {
  const LISTS = ['skills', 'educations', 'experiences', 'projects', 'services']

  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('renders drag handles and no editable order field', async ({ page }) => {
    test.setTimeout(180_000)
    await login({ page, user: testUser })

    for (const collection of LISTS) {
      await test.step(collection, async () => {
        await page.goto(`${base}/admin/collections/${collection}`)
        const rows = page.locator('tbody tr')
        await expect(rows.first()).toBeVisible()

        // Payload renders the handle column after hydration: one dnd-kit sortable per row.
        const handles = page.locator('tbody tr .sort-row')
        await expect(handles.first()).toBeVisible({ timeout: 15_000 })
        await expect(handles).toHaveCount(await rows.count())

        // The manual `order` number is gone from the table: its cells were `cell-order` and it had
        // an editable sidebar field. `_order` only exists as the hidden sort key of the handle.
        await expect(page.locator('tbody td.cell-order')).toHaveCount(0)
        await expect(page.locator('tbody td.cell-_order')).toHaveCount(0)
      })
    }
  })
})
