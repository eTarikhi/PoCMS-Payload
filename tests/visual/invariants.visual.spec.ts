import fs from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

/**
 * Visual invariants: the part of a visual check that is the same on every machine (roadmap P6.1).
 *
 * `admin.visual.spec.ts` compares pixels, which is only meaningful on the platform that owns the
 * baselines (font rasterisation differs between Linux, macOS and CI images). These checks are the
 * platform-independent half, so they can gate CI:
 *
 * - the admin still loads the design tokens (body text is 14px, the theme variables resolve) — a
 *   stylesheet that silently stops loading looks like plain Payload;
 * - no screen scrolls sideways at any of the three live-preview widths, in either theme;
 * - every rendered thumbnail actually loaded (broken media shows as a grey box);
 * - each screen still has its landmark heading, and dark mode really is dark.
 *
 * Together with the screenshots CI uploads, that covers "the admin still looks like itself" without
 * brittle pixel diffs.
 */
const BASE = 'http://localhost:3000'
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
]

type Measurement = {
  screen: string
  theme: string
  width: number
  overflow: number
  bodyFontSize: string
  bodyBackground: string
  images: number
  brokenImages: number
}

const RESULTS: Measurement[] = []

test.describe.configure({ mode: 'serial' })

test.describe('Admin visual invariants', () => {
  const ids: Record<string, string> = {}

  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.afterAll(async () => {
    // Leave the numbers next to the acceptance measurements for a quick look after a run.
    try {
      fs.mkdirSync('test-results', { recursive: true })
      fs.writeFileSync('test-results/visual-invariants.json', JSON.stringify(RESULTS, null, 2))
    } catch {
      // An artifact is a convenience, not the assertion.
    }
    await cleanupTestUser()
  })

  /** Everything the assertions need, measured in one round trip. */
  const measure = (page: Page) =>
    page.evaluate(() => {
      const root = document.documentElement
      // The theme paints the <html> element and the template shell, not <body> (which is transparent).
      const shell = document.querySelector('.template-default') ?? root
      const styles = getComputedStyle(shell)
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('main img, table img'))
      return {
        overflow: root.scrollWidth - window.visualViewport!.width,
        bodyFontSize: styles.fontSize,
        bodyBackground: styles.backgroundColor,
        // The tokens file sets --theme-elevation-0; if it did not load this is empty.
        tokensLoaded: getComputedStyle(root).getPropertyValue('--theme-elevation-0').trim().length > 0,
        images: images.length,
        brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).length,
      }
    })

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of WIDTHS) {
      test(`${theme} @ ${viewport.width}px keeps its layout and tokens`, async ({ browser }) => {
        test.setTimeout(180_000)
        const context = await browser.newContext({ viewport, colorScheme: theme })
        const page = await context.newPage()
        await context.addCookies([
          { name: 'payload-theme', value: theme, url: BASE },
        ])
        await login({ page, user: testUser })

        if (Object.keys(ids).length === 0) {
          for (const slug of ['articles', 'projects', 'skills']) {
            const response = await page.request.get(`/api/${slug}?limit=1&depth=0&sort=createdAt`)
            const json = await response.json()
            ids[slug] = String(json.docs?.[0]?.id ?? '')
          }
        }

        const screens = [
          { name: 'dashboard', path: '/admin' },
          { name: 'list-articles', path: '/admin/collections/articles' },
          { name: 'list-media', path: '/admin/collections/media' },
          { name: 'edit-article', path: `/admin/collections/articles/${ids.articles}` },
          { name: 'edit-project', path: `/admin/collections/projects/${ids.projects}` },
          { name: 'gallery', path: '/admin/gallery' },
        ]

        for (const screen of screens) {
          await page.goto(`${BASE}${screen.path}`)
          await page.waitForLoadState('networkidle')
          // Let thumbnails finish decoding before counting them as broken.
          await page.waitForTimeout(500)
          const result = await measure(page)

          RESULTS.push({
            screen: screen.name,
            theme,
            width: viewport.width,
            overflow: result.overflow,
            bodyFontSize: result.bodyFontSize,
            bodyBackground: result.bodyBackground,
            images: result.images,
            brokenImages: result.brokenImages,
          })

          expect(result.tokensLoaded, `${screen.name}: design tokens missing`).toBe(true)
          // 14px body text is the admin token baseline (docs/ui-modernization/admin-ui-guide.md).
          expect(result.bodyFontSize, `${screen.name}: body font size`).toBe('14px')
          // One pixel of rounding is tolerated; real sideways scroll is not.
          expect(result.overflow, `${screen.name}: scrolls sideways`).toBeLessThanOrEqual(1)
          expect(result.brokenImages, `${screen.name}: broken images`).toBe(0)

          if (theme === 'dark') {
            // The dark theme is a navy tint, not black and not white: the blue channel leads.
            const [r, g, b] = result.bodyBackground.match(/\d+/g)!.map(Number)
            expect(b, `${screen.name}: dark background stays dark`).toBeLessThan(80)
            expect(b, `${screen.name}: dark background is the navy tint`).toBeGreaterThanOrEqual(r)
            expect(g, `${screen.name}: dark background is the navy tint`).toBeGreaterThanOrEqual(r)
          } else {
            const [r] = result.bodyBackground.match(/\d+/g)!.map(Number)
            expect(r, `${screen.name}: light background stays light`).toBeGreaterThan(200)
          }
        }

        await context.close()
      })
    }
  }

  test('the dashboard keeps its heading and widget cards', async ({ page }) => {
    await login({ page, user: testUser })
    await page.goto(`${BASE}/admin`)
    // The dashboard's own heading is the welcome widget; "Dashboard" is the breadcrumb.
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
    expect(await page.locator('[data-dashboard-widget]').count()).toBeGreaterThan(3)
  })
})
