import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { selectMoreWriting } from '@/app/(frontend)/lib/more-writing'
import { MoreWriting } from '@/app/(frontend)/components/article/MoreWriting'
import type { ArticleItem } from '@/app/(frontend)/lib/types'
import type { ArticleDetail } from '@/app/(frontend)/lib/article-mappers'

afterEach(cleanup)
const current: ArticleDetail = {
  id: 1,
  slug: 'current',
  title: 'Current',
  excerpt: '',
  category: 'articles',
  publishedAt: null,
  publishedDisplay: '',
  readTimeDisplay: '',
  coverUrl: null,
  coverAlt: '',
  paragraphs: ['Body'],
  externalLink: 'https://example.com/current',
}
const item: ArticleItem = {
  id: '2',
  title: 'Another note',
  excerpt: 'An excerpt',
  category: 'others',
  author: 'October 22, 2026',
  readTime: '3 min',
  imageUrl: '',
  pagePath: null,
  link: 'https://example.com/next',
}

describe('More writing discovery', () => {
  it('excludes current IDs, current local paths, and duplicate original-publication URLs', () => {
    const articles = [
      { ...item, id: '1' },
      { ...item, id: '3', pagePath: '/articles/current' },
      { ...item, id: '4', link: current.externalLink! },
      item,
      { ...item, id: '5' },
    ]
    expect(selectMoreWriting(articles, current).map((article) => article.id)).toEqual(['2'])
  })
  it('prefers the same CMS category while keeping input order within each group', () => {
    const same = {
      ...item,
      id: '3',
      category: 'articles' as const,
      link: 'https://example.com/same',
    }
    expect(selectMoreWriting([item, same], current).map((article) => article.id)).toEqual([
      '3',
      '2',
    ])
    expect(selectMoreWriting([item, same], current, 0)).toEqual([])
  })
  it('does not render an empty recommendation section', () => {
    const { container } = render(React.createElement(MoreWriting, { articles: [], current }))
    expect(container.children).toHaveLength(0)
  })
  it('clearly distinguishes local reading from an external publication', () => {
    render(
      React.createElement(MoreWriting, {
        articles: [
          item,
          { ...item, id: '3', link: 'https://example.com/local', pagePath: '/articles/local' },
        ],
        current,
      }),
    )
    expect(screen.getByRole('link', { name: 'Read on this site ↗' }).getAttribute('href')).toBe(
      '/articles/local',
    )
    expect(
      screen.getByRole('link', { name: 'Read original publication ↗' }).getAttribute('href'),
    ).toBe(item.link)
  })
})
