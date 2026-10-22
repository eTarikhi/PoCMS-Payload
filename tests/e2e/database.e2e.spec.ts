import AxeBuilder from '@axe-core/playwright'
import { getPayload } from 'payload'
import { expect, test } from '@playwright/test'

import config from '../../src/payload.config.js'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const DATABASE = 'http://localhost:3000/admin/database'
const limitedUser = { email: 'database-limited@example.test', password: 'test' }
const roleName = 'Database page reader'

/**
 * Database page: the tables, the backup links, the read-only browser, maintenance and the health
 * checks for users with the manageDatabase capability; a 404 for a signed-in user without it, and a
 * 403 from the endpoints.
 *
 * Nothing here restores a file or changes data: the destructive operations are covered by
 * `tests/int/database-tools.int.spec.ts` against the database, where a failure cannot leave the
 * development database in a half-restored state.
 */
test.describe('Database page', () => {
  test.beforeAll(async () => {
    await seedTestUser()
    const payload = await getPayload({ config })
    const role =
      (
        await payload.find({
          collection: 'roles',
          where: { name: { equals: roleName } },
          limit: 1,
        })
      ).docs[0] ??
      (await payload.create({
        collection: 'roles',
        data: {
          name: roleName,
          description: 'Reads content, no admin tools.',
          levels: { articles: 'read', projects: 'read' },
        },
      }))
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: limitedUser.email } },
      limit: 1,
    })
    if (docs[0]) {
      await payload.update({
        collection: 'users',
        id: docs[0].id,
        data: { password: limitedUser.password, roles: [role.id] },
      })
    } else {
      await payload.create({
        collection: 'users',
        data: { ...limitedUser, roles: [role.id] },
      })
    }
  })

  test.afterAll(async () => {
    const payload = await getPayload({ config })
    await payload.delete({
      collection: 'users',
      where: { email: { equals: limitedUser.email } },
    })
    await payload.delete({ collection: 'roles', where: { name: { equals: roleName } } })
    await cleanupTestUser()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`shows the tables and the tools without serious axe violations (${theme})`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: 'payload-theme', value: theme, url: 'http://localhost:3000' },
      ])
      await login({ page, user: testUser })
      await page.goto(DATABASE)

      await expect(page.getByRole('heading', { level: 1, name: 'Database' })).toBeVisible()
      // The sidebar links to the page for users who may open it.
      await expect(page.locator('#nav-database')).toBeVisible()
      const view = page.getByTestId('database')

      for (const title of [
        'Connection',
        'Backup',
        'Tables',
        'Indexes',
        'Maintenance',
        'Health and repair',
        'Neon branches and point-in-time restore',
        'Restore from a file',
        'What this page cannot do',
      ]) {
        await expect(view.getByRole('heading', { level: 2, name: title })).toBeVisible()
      }

      // The backup links point at the endpoint, which is what actually downloads the file.
      await expect(view.getByRole('link', { name: 'Download SQL' })).toHaveAttribute(
        'href',
        /\/api\/database\/backup\?format=sql$/,
      )
      await expect(view.getByRole('link', { name: 'Schema only' })).toHaveAttribute(
        'href',
        /schemaOnly=1$/,
      )
      await expect(view).toContainText('users')
      await expect(view.getByRole('button', { name: 'Vacuum + analyze' })).toBeEnabled()
      await expect(view).toContainText('Migration history')
      await expect(view).toContainText('ID sequences')

      // Never a connection string or a password.
      await expect(view).not.toContainText(process.env.POSTGRES_URL ?? '::')
      await expect(view).not.toContainText(process.env.PAYLOAD_SECRET ?? '::')

      const results = await new AxeBuilder({ page })
        .include('[data-testid="database"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([])

      // Opening a table shows its columns, indexes and a page of rows.
      await page.goto(`${DATABASE}?table=articles`)
      await expect(page.getByRole('heading', { level: 3, name: 'Columns' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: 'Indexes' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: /^Rows/ })).toBeVisible()
      await expect(view.getByText('Schema (DDL)')).toBeVisible()
      await expect(view.getByText('Query plan')).toBeVisible()
      await expect(page.getByText('public.articles')).toBeVisible()
      await expect(page.getByRole('link', { name: 'This table only' })).toHaveAttribute(
        'href',
        /tables=articles$/,
      )

      // The backup itself is a real download with attachment headers.
      const backup = await page.request.get(
        'http://localhost:3000/api/database/backup?format=sql&tables=articles',
      )
      expect(backup.status()).toBe(200)
      expect(backup.headers()['content-disposition']).toContain('attachment; filename=')
      const sql = await backup.text()
      expect(sql).toContain('CREATE TABLE "public"."articles"')
      expect(sql).toContain('COMMIT;')

      // The table's schema and its query plan come from the same endpoint.
      const ddl = await page.request.get(
        'http://localhost:3000/api/database/table?table=articles&format=ddl',
      )
      expect(ddl.status()).toBe(200)
      expect(ddl.headers()['content-type']).toContain('application/sql')
      expect(await ddl.text()).toContain('create table "public"."articles"')

      const planResponse = await page.request.get(
        'http://localhost:3000/api/database/table?table=articles&format=plan&limit=25',
      )
      expect(planResponse.status()).toBe(200)
      const plan = (await planResponse.json()).plan
      expect(plan.sql).toContain('limit 25')
      expect(plan.nodes[0].type).toBe('Limit')
      expect(plan.totalCost).toBeGreaterThan(0)
    })
  }

  test('is a 404, and the endpoints 403, for a user without the capability', async ({ page }) => {
    await login({ page, user: limitedUser })
    const response = await page.goto(DATABASE)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Database' })).toHaveCount(0)
    await expect(page.locator('#nav-database')).toHaveCount(0)

    const backup = await page.request.get('http://localhost:3000/api/database/backup?format=sql')
    expect(backup.status()).toBe(403)
    const maintenance = await page.request.post('http://localhost:3000/api/database/maintenance', {
      data: { action: 'analyze' },
    })
    expect(maintenance.status()).toBe(403)
  })

  test('refuses a restore without the typed confirmation', async ({ page }) => {
    await login({ page, user: testUser })
    const response = await page.request.post('http://localhost:3000/api/database/restore', {
      data: { sql: 'select 1;' },
    })
    // The test database holds content, so the server refuses before running anything.
    expect(response.status()).toBe(409)
    expect((await response.json()).error).toContain('already holds content')
  })
})
