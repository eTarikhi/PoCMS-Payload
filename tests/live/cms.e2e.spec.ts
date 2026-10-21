import { test, expect, type APIRequestContext } from '@playwright/test'
import { assertIntegrationEnvironment } from '../../scripts/integration/safety'

assertIntegrationEnvironment()
async function login(request: APIRequestContext) {
  const response = await request.post('/api/users/login', {
    data: { email: 'studio-admin@example.test', password: process.env.INTEGRATION_ADMIN_PASSWORD },
  })
  expect(response.ok()).toBe(true)
}

async function uploadImage(request: APIRequestContext): Promise<{ id: number; url: string }> {
  const upload = await request.post('/api/media', {
    multipart: {
      _payload: JSON.stringify({ alt: 'Isolated integration pixel' }),
      file: {
        name: `integration-pixel-${Date.now()}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    },
  })
  expect(upload.ok()).toBe(true)
  return (await upload.json()).doc
}

test('serves generated real CMS content, local article and Next HTTP 404', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.locator('#home')).toContainText('Studio Integration')
  await page.goto('/articles/integration-field-note')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Integration field note')
  await expect(page.locator('.article-body')).toContainText('isolated integration database')
  const missing = await page.goto('/articles/not-a-real-integration-article')
  expect(missing?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Article not found')
})

test('serves real discovery routes and optimized local images', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain('/articles/integration-field-note')
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toContain('Disallow: /admin')
  const image = await request.get('/_next/image?url=%2Fimages%2Fprofile.webp&w=640&q=75')
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toMatch(/^image\//)
})

test('allows anonymous content reads but denies anonymous writes', async ({ request }) => {
  expect((await request.get('/api/projects')).status()).toBe(200)
  const create = await request.post('/api/projects', {
    data: { title: 'Unauthorized fixture', categories: ['front-end'] },
  })
  expect([401, 403]).toContain(create.status())
})

test('invalidates the shared homepage cache after an authenticated save', async ({ request }) => {
  await login(request)
  const headerResponse = await request.get('/api/header?limit=1&sort=id')
  const header = (await headerResponse.json()).docs[0]
  const changed = `Studio Integration ${Date.now()}`
  try {
    expect(
      (await request.patch(`/api/header/${header.id}`, { data: { sureName: changed } })).ok(),
    ).toBe(true)
    await expect
      .poll(async () => (await request.get('/')).text(), { timeout: 20000 })
      .toContain(changed)
  } finally {
    expect(
      (
        await request.patch(`/api/header/${header.id}`, { data: { sureName: header.sureName } })
      ).ok(),
    ).toBe(true)
    await expect
      .poll(async () => (await request.get('/')).text(), { timeout: 20000 })
      .not.toContain(changed)
  }
})

test('uploads real media and optimizes it through the Payload file route', async ({ request }) => {
  await login(request)
  const media = await uploadImage(request)
  try {
    expect((await request.get(media.url)).status()).toBe(200)
    const path = new URL(media.url, 'http://localhost:3000').pathname
    const image = await request.get(`/_next/image?url=${encodeURIComponent(path)}&w=640&q=75`)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toMatch(/^image\//)
  } finally {
    expect((await request.delete(`/api/media/${media.id}`)).ok()).toBe(true)
  }
})

test('opens the authenticated admin dashboard and existing article editor', async ({ page }) => {
  await login(page.request)
  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Integration administrator' }),
  ).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Something didn’t')
  const articles = await page.request.get(
    '/api/articles?where[slug][equals]=integration-field-note',
  )
  const article = (await articles.json()).docs[0]
  await page.goto(`/admin/collections/articles/${article.id}`)
  await expect(page.locator('input[name="title"]')).toHaveValue('Integration field note')
})

test('revalidates new, renamed, trashed, restored and permanently deleted articles without a rebuild', async ({
  request,
}) => {
  await login(request)
  const slug = `integration-lifecycle-${Date.now()}`
  const renamed = `${slug}-renamed`
  expect((await request.get(`/articles/${slug}`)).status()).toBe(404)
  const created = await request.post('/api/articles', {
    data: {
      title: slug,
      slug,
      excerpt: 'Temporary integration lifecycle fixture',
      description: 'Temporary article body.',
      publishedAt: '2026-10-22T00:00:00.000Z',
      category: 'articles',
      link: 'https://example.test/lifecycle',
    },
  })
  expect(created.ok()).toBe(true)
  const article = (await created.json()).doc
  let removed = false
  try {
    await expect.poll(async () => (await request.get(`/articles/${slug}`)).status()).toBe(200)
    await expect.poll(async () => (await request.get('/articles')).text()).toContain(slug)
    await expect
      .poll(async () => (await request.get('/sitemap.xml')).text())
      .toContain(`/articles/${slug}`)
    await expect
      .poll(async () => (await request.get('/feed.xml')).text())
      .toContain(`/articles/${slug}`)
    expect(
      (await request.patch(`/api/articles/${article.id}`, { data: { slug: renamed } })).ok(),
    ).toBe(true)
    await expect.poll(async () => (await request.get(`/articles/${slug}`)).status()).toBe(404)
    await expect.poll(async () => (await request.get(`/articles/${renamed}`)).status()).toBe(200)
    expect(
      (
        await request.patch(`/api/articles/${article.id}`, {
          data: { deletedAt: new Date().toISOString() },
        })
      ).ok(),
    ).toBe(true)
    await expect.poll(async () => (await request.get(`/articles/${renamed}`)).status()).toBe(404)
    await expect.poll(async () => (await request.get('/articles')).text()).not.toContain(slug)
    await expect.poll(async () => (await request.get('/sitemap.xml')).text()).not.toContain(renamed)
    await expect.poll(async () => (await request.get('/feed.xml')).text()).not.toContain(renamed)
    expect(
      (
        await request.patch(`/api/articles/${article.id}?trash=true`, { data: { deletedAt: null } })
      ).ok(),
    ).toBe(true)
    await expect.poll(async () => (await request.get(`/articles/${renamed}`)).status()).toBe(200)
    expect((await request.delete(`/api/articles/${article.id}`)).ok()).toBe(true)
    removed = true
    await expect.poll(async () => (await request.get(`/articles/${renamed}`)).status()).toBe(404)
    await expect.poll(async () => (await request.get('/articles')).text()).not.toContain(slug)
    await expect.poll(async () => (await request.get('/sitemap.xml')).text()).not.toContain(renamed)
    await expect.poll(async () => (await request.get('/feed.xml')).text()).not.toContain(renamed)
  } finally {
    if (!removed)
      expect((await request.delete(`/api/articles/${article.id}?trash=true`)).ok()).toBe(true)
  }
})

test('previews unsaved article edits without publishing and keeps the saved body on empty draft', async ({
  page,
}) => {
  await login(page.request)
  const response = await page.request.get(
    '/api/articles?where[slug][equals]=integration-field-note',
  )
  const article = (await response.json()).docs[0]
  await page.goto(`/admin/collections/articles/${article.id}`)
  const toggler = page.getByRole('button', { name: /^(Exit )?Live Preview$/ })
  await expect(toggler).toBeVisible()
  if ((await toggler.getAttribute('aria-label')) === 'Live Preview') await toggler.click()
  const preview = page.frameLocator('iframe#live-preview-iframe')
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Integration field note')
  await page.locator('input[name="title"]').fill('Unsaved integration heading')
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Unsaved integration heading')
  const stored = await page.request.get(`/api/articles/${article.id}`)
  expect((await stored.json()).title).toBe('Integration field note')
  await page.locator('textarea[name="description"]').fill('')
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Integration field note')
  await expect(preview.locator('.article-body')).toContainText('isolated integration database')
})

test('resolves uploaded image relations in the real Live Preview iframe', async ({ page }) => {
  await login(page.request)
  const media = await uploadImage(page.request)
  let articleID: number | undefined
  try {
    const created = await page.request.post('/api/articles', {
      data: {
        title: 'Integration image preview',
        slug: `integration-image-preview-${Date.now()}`,
        excerpt: 'Temporary image relationship preview.',
        description: 'A saved preview body.',
        publishedAt: '2026-10-22T00:00:00.000Z',
        link: 'https://example.test/preview',
        image: media.id,
      },
    })
    expect(created.ok()).toBe(true)
    articleID = (await created.json()).doc.id
    await page.goto(`/admin/collections/articles/${articleID}`)
    const toggler = page.getByRole('button', { name: /^(Exit )?Live Preview$/ })
    await expect(toggler).toBeVisible()
    if ((await toggler.getAttribute('aria-label')) === 'Live Preview') await toggler.click()
    const preview = page.frameLocator('iframe#live-preview-iframe')
    await page.locator('input[name="title"]').fill('Unsaved image relation preview')
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText(
      'Unsaved image relation preview',
    )
    await expect(preview.getByRole('img', { name: 'Isolated integration pixel' })).toBeVisible()
  } finally {
    if (articleID !== undefined)
      expect((await page.request.delete(`/api/articles/${articleID}`)).ok()).toBe(true)
    expect((await page.request.delete(`/api/media/${media.id}`)).ok()).toBe(true)
  }
})

test('serves a discoverable, well-formed RSS feed from actual CMS records', async ({ page }) => {
  const response = await page.request.get('/feed.xml')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/rss+xml; charset=utf-8')
  expect(response.headers()['cache-control']).toBe('no-cache')
  const text = await response.text()
  await page.goto('/articles')
  await expect(page.getByRole('link', { name: 'RSS feed', exact: true })).toHaveAttribute(
    'href',
    '/feed.xml',
  )
  const parsed = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    return {
      error: !!doc.querySelector('parsererror'),
      title: doc.querySelector('item > title')?.textContent,
      link: doc.querySelector('item > link')?.textContent,
    }
  }, text)
  expect(parsed.error).toBe(false)
  expect(parsed.title).toBe('Integration field note')
  expect(parsed.link).toBe('http://localhost:3000/articles/integration-field-note')
})
