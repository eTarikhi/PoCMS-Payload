import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * Runs an @axe-core/playwright WCAG 2.0/2.1 Level A & AA audit on the active page and asserts
 * zero critical or serious accessibility violations.
 */
async function expectNoSevereAccessibilityViolations(
  page: Page,
  options?: { excludeSelectors?: string[] },
) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  for (const selector of options?.excludeSelectors ?? []) {
    builder = builder.exclude(selector)
  }

  const results = await builder.analyze()

  const severe = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )

  expect(
    severe.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      targets: v.nodes.slice(0, 3).map((n) => n.target),
    })),
  ).toEqual([])
}

test.describe('Public Portfolio Frontend & Syndication Routes', () => {
  test('renders the portfolio home page (/) with landmarks, JSON-LD, and WCAG accessibility', async ({
    page,
  }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)

    const title = await page.title()
    expect(title.trim().length).toBeGreaterThan(0)
    expect(title).not.toMatch(/Payload Blank Template/i)

    const main = page.locator('main')
    await expect(main.first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Welcome to your new project.')

    const jsonLdScripts = page.locator('script[type="application/ld+json"]')
    expect(await jsonLdScripts.count()).toBeGreaterThan(0)
    const rawJsonLd = await jsonLdScripts.first().textContent()
    expect(rawJsonLd).toBeTruthy()
    expect(() => JSON.parse(rawJsonLd!)).not.toThrow()

    // `#skill .nav-pills` preserves the original vTarikhi `#34495e` active tab palette by design.
    await expectNoSevereAccessibilityViolations(page, {
      excludeSelectors: ['#skill .nav-pills'],
    })
  })

  test('renders /articles hub, supports view/search controls, and navigates to an on-site article when present', async ({
    page,
  }) => {
    const response = await page.goto('/articles')
    expect(response?.status()).toBe(200)

    await expect(page.locator('main#main-content')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('a[href="/feed.xml"]').first()).toBeVisible()

    // View-mode switcher (Magazine / List / Grid)
    const listButton = page.getByRole('button', { name: /^List$/i })
    if (await listButton.isVisible()) {
      await listButton.click()
    }

    await expectNoSevereAccessibilityViolations(page)

    // Navigate to an on-site article detail route if seeded
    const detailLink = page
      .locator('main#main-content a[href^="/articles/"]:not([href="/articles"])')
      .first()
    if ((await detailLink.count()) > 0) {
      const targetHref = await detailLink.getAttribute('href')
      expect(targetHref).toBeTruthy()
      const detailRes = await page.goto(targetHref!)
      expect(detailRes?.status()).toBe(200)
      await expect(page.locator('article').first()).toBeVisible()
      await expect(page.locator('h1').first()).toBeVisible()
      await expectNoSevereAccessibilityViolations(page)
    }
  })

  test('renders /projects hub, supports view controls, and navigates to an on-site project case study when present', async ({
    page,
  }) => {
    const response = await page.goto('/projects')
    expect(response?.status()).toBe(200)

    await expect(page.locator('main#main-content')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible()

    const indexButton = page.getByRole('button', { name: /^Index$/i })
    if (await indexButton.isVisible()) {
      await indexButton.click()
    }

    await expectNoSevereAccessibilityViolations(page)

    const projectLink = page
      .locator('main#main-content a[href^="/projects/"]:not([href="/projects"])')
      .first()
    if ((await projectLink.count()) > 0) {
      const targetHref = await projectLink.getAttribute('href')
      expect(targetHref).toBeTruthy()
      const detailRes = await page.goto(targetHref!)
      expect(detailRes?.status()).toBe(200)
      await expect(page.locator('article').first()).toBeVisible()
      await expect(page.locator('h1').first()).toBeVisible()
      await expectNoSevereAccessibilityViolations(page)
    }
  })

  test('renders CMS-driven /contact & Request-CV page, enforces private API RBAC, and submits cleanly', async ({
    page,
    request,
  }) => {
    // 1. Anonymous API read of form-submissions must be forbidden
    const submissionsRes = await request.get('/api/form-submissions')
    expect([401, 403]).toContain(submissionsRes.status())

    // 2. Anonymous API read of forms must never leak private recipient `emails`
    const formsRes = await request.get('/api/forms')
    expect(formsRes.status()).toBe(200)
    const formsJson = (await formsRes.json()) as {
      docs?: Array<Record<string, unknown>>
    }
    for (const formDoc of formsJson.docs ?? []) {
      expect(formDoc.emails ?? []).toEqual([])
    }

    // 3. Render /contact page and verify WCAG accessibility
    await page.setExtraHTTPHeaders({ 'x-playwright-e2e': '1' })
    const pageRes = await page.goto('/contact?form=contact')
    expect(pageRes?.status()).toBe(200)
    await expect(page.locator('main#main-content')).toBeVisible()
    await expect(page.locator('h1').first()).toContainText(/Contact/i)
    await expectNoSevereAccessibilityViolations(page)

    // 4. End-to-end submission when at least one CMS form is published
    const formLocator = page.locator('main#main-content form').first()
    if ((await formLocator.count()) > 0) {
      // Populate every visible field control (excluding hidden anti-spam honeypots) so submission
      // succeeds regardless of which CMS form fields are marked required in the active database.
      const emailInputs = formLocator.locator('input[type="email"]:not([tabindex="-1"])')
      const emailCount = await emailInputs.count()
      for (let i = 0; i < emailCount; i++) {
        const ctrl = emailInputs.nth(i)
        if (await ctrl.isVisible()) {
          await ctrl.fill('visitor@example.com')
        }
      }

      const numberInputs = formLocator.locator('input[type="number"]:not([tabindex="-1"])')
      const numberCount = await numberInputs.count()
      for (let i = 0; i < numberCount; i++) {
        const ctrl = numberInputs.nth(i)
        if (await ctrl.isVisible()) {
          await ctrl.fill('1')
        }
      }

      const textInputs = formLocator.locator(
        'input:not([type="email"]):not([type="number"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([tabindex="-1"])',
      )
      const textCount = await textInputs.count()
      for (let i = 0; i < textCount; i++) {
        const ctrl = textInputs.nth(i)
        if ((await ctrl.isVisible()) && !(await ctrl.inputValue()).trim()) {
          await ctrl.fill('Playwright Visitor')
        }
      }

      const textareas = formLocator.locator('textarea:not([tabindex="-1"])')
      const textareaCount = await textareas.count()
      for (let i = 0; i < textareaCount; i++) {
        const ctrl = textareas.nth(i)
        if ((await ctrl.isVisible()) && !(await ctrl.inputValue()).trim()) {
          await ctrl.fill('End-to-end verification of the PoCMS Contact form pipeline.')
        }
      }

      const selects = formLocator.locator('select:not([tabindex="-1"])')
      const selectCount = await selects.count()
      for (let i = 0; i < selectCount; i++) {
        const ctrl = selects.nth(i)
        if ((await ctrl.isVisible()) && !(await ctrl.inputValue()).trim()) {
          const options = ctrl.locator('option')
          const optCount = await options.count()
          for (let j = 0; j < optCount; j++) {
            const val = await options.nth(j).getAttribute('value')
            if (val && val.trim().length > 0) {
              await ctrl.selectOption(val)
              break
            }
          }
        }
      }

      const requiredCheckboxes = formLocator.locator(
        'input[type="checkbox"][required]:not([tabindex="-1"])',
      )
      const checkboxCount = await requiredCheckboxes.count()
      for (let i = 0; i < checkboxCount; i++) {
        const ctrl = requiredCheckboxes.nth(i)
        if (await ctrl.isVisible()) {
          await ctrl.check()
        }
      }

      const [submitResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes('/api/form-submissions') && res.request().method() === 'POST',
          { timeout: 60_000 },
        ),
        formLocator.locator('button[type="submit"]').click(),
      ])
      expect([200, 201]).toContain(submitResponse.status())

      if (page.url().includes('/contact')) {
        await expect(page.getByRole('status')).toContainText(/Submission received/i, {
          timeout: 30_000,
        })
      }
    }
  })

  test('serves valid /feed.xml, /sitemap.xml, and /robots.txt machine-readable endpoints', async ({
    request,
  }) => {
    const feedRes = await request.get('/feed.xml')
    expect(feedRes.status()).toBe(200)
    expect(feedRes.headers()['content-type']).toContain('application/rss+xml')
    const feedXml = await feedRes.text()
    expect(feedXml).toContain('<rss version="2.0"')
    expect(feedXml).toContain('rel="self"')

    const sitemapRes = await request.get('/sitemap.xml')
    expect(sitemapRes.status()).toBe(200)
    expect(sitemapRes.headers()['content-type']).toContain('xml')
    const sitemapXml = await sitemapRes.text()
    expect(sitemapXml).toContain('<urlset')
    expect(sitemapXml).toContain('/articles</loc>')
    expect(sitemapXml).toContain('/projects</loc>')
    expect(sitemapXml).toContain('/contact</loc>')

    const robotsRes = await request.get('/robots.txt')
    expect(robotsRes.status()).toBe(200)
    const robotsTxt = await robotsRes.text()
    expect(robotsTxt).toContain('Disallow: /admin')
    expect(robotsTxt).toContain('Disallow: /api')
    expect(robotsTxt).toContain('/sitemap.xml')
  })
})
