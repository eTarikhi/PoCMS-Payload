import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

const base = 'http://localhost:3000'

/** Command menu (Ctrl+K): navigation, document search, actions, recent documents, accessibility. */
test.describe('Command menu', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  /** Opens the menu with the keyboard once the page has hydrated (the listener is client-side). */
  async function openMenu(path = '/admin') {
    await page.goto(`${base}${path}`)
    await expect(page.locator('.nav.nav--nav-hydrated')).toHaveCount(1, { timeout: 60_000 })
    const menu = page.getByTestId('command-menu')
    await expect(async () => {
      await page.keyboard.press('Control+k')
      await expect(menu).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 30_000 })
    return page.getByRole('combobox', { name: 'Search pages, documents and actions' })
  }

  test('jumps to a collection', async () => {
    const input = await openMenu()
    await input.fill('proj')
    await expect(page.getByRole('option', { name: 'Projects' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/collections\/projects(\?|$)/)
    await expect(page.getByTestId('command-menu')).toBeHidden()
  })

  test('searches document titles across collections', async () => {
    const input = await openMenu()
    await input.fill('laravel packages')
    const hit = page.getByRole('option', { name: /Most Used Laravel Packages/ })
    await expect(hit).toBeVisible({ timeout: 15_000 })
    await expect(hit).toContainText('Article')
    await hit.click()
    await expect(page).toHaveURL(/\/admin\/collections\/articles\/\d+(\?|$)/)
    await expect(page.locator('#field-title')).toHaveValue(/Laravel Packages/)
  })

  test('runs actions and remembers recent documents', async () => {
    // The document we just opened is listed under Recent.
    await page.waitForTimeout(2_000)
    let input = await openMenu()
    const recent = page.getByRole('group', { name: 'Recent' })
    await expect(recent.getByRole('option', { name: /Most Used Laravel Packages/ })).toBeVisible()

    const html = page.locator('html')
    const before = (await html.getAttribute('data-theme')) ?? 'light'
    await input.fill('theme')
    await page.keyboard.press('Enter')
    await expect(html).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark')

    input = await openMenu()
    await input.fill('theme')
    await page.keyboard.press('Enter')
    await expect(html).toHaveAttribute('data-theme', before)
  })

  test('has no serious accessibility violations', async () => {
    const input = await openMenu()
    await input.fill('a')
    const results = await new AxeBuilder({ page })
      .include('[data-testid="command-menu"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-menu')).toBeHidden()
  })
})
