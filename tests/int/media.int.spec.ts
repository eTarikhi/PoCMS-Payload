import { describe, expect, it } from 'vitest'

import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import { resolveMediaSize, resolveMediaUrl, resolveMediaUrlSize } from '@/app/(frontend)/lib/mappers'
import { buildArticleMetadata } from '@/app/(frontend)/lib/seo'
import type { Article, Media } from '@/payload-types'

/**
 * Media sizes (P5.4): the mapper has to prefer the generated Open Graph crop, keep the original as a
 * fallback, and never hand `undefined` dimensions to Next's metadata.
 */
const generated = (url: string, width: number, height: number) => ({
  url,
  width,
  height,
  mimeType: 'image/webp',
  filesize: 1000,
  filename: url.split('/').pop() ?? url,
})

const media = (overrides: Partial<Media> = {}): Media =>
  ({
    id: 1,
    alt: 'A picture',
    url: '/api/media/file/picture.webp',
    width: 1600,
    height: 900,
    sizes: {
      thumbnail: generated('/api/media/file/picture-400x300.webp', 400, 300),
      card: generated('/api/media/file/picture-800x500.webp', 800, 500),
      og: generated('/api/media/file/picture-1200x630.webp', 1200, 630),
    },
    ...overrides,
  }) as unknown as Media

const article = (image: Media | number | null): Article =>
  ({
    id: 3,
    title: 'A story',
    excerpt: 'The short version.',
    slug: 'a-story',
    description: 'Body.',
    link: 'https://example.com',
    publishedAt: '2026-01-02T00:00:00.000Z',
    image,
  }) as unknown as Article

describe('media size resolution', () => {
  it('returns the generated size and its real dimensions', () => {
    expect(resolveMediaSize(media(), 'og')).toEqual({
      url: '/api/media/file/picture-1200x630.webp',
      width: 1200,
      height: 630,
    })
  })

  it('falls back to the original when the size is missing', () => {
    const withoutSizes = media({ sizes: undefined })
    expect(resolveMediaSize(withoutSizes, 'og')).toEqual({
      url: '/api/media/file/picture.webp',
      width: 1600,
      height: 900,
    })
    expect(resolveMediaUrlSize(withoutSizes, 'card')).toBe('/api/media/file/picture.webp')
  })

  it('returns null for a numeric id or no media', () => {
    expect(resolveMediaSize(7, 'og')).toBeNull()
    expect(resolveMediaUrl(null)).toBeNull()
  })
})

describe('article Open Graph image', () => {
  it('uses the 1200x630 crop when the cover has one', () => {
    const detail = mapArticleDetail(article(media()))!
    expect(detail.coverOg?.url).toBe('/api/media/file/picture-1200x630.webp')

    const metadata = buildArticleMetadata(detail, 'https://example.test')
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://example.test/api/media/file/picture-1200x630.webp',
        alt: 'A picture',
        width: 1200,
        height: 630,
      },
    ])
    expect(metadata.twitter?.images).toEqual(['https://example.test/api/media/file/picture-1200x630.webp'])
  })

  it('keeps a legacy text URL as the image, without declared dimensions', () => {
    const legacy = { ...article(null), imageUrl: 'https://cdn.example.com/cover.jpg' }
    const detail = mapArticleDetail(legacy as unknown as Article)!
    expect(detail.coverOg).toBeNull()
    const metadata = buildArticleMetadata(detail, 'https://example.test')
    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://cdn.example.com/cover.jpg', alt: 'A story' },
    ])
  })

  it('falls back to the profile photo when the article has no cover at all', () => {
    const detail = mapArticleDetail(article(null))!
    const metadata = buildArticleMetadata(detail, 'https://example.test')
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: 'https://example.test/images/profile.webp' }),
    ])
    expect(metadata.twitter?.images).toEqual(['https://example.test/images/profile.webp'])
  })
})
