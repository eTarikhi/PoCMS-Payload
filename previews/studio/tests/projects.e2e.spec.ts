import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173'

test.describe('Studio projects', () => {
  test('opens the archive from the homepage and searches by project title', async ({ page }) => {
    await page.goto(baseURL)
    await page.getByRole('link', { name: 'Browse project archive' }).click()
    await expect(page).toHaveURL(/\/projects$/)
    const title = await page
      .locator('.studio-project h3 a')
      .first()
      .evaluate((link) => link.firstChild?.textContent || '')
    const search = page.getByRole('searchbox', { name: 'Search projects' })
    await search.fill(title.trim())
    await expect(page.locator('.studio-project')).toHaveCount(1)
    await search.fill('missing-project-120498')
    await expect(page.getByRole('status')).toHaveText('0 projects shown')
    await expect(page.getByText(/No projects match this search/)).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search).toBeFocused()
    await expect(page.locator('.studio-project').first()).toBeVisible()
  })

  test('contains focus in the image viewer and restores it when Escape is pressed', async ({
    page,
  }) => {
    await page.goto(`${baseURL}/projects`)
    const trigger = page.getByRole('button', { name: /^Preview / }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close project preview' })).toBeFocused()
    await expect(dialog.getByRole('img')).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  test('closes the viewer with its visible close control', async ({ page }) => {
    await page.goto(`${baseURL}/projects`)
    await page
      .getByRole('button', { name: /^Preview / })
      .first()
      .click()
    await page.getByRole('button', { name: 'Close project preview' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('keeps the viewer open on panel clicks, closes on backdrop clicks, and can reopen', async ({
    page,
  }) => {
    await page.goto(`${baseURL}/projects`)
    const trigger = page.getByRole('button', { name: /^Preview / }).first()
    await trigger.click()
    await page.getByRole('dialog').getByRole('heading').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.mouse.click(2, 2)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('allows tall screenshots to be inspected without overflowing the dialog', async ({
    page,
  }) => {
    await page.goto(`${baseURL}/projects`)
    await page
      .getByRole('button', { name: /^Preview / })
      .first()
      .click()
    await page.getByRole('button', { name: 'Inspect at full width' }).click()
    const screenshot = page.getByRole('region', { name: 'Project screenshot' })
    await expect(screenshot).toHaveAttribute('tabindex', '0')
    expect(
      await screenshot.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true)
    await page.getByRole('button', { name: 'Fit entire image' }).click()
    await expect(page.getByRole('button', { name: 'Inspect at full width' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('is accessible on mobile, including the open viewer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${baseURL}/projects`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const archiveScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(archiveScan.violations).toEqual([])
    await page
      .getByRole('button', { name: /^Preview / })
      .first()
      .click()
    const viewerScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(viewerScan.violations).toEqual([])
    const bounds = await page.getByRole('dialog').boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  })
})
