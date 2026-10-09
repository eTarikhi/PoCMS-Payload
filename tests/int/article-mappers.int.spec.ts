/**
 * Tests for the article page view model (article page spec §5.3) and the "Read on this site" link (D-A10).
 * Pure mapping, plus one jsdom render of ArticlesSection. No database is needed.
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'

import { ArticlesSection } from '../../src/app/(frontend)/components/sections/ArticlesSection'
import { articlePagePath, hasArticlePage, splitArticleBody } from '../../src/app/(frontend)/lib/article-page'
import { mapArticleDetail } from '../../src/app/(frontend)/lib/article-mappers'
import { mapArticles, mapPortfolioContent } from '../../src/app/(frontend)/lib/mappers'
import type { Article } from '../../src/payload-types'
import { toPayloadDocs } from '../helpers/portfolio-fixtures'

afterEach(() => cleanup())

const baseArticle = (overrides: Partial<Article> = {}): Article =>
  ({
    id: 1,
    title: 'DevOps Roadmap',
    excerpt: 'A short summary.',
    slug: 'devops-roadmap',
    description: 'First paragraph.\n\nSecond paragraph.',
    featured: false,
    category: 'articles',
    publishedAt: '2025-02-02T12:00:00.000Z',
    readTime: 3,
    image: null,
    imageUrl: 'https://example.com/cover.jpg',
    link: 'https://example.com/post',
    updatedAt: '2025-02-02T12:00:00.000Z',
    createdAt: '2025-02-02T12:00:00.000Z',
    ...overrides,
  }) as Article

describe('splitArticleBody', () => {
  it('splits on blank lines and joins single line breaks inside a paragraph', () => {
    expect(splitArticleBody('One line\nstill one.\n\nTwo.\n\n\n  Three  ')).toEqual([
      'One line still one.',
      'Two.',
      'Three',
    ])
  })

  it('returns no paragraphs for empty or whitespace-only text', () => {
    expect(splitArticleBody('')).toEqual([])
    expect(splitArticleBody(' \n \n ')).toEqual([])
  })

  it('keeps angle brackets as plain text (no HTML is parsed)', () => {
    expect(splitArticleBody('Use <script>alert(1)</script> carefully.')).toEqual([
      'Use <script>alert(1)</script> carefully.',
    ])
  })
})

describe('hasArticlePage and articlePagePath', () => {
  it('requires both a slug and a non-blank body', () => {
    expect(hasArticlePage({ slug: 'a', description: 'text' })).toBe(true)
    expect(hasArticlePage({ slug: 'a', description: '   ' })).toBe(false)
    expect(hasArticlePage({ slug: null, description: 'text' })).toBe(false)
    expect(hasArticlePage({ slug: 'a', description: null })).toBe(false)
  })

  it('builds the page path from the slug', () => {
    expect(articlePagePath('devops-roadmap')).toBe('/articles/devops-roadmap')
  })
})

describe('mapArticleDetail', () => {
  it('maps an article with a body to its page view model', () => {
    const detail = mapArticleDetail(baseArticle())
    expect(detail).toEqual({
      slug: 'devops-roadmap',
      title: 'DevOps Roadmap',
      excerpt: 'A short summary.',
      category: 'articles',
      publishedDisplay: expect.any(String),
      readTimeDisplay: '3 min',
      coverUrl: 'https://example.com/cover.jpg',
      paragraphs: ['First paragraph.', 'Second paragraph.'],
      externalLink: 'https://example.com/post',
    })
    expect(detail?.publishedDisplay).not.toBe('')
  })

  it('returns null when there is no body, so the route can call notFound()', () => {
    expect(mapArticleDetail(baseArticle({ description: '' }))).toBeNull()
  })

  it('returns null when there is no slug', () => {
    expect(mapArticleDetail(baseArticle({ slug: null }))).toBeNull()
  })

  it('leaves out optional fields that are empty, without inventing text', () => {
    const detail = mapArticleDetail(baseArticle({ link: '', imageUrl: '', readTime: null }))
    expect(detail?.externalLink).toBeNull()
    expect(detail?.coverUrl).toBeNull()
    expect(detail?.readTimeDisplay).toBe('')
  })
})

describe('mapArticles pagePath', () => {
  it('sets pagePath only for articles that have a page', () => {
    const [withPage, withoutBody, withoutSlug] = mapArticles([
      baseArticle(),
      baseArticle({ id: 2, description: null }),
      baseArticle({ id: 3, slug: null }),
    ])
    expect(withPage.pagePath).toBe('/articles/devops-roadmap')
    expect(withoutBody.pagePath).toBeNull()
    expect(withoutSlug.pagePath).toBeNull()
  })

  it('keeps the seeded articles unlinked, because none has a body yet', () => {
    const content = mapPortfolioContent(toPayloadDocs())
    expect(content.articles.length).toBeGreaterThan(0)
    expect(content.articles.every((article) => article.pagePath === null)).toBe(true)
  })
})

describe('ArticlesSection "Read on this site" link', () => {
  it('shows the link only for an article that has a pagePath', () => {
    const content = mapPortfolioContent(toPayloadDocs())
    const [first, ...rest] = content.articles
    const articles = [{ ...first, pagePath: '/articles/devops-roadmap' }, ...rest]

    const { container } = render(createElement(ArticlesSection, { articles }))
    const links = Array.from(container.querySelectorAll('a')).filter(
      (a) => a.textContent === 'Read on this site',
    )
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/articles/devops-roadmap')
    expect(screen.queryAllByText('Read on this site')).toHaveLength(1)
  })
})
