import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const TERMINAL = 'http://localhost:3000/admin/terminal'

/**
 * Terminal (CR-12 E7): development only. In CI the e2e suite runs against `pnpm start` (a
 * production build), where the page is a 404 by design, so the browser tests skip there; the
 * allow-list and the production gate are covered by tests/int/terminal.int.spec.ts and the
 * endpoint's 403 by the limited-user test below (also skipped in production).
 */
test.describe('Terminal', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('runs an allow-listed script and streams its output', async ({ page }) => {
    await login({ page, user: testUser })
    const response = await page.goto(TERMINAL)
    test.skip(response?.status() === 404, 'The terminal is disabled in a production build.')

    await expect(page.getByRole('heading', { level: 1, name: 'Terminal' })).toBeVisible()
    await expect(page.locator('#nav-terminal')).toBeVisible()

    // The console is a lazily loaded client chunk; retry until it has hydrated.
    await expect(async () => {
      await page.getByRole('button', { name: 'Run' }).click()
      await expect(page.getByTestId('terminal-output')).toContainText('All token pairs meet', {
        timeout: 60_000,
      })
    }).toPass({ timeout: 120_000 })
    await expect(page.getByRole('status')).toContainText('Finished')

    const results = await new AxeBuilder({ page })
      .include('[data-testid="terminal"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  })

  test('refuses the endpoint without a session or a known script', async ({ request, page }) => {
    await login({ page, user: testUser })
    const pageResponse = await page.goto(TERMINAL)
    test.skip(pageResponse?.status() === 404, 'The terminal is disabled in a production build.')

    // A signed-out browser gets 403 from the endpoint (Payload leaves req.user empty).
    const anonymous = await request.post('http://localhost:3000/api/dev/terminal', {
      data: { script: 'contrast' },
    })
    expect(anonymous.status()).toBe(403)

    // The slug is validated against the allow-list before anything runs.
    const cookies = await page.context().cookies()
    const token = cookies.find((cookie) => cookie.name === 'payload-token')?.value
    const unknown = await request.post('http://localhost:3000/api/dev/terminal', {
      headers: { Cookie: `payload-token=${token}` },
      data: { script: 'cat /etc/passwd' },
    })
    expect(unknown.status()).toBe(400)
    expect(await unknown.text()).toContain('Unknown script')
  })
})
