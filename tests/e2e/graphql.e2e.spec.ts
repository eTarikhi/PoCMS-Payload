import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/** The GraphQL document tab next to Payload's API tab. */
test.describe('GraphQL document tab', () => {
  let page: Page
  let articleId: number

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await login({ page, user: testUser })
    const res = await page.request.get(`${base}/api/articles?limit=1&depth=0`)
    articleId = (await res.json()).docs[0].id
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('runs the document query with the API tab options', async () => {
    await page.goto(`${base}/admin/collections/articles/${articleId}`)
    await page.getByRole('link', { name: 'GraphQL', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/articles/${articleId}/graphql$`))

    const query = page.getByLabel('GraphQL query')
    await expect(query).toContainText('Article(id: $id', { timeout: 60_000 })
    const response = page.getByLabel('GraphQL response')
    await expect(response).toContainText(`"id": ${articleId}`)
    await expect(page.getByRole('status').filter({ hasText: /^200/ })).toBeVisible()
    const results = await new AxeBuilder({ page })
      .include('.graphql-inspector')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])

    // Depth 0: relationships select only their id.
    const depth = page.locator('#field-depth')
    await depth.fill('0')
    await expect(query).toContainText(/image \{\s+id\s+\}/)

    // Signed out, the same query still answers (articles are public).
    await page.getByLabel('Authenticated').uncheck()
    await expect(response).toContainText(`"id": ${articleId}`)
  })

  test('globals have the tab too', async () => {
    await page.goto(`${base}/admin/globals/footer/graphql`)
    await expect(page.getByLabel('GraphQL query')).toContainText('Footer {', { timeout: 60_000 })
    await expect(page.getByLabel('GraphQL response')).toContainText('"Footer"')
  })
})
