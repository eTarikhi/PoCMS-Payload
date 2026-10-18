import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/** Phone layout (Chrome mobile emulation, 360×740): nothing off screen, nothing to scroll sideways. */
test.describe('Responsive admin on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  async function open(page: Page, path: string) {
    await page.goto(`${base}${path}`)
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
  }

  const noSidewaysScroll = (page: Page) =>
    expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(0)

  async function withinViewport(page: Page, selector: string) {
    const box = (await page.locator(selector).first().boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  }

  test('pages fit the screen and the header keeps its actions', async ({ page }) => {
    await login({ page, user: testUser })
    for (const path of [
      '/admin',
      '/admin/collections/articles',
      '/admin/collections/skills',
      '/admin/account',
    ]) {
      await open(page, path)
      await noSidewaysScroll(page)
      await withinViewport(page, '[data-testid="account-menu"] summary')
      await withinViewport(page, '.app-header__mobile-nav-toggler')
    }
  })

  test('dashboard count cards sit two per row', async ({ page }) => {
    await login({ page, user: testUser })
    await open(page, '/admin')
    const cards = page.locator('[data-stat-widget]')
    await expect(cards).toHaveCount(4)
    const [first, second] = [
      (await cards.nth(0).boundingBox())!,
      (await cards.nth(1).boundingBox())!,
    ]
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
    expect(second.x).toBeGreaterThan(first.x)
  })

  test('lists show each row as a card with labelled values', async ({ page }) => {
    await login({ page, user: testUser })
    await open(page, '/admin/collections/skills')
    const card = page.locator('[data-slot="table-body"] [data-slot="table-row"]').first()
    await expect(card).toHaveCSS('display', 'grid')
    // A value line shows its column name; the title cell doesn't.
    const group = card.locator('[data-label="Group"]')
    expect(await group.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Group"')
    expect(
      await card
        .locator('[data-primary]')
        .evaluate((el) => getComputedStyle(el, '::before').content),
    ).toBe('none')
    // Rows keep their table semantics, and sorting stays available as chips.
    await expect(page.getByRole('row').nth(1)).toBeVisible()
    await expect(
      page.locator('[data-slot="table-head"]').filter({ hasText: 'Label' }),
    ).toBeVisible()
    await noSidewaysScroll(page)
    // Row checkboxes are named after their row, and the sort arrows are big enough to tap.
    const title = (await card.locator('[data-primary]').innerText()).trim()
    await expect(card.getByRole('checkbox', { name: `Select ${title}` })).toBeAttached()
    const results = await new AxeBuilder({ page })
      .include('[data-slot="data-table"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  })

  test('menus and the bulk actions bar stay on screen', async ({ page }) => {
    await login({ page, user: testUser })
    await open(page, '/admin/collections/skills')

    await page.getByTestId('dev-tools').locator('summary').tap()
    await withinViewport(page, '[data-testid="dev-tools"] nav')
    await page.getByTestId('dev-tools').locator('summary').tap()

    await page.getByTestId('account-menu').locator('summary').tap()
    await withinViewport(page, '[data-testid="account-menu"] nav')
    await page.getByTestId('account-menu').locator('summary').tap()

    await page.getByRole('row').nth(1).getByRole('checkbox').tap()
    const bar = page.locator('.collection-list__list-selection')
    await expect(bar).toBeVisible()
    await withinViewport(page, '.collection-list__list-selection')
    const remove = bar.getByRole('button', { name: /^Delete$/ })
    await expect(remove).toBeVisible()
    const box = (await remove.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  })
})
