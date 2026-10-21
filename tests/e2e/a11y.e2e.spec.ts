import fs from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { seedTestUser, testUser } from '../helpers/seedUser'

/**
 * The admin's accessibility gate (roadmap P6.2).
 *
 * Every admin surface is scanned with axe against the WCAG 2.2 A/AA tags in both themes, and the
 * screen-reader structure the axe rules cannot check is asserted directly: one main landmark, one
 * `<h1>`, a document title, a language, and a skip link that is the first tab stop and points at
 * the landmark.
 *
 * The gate is "no serious or critical violations except the upstream ones listed in KNOWN, and no
 * more nodes of those than are listed". When Payload ships a fix, the entry stops matching and the
 * test fails with "remove the entry", so the list cannot quietly rot.
 *
 * The report (`test-results/a11y-<theme>.json`) records every scan, including the allowlisted ones,
 * and is uploaded by CI. `docs/ui-modernization/a11y.md` explains each known gap and the manual
 * screen-reader checklist that still has to be run by a person.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

type KnownGap = { rule: string; max: number; why: string }

type Surface = {
  name: string
  /** A static path, or one resolved after login (the article edit screen needs a real id). */
  path: string | ((page: Page) => Promise<string>)
  /** The sign-in screen has no sidebar, so it gets no skip link. */
  skipLink?: boolean
  known?: KnownGap[]
}

/** Payload's own markup, still unfixed in @payloadcms/ui 3.90.2. Each entry names the component. */
const KNOWN_SELECT_LABEL: KnownGap = {
  rule: 'label',
  max: 3,
  why: 'ReactSelect renders its combobox input without a label, and the two DateTime fields render an unlabelled react-datepicker input',
}

const SURFACES: Surface[] = [
  {
    name: 'dashboard',
    path: '/admin',
    known: [
      {
        rule: 'label',
        max: 1,
        why: "Payload's dashboard breadcrumb is a ReactSelect combobox with no label",
      },
    ],
  },
  { name: 'articles list', path: '/admin/collections/articles' },
  {
    name: 'article create',
    path: '/admin/collections/articles/create',
    known: [KNOWN_SELECT_LABEL],
  },
  {
    name: 'article edit',
    path: async (page) => {
      const response = await page.request.get(`${BASE}/api/articles?limit=1&depth=0`)
      const data = (await response.json()) as { docs?: { id?: number | string }[] }
      const id = data.docs?.[0]?.id
      expect(id, 'the seed must provide at least one article').toBeTruthy()
      return `/admin/collections/articles/${id}`
    },
    known: [KNOWN_SELECT_LABEL],
  },
  {
    name: 'skills list (orderable)',
    path: '/admin/collections/skills',
    known: [
      {
        rule: 'aria-command-name',
        max: 12,
        why: "Payload's SortRow drag handle is a <div role=\"button\"> with no text: six rows, outer handle plus inner control",
      },
      {
        rule: 'nested-interactive',
        max: 6,
        why: "Payload's SortRow nests a focusable control inside the drag-handle <div role=\"button\">; removing it would break keyboard reordering",
      },
    ],
  },
  { name: 'media list', path: '/admin/collections/media' },
  { name: 'browse by folder', path: '/admin/browse-by-folder' },
  {
    name: 'folder contents',
    path: async (page) => {
      const response = await page.request.get(`${BASE}/api/payload-folders?limit=1&depth=0`)
      const data = (await response.json()) as { docs?: { id?: number | string }[] }
      const id = data.docs?.[0]?.id
      expect(id, 'the seed must provide at least one media folder').toBeTruthy()
      return `/admin/browse-by-folder/${id}`
    },
  },
  { name: 'site settings global', path: '/admin/globals/site-settings' },
  { name: 'users list', path: '/admin/collections/users' },
  { name: 'roles list', path: '/admin/collections/roles' },
  { name: 'audit log', path: '/admin/collections/audit-logs' },
  { name: 'component gallery', path: '/admin/gallery' },
  { name: 'system', path: '/admin/system' },
  { name: 'scheduled jobs', path: '/admin/jobs' },
  // Last: it clears the session cookie, so everything after it would be signed out.
  { name: 'sign in', path: '/admin/login', skipLink: false },
]

type Scan = {
  name: string
  path: string
  theme: string
  violations: { rule: string; impact: string | null; nodes: number; targets: string[] }[]
  structure: {
    mainLandmarks: number
    h1: string[]
    title: string
    lang: string
    dir: string
    skipLink: { href: string; first: boolean; pointsAtMain: boolean } | null
  }
}

