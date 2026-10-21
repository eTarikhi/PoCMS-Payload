import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

async function open(page: Page, path: string) {
  await page.goto(`${base}${path}`)
  await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
}

/**
 * Nothing to scroll sideways. Measured against the visual viewport: with mobile emulation, content
 * wider than the screen widens the layout viewport (innerWidth) along with it, so comparing the
 * page with innerWidth never fails.
 *
 * On failure the message names the page and the widest elements that stick out, so the CI
 * annotation says what to fix (the report itself is an artifact that is not always reachable).
 */
const overflowReport = (page: Page) =>
  page.evaluate(() => {
    const viewport = Math.round(window.visualViewport!.width)
    const scrollWidth = document.documentElement.scrollWidth
    if (scrollWidth <= viewport) return null
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > viewport + 1 || rect.width > viewport + 1)
      .sort((a, b) => b.rect.right - a.rect.right)
      .slice(0, 6)
      .map(({ element, rect }) => {
        const classes = String(element.className).split(' ').filter(Boolean).slice(0, 3).join('.')
        const id = element.id ? `#${element.id}` : ''
        const slot = element.dataset.slot ? `[data-slot=${element.dataset.slot}]` : ''
        return `<${element.tagName.toLowerCase()}${id}${slot}> ${classes} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`
      })
    return { page: location.pathname, viewport, scrollWidth, offenders }
  })

const noSidewaysScroll = (page: Page) => expect.poll(() => overflowReport(page)).toBeNull()

async function withinViewport(page: Page, selector: string) {
  const width = page.viewportSize()!.width
  const box = (await page.locator(selector).first().boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
}

/** Phone layout (Chrome mobile emulation, 360×740): nothing off screen, nothing to scroll sideways. */
test.describe('Responsive admin on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('pages fit the screen and the header keeps its actions', async ({ page }) => {
    await login({ page, user: testUser })
    for (const path of [
      '/admin',
      '/admin/collections/articles',
      '/admin/collections/skills',
      '/admin/account',
      '/admin/gallery',
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
    // Certificates: the ordered collections are all orderable (P5.5) and keep Payload's own
    // table, so the TanStack list this test is about lives on an unordered collection.
    await open(page, '/admin/collections/certificates')
    const card = page.locator('[data-slot="table-body"] [data-slot="table-row"]').first()
    await expect(card).toHaveCSS('display', 'grid')
    // A value line shows its column name; the title cell doesn't.
    const issuer = card.locator('[data-label="Issuer"]')
    expect(await issuer.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Issuer"')
    expect(
      await card
        .locator('[data-primary]')
        .evaluate((el) => getComputedStyle(el, '::before').content),
    ).toBe('none')
    // Rows keep their table semantics, and sorting stays available as chips.
    await expect(page.getByRole('row').nth(1)).toBeVisible()
    await expect(
      page.locator('[data-slot="table-head"]').filter({ hasText: 'Title' }),
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
    // The checkbox only selects; a tap anywhere else on the card opens the document.
    await card.getByRole('checkbox').tap()
    await expect(card).toHaveAttribute('data-state', 'selected')
    await card.getByRole('checkbox').tap()
    await expect(card).not.toHaveAttribute('data-state', 'selected')
    const value = (await issuer.boundingBox())!
    await page.touchscreen.tap(value.x + value.width - 12, value.y + value.height / 2)
    await expect(page).toHaveURL(/\/admin\/collections\/certificates\/\d+/)
  })

  test('form fields use 16px text, so phones do not zoom into them', async ({ page }) => {
    await login({ page, user: testUser })
    await open(page, '/admin/collections/articles/create')
    await expect(page.locator('#field-title')).toHaveCSS('font-size', '16px')
    await expect(page.locator('#field-excerpt')).toHaveCSS('font-size', '16px')
    await open(page, '/admin/collections/articles')
    await expect(page.locator('.search-filter__input')).toHaveCSS('font-size', '16px')
  })

  test('the command menu opens at the top, without keyboard hints', async ({ page }) => {
    await login({ page, user: testUser })
    await open(page, '/admin')
    await page.getByTestId('command-menu-trigger').tap()
    const menu = page.getByTestId('command-menu')
    await expect(menu).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCSS('font-size', '16px')
    expect((await menu.boundingBox())!.y).toBeLessThan(16)
    await expect(page.getByTestId('command-menu-hints')).toBeHidden()
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

/** Small tablet (iPad mini portrait, 768px): Payload's phone layout starts here too. */
test.describe('Responsive admin on a small tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true })

  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('the header keeps its actions and the count cards share a row', async ({ page }) => {
    await login({ page, user: testUser })
    for (const path of ['/admin/collections/articles', '/admin/account', '/admin']) {
      await open(page, path)
      await noSidewaysScroll(page)
      await withinViewport(page, '[data-testid="account-menu"] summary')
    }
    const cards = page.locator('[data-stat-widget]')
    await expect(cards).toHaveCount(4)
    const first = (await cards.nth(0).boundingBox())!
    const last = (await cards.nth(3).boundingBox())!
    expect(Math.abs(first.y - last.y)).toBeLessThan(2)
    // The browser toolbar follows the admin's theme.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      /^#[0-9a-f]{6}$/,
    )
  })
})
