/**
 * Tests for the article SEO (article page spec §7): per-article metadata, BlogPosting JSON-LD, and
 * the escaping of the JSON-LD script. Pure builders, plus one jsdom render of JsonLd. No database is needed.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'

import { JsonLd } from '../../src/app/(frontend)/components/seo/JsonLd'
import type { ArticleDetail } from '../../src/app/(frontend)/lib/article-mappers'
import {
  absoluteUrl,
  articleCanonicalUrl,
  buildArticleMetadata,
  buildBlogPostingJsonLd,
  buildPersonJsonLd,
} from '../../src/app/(frontend)/lib/seo'
import type { FooterContent, HeaderContent } from '../../src/app/(frontend)/lib/types'

afterEach(() => cleanup())

// A fixed site origin, so the tests do not depend on NEXT_PUBLIC_SITE_URL.
const SITE = 'https://example.test'

const article: ArticleDetail = {
  slug: 'devops-roadmap',
  title: 'DevOps Roadmap',
  excerpt: 'A short summary of the roadmap.',
  category: 'articles',
  publishedAt: '2025-02-02T12:00:00.000Z',
  publishedDisplay: 'February 2, 2025',
  readTimeDisplay: '3 min',
  coverUrl: '/api/media/file/cover.webp',
  coverAlt: 'Cover alt text',
  paragraphs: ['First paragraph.'],
  externalLink: 'https://example.com/post',
}

const header = { sureName: 'Amir v.Tarikhi' } as unknown as HeaderContent
const footer = {
  fullName: 'Amir v.Tarikhi',
  contactInfo: [],
  socialLinks: [],
} as unknown as FooterContent

describe('articleCanonicalUrl and absoluteUrl', () => {
  it('builds the canonical article URL from the site origin', () => {
    expect(articleCanonicalUrl('devops-roadmap', SITE)).toBe('https://example.test/articles/devops-roadmap')
  })

  it('makes a relative media path absolute, and leaves an absolute URL unchanged', () => {
    expect(absoluteUrl('/api/media/file/cover.webp', SITE)).toBe(
      'https://example.test/api/media/file/cover.webp',
    )
    expect(absoluteUrl('https://blob.example/cover.webp', SITE)).toBe('https://blob.example/cover.webp')
  })
})

describe('buildArticleMetadata', () => {
  it('sets the title, description, canonical URL, and the article Open Graph fields', () => {
    const meta = buildArticleMetadata(article, SITE)
    expect(meta.title).toBe('DevOps Roadmap')
    expect(meta.description).toBe('A short summary of the roadmap.')
    expect(meta.alternates?.canonical).toBe('https://example.test/articles/devops-roadmap')
    const og = meta.openGraph as Record<string, unknown>
    expect(og.type).toBe('article')
    expect(og.url).toBe('https://example.test/articles/devops-roadmap')
    expect(og.publishedTime).toBe('2025-02-02T12:00:00.000Z')
  })

  it('uses the absolute cover as the image, with the media alt text', () => {
    const meta = buildArticleMetadata(article, SITE)
    const images = (meta.openGraph as { images: Array<{ url: string; alt: string }> }).images
    expect(images[0].url).toBe('https://example.test/api/media/file/cover.webp')
    expect(images[0].alt).toBe('Cover alt text')
    expect((meta.twitter as { card: string }).card).toBe('summary_large_image')
  })

  it('falls back to the profile photo and a summary card when there is no cover', () => {
    const meta = buildArticleMetadata({ ...article, coverUrl: null }, SITE)
    const images = (meta.openGraph as { images: Array<{ url: string }> }).images
    expect(images[0].url).toBe('https://example.test/images/profile.webp')
    expect((meta.twitter as { card: string }).card).toBe('summary')
  })

  it('leaves out the description when the excerpt is empty', () => {
    const meta = buildArticleMetadata({ ...article, excerpt: '' }, SITE)
    expect(meta.description).toBeUndefined()
  })
})

describe('buildBlogPostingJsonLd', () => {
  it('has the required BlogPosting fields, with absolute URLs', () => {
    const ld = buildBlogPostingJsonLd(article, header, footer, SITE)
    expect(ld['@context']).toBe('https://schema.org/')
    expect(ld['@type']).toBe('BlogPosting')
    expect(ld.headline).toBe('DevOps Roadmap')
    expect(ld.description).toBe('A short summary of the roadmap.')
    expect(ld.datePublished).toBe('2025-02-02T12:00:00.000Z')
    expect(ld.image).toBe('https://example.test/api/media/file/cover.webp')
    expect(ld.url).toBe('https://example.test/articles/devops-roadmap')
    expect(ld.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://example.test/articles/devops-roadmap',
    })
  })

  it('uses the same Person as the home page for the author, without a nested @context', () => {
    const ld = buildBlogPostingJsonLd(article, header, footer, SITE)
    const person = buildPersonJsonLd(header, footer, SITE)
    const { '@context': _context, ...expected } = person
    expect(ld.author).toEqual(expected)
    expect((ld.author as Record<string, unknown>)['@context']).toBeUndefined()
    expect((ld.author as Record<string, unknown>)['@type']).toBe('Person')
  })

  it('leaves out the optional fields when the article has no date or excerpt', () => {
    const ld = buildBlogPostingJsonLd({ ...article, publishedAt: null, excerpt: '' }, header, footer, SITE)
    expect(ld).not.toHaveProperty('datePublished')
    expect(ld).not.toHaveProperty('description')
  })
})

describe('JsonLd rendering', () => {
  it('escapes "<" so a value cannot close the script element early', () => {
    const hostile = { headline: '</script><script>alert(1)</script>' }
    const { container } = render(createElement(JsonLd, { data: hostile }))
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts).toHaveLength(1)
    const parsed = JSON.parse(scripts[0].textContent ?? '')
    expect(parsed.headline).toBe('</script><script>alert(1)</script>')
  })
})
