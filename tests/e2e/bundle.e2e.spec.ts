import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Admin bundle budget (roadmap QA): the JS and CSS an admin page ships must stay inside the budget
 * set in `docs/ui-modernization/perf-budget.md` (+150 kB JS / +40 kB CSS over the P0 baseline of
 * 645.2 / 45.2 kB compressed, i.e. 795 / 85 kB).
 *
 * It measures a production build, so it asserts only when `BUNDLE_BUDGET=1` is set — CI sets it for
 * `pnpm test:e2e`, which runs against `next build` + `next start`. Locally:
 *
 *   pnpm build && pnpm start             # in one terminal
 *   BUNDLE_BUDGET=1 pnpm exec playwright test e2e/bundle.e2e.spec.ts
 *
 * `scripts/measure-admin-bundle.mjs` prints the same numbers as a table for the report.
 */
const enabled = process.env.BUNDLE_BUDGET === '1'

const BUDGET = {
  /** Compressed JS on /admin (gzip over the wire, `encodedBodySize`). */
  jsKb: 795,
  /** Compressed CSS on /admin. */
  cssKb: 85,
  /** Extra JS a single page may load on top of /admin: the gallery's element demos and icon picker. */
  pageAllowanceKb: 120,
}

const ROUTES = [
  '/admin',
  '/admin/collections/articles',
  '/admin/collections/articles/create',
  '/admin/collections/skills',
  '/admin/gallery',
  '/admin/jobs',
  '/admin/system',
  '/admin/database',
]

type Totals = { js: number; css: number }

async function measure(page: import('@playwright/test').Page, route: string): Promise<Totals> {
  await page.goto(route, { waitUntil: 'networkidle' })
  return page.evaluate(() => {
    const totals = { js: 0, css: 0 }
    // `as PerformanceResourceTiming[]`: lib.dom types the generic call as PerformanceEntry[].
    for (const entry of performance.getEntriesByType(
      'resource',
    ) as PerformanceResourceTiming[]) {
      const path = entry.name.split('?')[0]
      const type = path.endsWith('.css')
        ? 'css'
        : path.endsWith('.js') || entry.initiatorType === 'script'
          ? 'js'
          : null
      if (!type) continue
      totals[type] += entry.encodedBodySize
    }
    return totals
  })
}

test.describe('Admin bundle budget', () => {
  test.skip(!enabled, 'Measures a production build: run with BUNDLE_BUDGET=1')

  test('every admin page stays inside the JS and CSS budget', async ({ page }) => {
    test.setTimeout(180_000)
    await seedTestUser()
    await login({ page, user: testUser })

    const measured: Record<string, Totals> = {}
    for (const route of ROUTES) measured[route] = await measure(page, route)

    const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10
    const dashboard = measured['/admin']

    // Report every page in the failure message, so the annotation shows the whole picture.
    const table = ROUTES.map(
      (route) => `${route}: ${kb(measured[route].js)} kB JS, ${kb(measured[route].css)} kB CSS`,
    ).join('\n')

    expect(kb(dashboard.js), `Dashboard JS over budget\n${table}`).toBeLessThanOrEqual(BUDGET.jsKb)
    expect(kb(dashboard.css), `Dashboard CSS over budget\n${table}`).toBeLessThanOrEqual(
      BUDGET.cssKb,
    )
    for (const route of ROUTES) {
      expect(
        kb(measured[route].js) - kb(dashboard.js),
        `${route} loads more than ${BUDGET.pageAllowanceKb} kB over the dashboard\n${table}`,
      ).toBeLessThanOrEqual(BUDGET.pageAllowanceKb)
    }
    // The stylesheet is shared; a page that ships its own CSS is a bug in this admin.
    for (const route of ROUTES) {
      expect(kb(measured[route].css), `${route} CSS differs from the dashboard\n${table}`).toBe(
        kb(dashboard.css),
      )
    }
  })
})
