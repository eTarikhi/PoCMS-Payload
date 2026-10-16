import fs from 'fs'
import path from 'path'

import { expect, test, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Visual baseline of the admin panel: login, dashboard, three list views and three edit views,
 * in light and dark, at the live-preview breakpoints (1440 / 768 / 375).
 *
 * Two modes:
 * - default: `toHaveScreenshot` regression checks. Baselines are platform-specific, so generate them
 *   in CI (`pnpm test:visual --update-snapshots`) rather than committing local ones.
 * - `CAPTURE_DIR=docs/ui-modernization/screenshots/<phase> pnpm test:visual`: writes plain JPEG
 *   captures for before/after documentation instead of asserting. `CAPTURE_WIDTHS=1440` limits the
 *   viewports.
 */

const CAPTURE_DIR = process.env.CAPTURE_DIR
const WIDTHS = (process.env.CAPTURE_WIDTHS || '1440,768,375').split(',').map(Number)
const THEMES = ['light', 'dark'] as const
const HEIGHTS: Record<number, number> = { 1440: 900, 768: 1024, 375: 667 }

type Target = { name: string; path: (ids: Record<string, string>) => string }

const TARGETS: Target[] = [
  { name: 'dashboard', path: () => '/admin' },
  { name: 'list-articles', path: () => '/admin/collections/articles' },
  { name: 'list-projects', path: () => '/admin/collections/projects' },
  { name: 'list-skills', path: () => '/admin/collections/skills' },
  { name: 'edit-article', path: (ids) => `/admin/collections/articles/${ids.articles}` },
  { name: 'edit-project', path: (ids) => `/admin/collections/projects/${ids.projects}` },
  { name: 'edit-skill', path: (ids) => `/admin/collections/skills/${ids.skills}` },
]

// Hide volatile UI: the Next.js dev-tools badge and toasts.
const STABILIZE_CSS = `
  nextjs-portal, [data-nextjs-toast], .payload-toast-container { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`

async function capture(page: Page, name: string) {
  await page.addStyleTag({ content: STABILIZE_CSS })
  await page.waitForLoadState('networkidle')
  if (CAPTURE_DIR) {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true })
    await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}.jpg`), type: 'jpeg', quality: 80 })
  } else {
    await expect(page).toHaveScreenshot(`${name}.png`, {
      mask: [page.locator('.cell-updatedAt'), page.locator('.cell-createdAt')],
    })
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Admin visual baseline', () => {
  let ids: Record<string, string> = {}

  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${theme} @ ${width}px`, async ({ browser }) => {
        test.setTimeout(180_000)
        const context = await browser.newContext({
          viewport: { width, height: HEIGHTS[width] ?? 900 },
          colorScheme: theme,
        })
        const page = await context.newPage()
        await context.addCookies([{ name: 'payload-theme', value: theme, url: 'http://localhost:3000' }])

        await page.goto('/admin/login')
        await capture(page, `login-${theme}-${width}`)

        await login({ page, user: testUser })

        if (Object.keys(ids).length === 0) {
          for (const slug of ['articles', 'projects', 'skills']) {
            const res = await page.request.get(`/api/${slug}?limit=1&depth=0&sort=createdAt`)
            const json = await res.json()
            ids[slug] = String(json.docs?.[0]?.id ?? '')
          }
        }

        for (const target of TARGETS) {
          await page.goto(target.path(ids))
          await capture(page, `${target.name}-${theme}-${width}`)
        }

        await context.close()
      })
    }
  }
})
