import { expect, request as playwrightRequest, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Drag-and-drop ordering (P5.5 pilot on Skills).
 *
 * Payload's orderable list renders a drag handle per row and writes the new fractional index when
 * the row is dropped. The test creates two documents of its own (so the seeded order stays as the
 * frontend expects), drags the second above the first with real pointer events — dnd-kit listens to
 * pointer moves, not to HTML5 drag events — and checks both the list and the API order.
 */
const base = 'http://localhost:3000'
const stamp = Date.now().toString(36)
const labelA = `Order drag A ${stamp}`
const labelB = `Order drag B ${stamp}`

test.describe('Orderable skills', () => {
  let idA = 0
  let idB = 0

  test.beforeAll(async () => {
    await seedTestUser()
    const api = await playwrightRequest.newContext({ baseURL: base })
    await api.post('/api/users/login', {
      data: { email: testUser.email, password: testUser.password },
    })
    const create = async (label: string) => {
      const response = await api.post('/api/skills', {
        data: { label, group: 'backend', value: 10, color: 'info' },
      })
      expect(response.ok()).toBe(true)
      return (await response.json()).doc.id as number
    }
    idA = await create(labelA)
    idB = await create(labelB)
    await api.dispose()
  })

  test.afterAll(async () => {
    const api = await playwrightRequest.newContext({ baseURL: base })
    await api.post('/api/users/login', {
      data: { email: testUser.email, password: testUser.password },
    })
    for (const id of [idA, idB]) if (id) await api.delete(`/api/skills/${id}`)
    await api.dispose()
    await cleanupTestUser()
  })

  test('reorders a row by dragging its handle', async ({ page }) => {
    test.setTimeout(120_000)
    await login({ page, user: testUser })

    // The orderable list sorts by the fractional index, not by the old numeric field.
    await page.goto(`${base}/admin/collections/skills?search=${encodeURIComponent('Order drag')}`)
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(page).toHaveURL(/sort=_order/)
    await expect(rows.nth(0)).toContainText(labelA)
    await expect(rows.nth(1)).toContainText(labelB)

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
    await expect(rows.nth(0)).toContainText(labelB, { timeout: 15_000 })
    await expect(rows.nth(1)).toContainText(labelA)

    const api = await playwrightRequest.newContext({ baseURL: base })
    const ordered = await (
      await api.get(`/api/skills?sort=_order&limit=100&depth=0&where[label][contains]=Order+drag`)
    ).json()
    expect(ordered.docs.map((doc: { id: number }) => doc.id)).toEqual([idB, idA])
    await api.dispose()
  })
})
