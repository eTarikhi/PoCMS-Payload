import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { buildArticleMetadata, buildSiteMetadata } from '@/app/(frontend)/lib/seo'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import { mapSeoMeta, mapSiteSettings } from '@/app/(frontend)/lib/mappers'
import { seoGenerate } from '@/plugins/seo'

/**
 * SEO metadata (Payload's SEO plugin).
 *
 * The plugin adds a `meta` group (title, description, image) to Articles and the Site settings
 * global, with an Auto-generate button per field. Two things can break silently:
 *
 * - the wiring: the group is missing, or the seed's generated values do not reach the documents;
 * - the fallbacks: an article with an empty group has to render the same metadata it did before,
 *   and the site-wide group has to override the layout constants only where it has a value.
 *
 * The metadata builders are pure, so most of this runs without a page.
 */

const SITE = 'https://example.test'

const articleDetail = (overrides: Partial<Parameters<typeof mapArticleDetail>[0]> = {}) => {
  const base = {
    id: 1,
    slug: 'an-article',
    title: 'An article',
    excerpt: 'A short excerpt about the article.',
    category: 'articles' as const,
    publishedAt: '2025-01-02T00:00:00.000Z',
    readTime: 3,
    image: null,
    imageUrl: null,
    link: 'https://example.com/original',
    description: 'Body text.',
    meta: undefined,
    ...overrides,
  }
  // The mapper validates the body, so the fixture keeps a paragraph in `description`.
  const detail = mapArticleDetail(base as unknown as Parameters<typeof mapArticleDetail>[0])
  if (!detail) throw new Error('fixture must produce an article page')
  return detail
}

describe('SEO plugin wiring', () => {
  let payload: Payload
  let articleId: number | string

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    if (articleId) await payload.delete({ collection: 'articles', id: articleId, overrideAccess: true })
  })

  it('adds the meta group to articles and to site settings', () => {
    const groupNames = (fields: readonly unknown[]) =>
      (fields as { name?: string; type?: string }[])
        .filter((field) => field.type === 'group' && field.name === 'meta')
        .map((field) => field.name)

    expect(groupNames(payload.collections.articles.config.fields)).toEqual(['meta'])
    expect(groupNames(payload.config.globals.find((g) => g.slug === 'site-settings')!.fields)).toEqual([
      'meta',
    ])
  })

  it('stores an article’s metadata and returns it through the Local API', async () => {
    const created = await payload.create({
      collection: 'articles',
      data: {
        title: 'SEO test article',
        excerpt: 'An excerpt for the metadata test.',
        category: 'articles',
        publishedAt: '2025-05-05T00:00:00.000Z',
        link: 'https://example.com/seo-test',
        _status: 'published',
        meta: { title: 'Custom SEO title', description: 'Custom SEO description' },
      } as never,
      overrideAccess: true,
      context: { skipAudit: true },
    })
    articleId = created.id

    const read = await payload.findByID({ collection: 'articles', id: created.id, depth: 0, overrideAccess: true })
    expect(read.meta).toMatchObject({ title: 'Custom SEO title', description: 'Custom SEO description' })
  })

  it('generates the same values the seed writes', () => {
    expect(seoGenerate.title({ doc: { title: 'A post' } })).toBe('A post | Amir v.Tarikhi')
    expect(seoGenerate.description({ doc: { excerpt: 'Excerpt' } })).toBe('Excerpt')
    expect(seoGenerate.url({ doc: { slug: 'a-post' } })).toMatch(/\/articles\/a-post$/)
    // No cover: an empty value, which clears the field (the plugin's type has no null).
    expect(seoGenerate.image({ doc: { image: null } })).toBe('')
    expect(seoGenerate.image({ doc: { image: 7 } })).toBe(7)
  })
})

describe('SEO fallbacks in the metadata builders', () => {
  it('uses the article fields when the SEO group is empty', () => {
    const metadata = buildArticleMetadata(articleDetail(), SITE)
    expect(metadata.title).toBe('An article')
    expect(metadata.description).toBe('A short excerpt about the article.')
    expect(metadata.openGraph?.title).toBe('An article')
  })

  it('lets the SEO group override the title and description', () => {
    const metadata = buildArticleMetadata(
      articleDetail({
        meta: { title: 'Overridden title', description: 'Overridden description', image: 9 },
      } as never),
      SITE,
    )
    expect(metadata.title).toBe('Overridden title')
    expect(metadata.description).toBe('Overridden description')
    expect(metadata.openGraph?.title).toBe('Overridden title')
    expect(metadata.alternates?.canonical).toBe(`${SITE}/articles/an-article`)
  })

  it('ignores whitespace-only values, so a cleared field falls back', () => {
    const meta = mapSeoMeta({ title: '   ', description: '', image: null })
    expect(meta).toMatchObject({ title: null, description: null, image: null })

    const metadata = buildArticleMetadata(
      articleDetail({ meta: { title: '  ', description: ' ' } } as never),
      SITE,
    )
    expect(metadata.title).toBe('An article')
    expect(metadata.description).toBe('A short excerpt about the article.')
  })

  it('keeps the layout constants when Site settings has no SEO values', () => {
    const withDefaults = buildSiteMetadata(null, SITE)
    const empty = buildSiteMetadata(mapSiteSettings(null), SITE)
    expect(empty.title).toBe(withDefaults.title)
    expect(empty.description).toBe(withDefaults.description)
    expect(empty.metadataBase?.toString()).toBe(`${SITE}/`)
  })

  it('lets Site settings override the site title and description', () => {
    const settings = mapSiteSettings({
      siteName: 'eTarikhi',
      meta: { title: 'Site title from the CMS', description: 'Site description from the CMS' },
    } as never)
    const metadata = buildSiteMetadata(settings, SITE)
    expect(metadata.title).toBe('Site title from the CMS')
    expect(metadata.description).toBe('Site description from the CMS')
    expect(metadata.openGraph?.title).toBe('Site title from the CMS')
    expect(metadata.twitter).toMatchObject({ title: 'Site title from the CMS' })
  })
})