async function structure(page: Page) {
  return page.evaluate(() => {
    const mainLandmarks = document.querySelectorAll('main, [role="main"]').length
    const h1 = [...document.querySelectorAll('h1')].map((heading) => heading.textContent ?? '')
    const link = document.querySelector('a#pocms-skip-link')
    const main = document.querySelector('main, [role="main"]')
    return {
      mainLandmarks,
      h1,
      title: document.title,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      skipLink: link
        ? {
            href: link.getAttribute('href') ?? '',
            // The skip link has to be the first element, or it is not the first tab stop.
            first: document.body.firstElementChild === link,
            pointsAtMain: Boolean(main && link.getAttribute('href') === `#${main.id}`),
          }
        : null,
    }
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`every admin surface passes axe and keeps its landmarks (${theme})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000)
    await seedTestUser()
    await context.addCookies([{ name: 'payload-theme', value: theme, url: BASE }])

    const scans: Scan[] = []
    const failures: string[] = []

    // One login for the whole sweep; the sign-in surface clears the cookie at the end.
    await login({ page, user: testUser })

    for (const surface of SURFACES) {
      await test.step(surface.name, async () => {
        if (surface.path === '/admin/login') {
          await context.clearCookies()
          await context.addCookies([{ name: 'payload-theme', value: theme, url: BASE }])
        }
        const path = typeof surface.path === 'string' ? surface.path : await surface.path(page)
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()

        const violations = results.violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map((violation) => ({
            rule: violation.id,
            impact: violation.impact ?? null,
            nodes: violation.nodes.length,
            targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
          }))

        const info = await structure(page)
        scans.push({ name: surface.name, path, theme, violations, structure: info })

        // ---- the known-gap gate -------------------------------------------------------------
        const allowed = new Map((surface.known ?? []).map((gap) => [gap.rule, gap]))
        for (const violation of violations) {
          const gap = allowed.get(violation.rule)
          if (!gap) {
            failures.push(
              `${surface.name} [${theme}]: new ${violation.impact} "${violation.rule}" on ${violation.targets.join(', ')}`,
            )
            continue
          }
          if (violation.nodes > gap.max) {
            failures.push(
              `${surface.name} [${theme}]: "${violation.rule}" now has ${violation.nodes} nodes (allowed ${gap.max}) — ${gap.why}`,
            )
          }
        }
        for (const gap of allowed.values()) {
          const found = violations.find((violation) => violation.rule === gap.rule)
          if (!found) {
            failures.push(
              `${surface.name} [${theme}]: "${gap.rule}" no longer occurs — remove it from KNOWN (${gap.why})`,
            )
          }
        }

        // ---- structure axe does not check ---------------------------------------------------
        if (info.mainLandmarks !== 1) {
          failures.push(
            `${surface.name} [${theme}]: ${info.mainLandmarks} main landmarks, expected exactly 1`,
          )
        }
        if (info.h1.length !== 1 || !info.h1[0]?.trim()) {
          failures.push(
            `${surface.name} [${theme}]: expected one non-empty <h1>, found ${JSON.stringify(info.h1)}`,
          )
        }
        if (!info.title.trim()) failures.push(`${surface.name} [${theme}]: empty document title`)
        if (!info.lang) failures.push(`${surface.name} [${theme}]: <html lang> is missing`)
        if (info.dir !== 'ltr' && info.dir !== 'rtl') {
          failures.push(`${surface.name} [${theme}]: <html dir> is "${info.dir}"`)
        }

        const wantsSkipLink = surface.skipLink !== false
        if (wantsSkipLink) {
          if (!info.skipLink) {
            failures.push(`${surface.name} [${theme}]: no skip link`)
          } else {
            if (!info.skipLink.first) {
              failures.push(`${surface.name} [${theme}]: skip link is not the first element`)
            }
            if (!info.skipLink.pointsAtMain) {
              failures.push(`${surface.name} [${theme}]: skip link does not point at the main landmark`)
            }
          }
        } else if (info.skipLink) {
          failures.push(`${surface.name} [${theme}]: unexpected skip link on a screen without a sidebar`)
        }
      })
    }

    fs.mkdirSync('test-results', { recursive: true })
    fs.writeFileSync(
      `test-results/a11y-${theme}.json`,
      JSON.stringify({ base: BASE, theme, scannedAt: new Date().toISOString(), scans }, null, 2),
    )

    expect(failures, `\n${failures.join('\n')}\n`).toEqual([])
  })
}

/**
 * The skip link is only useful if a keyboard user can reach and use it, which the attribute checks
 * above cannot prove: it must be the first tab stop, become visible when focused, and move focus to
 * the landmark. One real keyboard pass per theme covers every screen, since the shell is shared.
 */
for (const theme of ['light', 'dark'] as const) {
  test(`the skip link is the first tab stop and moves focus to main (${theme})`, async ({
    page,
    context,
  }) => {
    await seedTestUser()
    await context.addCookies([{ name: 'payload-theme', value: theme, url: BASE }])
    await login({ page, user: testUser })
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })

    // Start from the document, as a keyboard user reaching the page would.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Tab')

    const link = page.locator('a#pocms-skip-link')
    await expect(link).toBeFocused()
    await expect(link).toBeInViewport()

    const background = await link.evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(background, 'the focused skip link must be visible, not transparent').not.toBe(
      'rgba(0, 0, 0, 0)',
    )

    await page.keyboard.press('Enter')
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      return {
        id: element?.id ?? '',
        role: element?.getAttribute('role') ?? '',
        tag: element?.tagName ?? '',
      }
    })
    expect(focused).toMatchObject({ id: 'pocms-main' })
    expect(focused.role === 'main' || focused.tag === 'MAIN').toBe(true)
  })
}
