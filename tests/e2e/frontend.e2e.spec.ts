import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/**
 * Runs an @axe-core/playwright WCAG 2.0/2.1 Level A & AA audit on the active page and asserts
 * zero critical or serious accessibility violations.
 */
async function expectNoSevereAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

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

    await expectNoSevereAccessibilityViolations(page)
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
      expect(formDoc.emails).toBeUndefined()
    }

    // 3. Render /contact page and verify WCAG accessibility
    const pageRes = await page.goto('/contact')
    expect(pageRes?.status()).toBe(200)
    await expect(page.locator('main#main-content')).toBeVisible()
    await expect(page.locator('h1')).toContainText(/Contact/i)
    await expectNoSevereAccessibilityViolations(page)

    // 4. End-to-end submission when default Contact form is seeded
    const formLocator = page.locator('main#main-content form').first()
    if ((await formLocator.count()) > 0) {
      await formLocator.locator('input[name="name"]').fill('Playwright Visitor')
      await formLocator.locator('input[name="email"]').fill('visitor@example.com')
      const messageField = formLocator.locator('textarea[name="message"]')
      if ((await messageField.count()) > 0) {
        await messageField.fill('End-to-end verification of the PoCMS Contact form pipeline.')
      }
      await formLocator.locator('button[type="submit"]').click()
      await expect(page.getByRole('status')).toContainText(/Submission received/i)
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
