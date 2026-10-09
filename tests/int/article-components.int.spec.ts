/**
 * Tests for the article reading layer (article page spec §5.2, §5.3, §8, §9, §10).
 * jsdom with @testing-library/react. No database is needed.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ArticleBody } from '../../src/app/(frontend)/components/article/ArticleBody'
import { ArticleFooterNav } from '../../src/app/(frontend)/components/article/ArticleFooterNav'
import { ArticleHeader } from '../../src/app/(frontend)/components/article/ArticleHeader'
import { ArticleLayout } from '../../src/app/(frontend)/components/article/ArticleLayout'
import { ReadingProgress } from '../../src/app/(frontend)/components/article/ReadingProgress'
import type { ArticleDetail } from '../../src/app/(frontend)/lib/article-mappers'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Stubs window.matchMedia. `reduced` sets the prefers-reduced-motion answer. */
const stubMatchMedia = (reduced: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const article: ArticleDetail = {
  slug: 'devops-roadmap',
  title: 'DevOps Roadmap',
  excerpt: 'A short summary of the roadmap.',
  category: 'articles',
  publishedAt: '2025-02-02T12:00:00.000Z',
  publishedDisplay: 'February 2, 2025',
  readTimeDisplay: '3 min',
  coverUrl: 'https://example.com/cover.jpg',
  coverAlt: 'Cover alt text',
  paragraphs: ['First paragraph.', 'Second paragraph.'],
  externalLink: 'https://example.com/post',
}

describe('ArticleBody', () => {
  it('renders one <p> per paragraph and drops empty chunks', () => {
    const { container } = render(
      createElement(ArticleBody, { paragraphs: ['One.', '', '   ', 'Two.'] }),
    )
    const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent)
    expect(paragraphs).toEqual(['One.', 'Two.'])
  })

  it('escapes markup in the text, so it is shown as text and never rendered as HTML', () => {
    const { container } = render(
      createElement(ArticleBody, { paragraphs: ['<img src=x onerror="alert(1)"> <b>bold</b>'] }),
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('p')?.textContent).toBe('<img src=x onerror="alert(1)"> <b>bold</b>')
  })
})

describe('ArticleHeader', () => {
  it('renders the category label, one h1, the excerpt, and a <time> with the ISO date', () => {
    const { container } = render(
      createElement(ArticleHeader, {
        title: article.title,
        excerpt: article.excerpt,
        category: 'others',
        publishedAt: article.publishedAt,
        publishedDisplay: article.publishedDisplay,
        readTimeDisplay: article.readTimeDisplay,
      }),
    )
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('h1')?.textContent).toBe('DevOps Roadmap')
    expect(container.querySelector('.article-category')?.textContent).toBe('Others')
    expect(container.querySelector('.article-excerpt')?.textContent).toBe(article.excerpt)
    const time = container.querySelector('time')
    expect(time?.getAttribute('datetime')).toBe('2025-02-02T12:00:00.000Z')
    expect(time?.textContent).toBe('February 2, 2025')
    expect(container.querySelector('.article-meta')?.textContent).toContain('3 min read')
  })

  it('leaves out the category and the meta row when there is no data for them', () => {
    const { container } = render(
      createElement(ArticleHeader, {
        title: 'Plain',
        excerpt: '',
        category: null,
        publishedAt: null,
        publishedDisplay: '',
        readTimeDisplay: '',
      }),
    )
    expect(container.querySelector('.article-category')).toBeNull()
    expect(container.querySelector('.article-excerpt')).toBeNull()
    expect(container.querySelector('.article-meta')).toBeNull()
  })
})

describe('ArticleFooterNav', () => {
  it('links back to the articles section, and opens the original link in a new tab with noopener', () => {
    const { container } = render(
      createElement(ArticleFooterNav, { externalLink: 'https://example.com/post' }),
    )
    const back = container.querySelector('a[href="/#article"]')
    expect(back?.textContent).toBe('Back to articles')
    const external = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent === 'Originally published at',
    )
    expect(external?.getAttribute('target')).toBe('_blank')
    expect(external?.getAttribute('rel')).toContain('noopener')
  })

  it('omits the original link when there is none', () => {
    const { container } = render(createElement(ArticleFooterNav, { externalLink: null }))
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })
})

describe('ArticleLayout', () => {
  it('renders one article and one h1, and no second navigation or footer', () => {
    const { container } = render(createElement(ArticleLayout, { article }))
    expect(container.querySelectorAll('article')).toHaveLength(1)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('nav')).toBeNull()
    expect(container.querySelector('footer')).toBeNull()
  })

  it('uses the media alt text for the cover image', () => {
    const { container } = render(createElement(ArticleLayout, { article }))
    expect(container.querySelector('figure img')?.getAttribute('alt')).toBe('Cover alt text')
  })
})

describe('ReadingProgress', () => {
  beforeEach(() => {
    stubMatchMedia(false)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1500,
    })
  })

  const setScrollY = (y: number) => {
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y })
  }

  it('sets scaleX from the scroll position (0 at the top, 1 at the bottom)', () => {
    setScrollY(0)
    const { container } = render(createElement(ReadingProgress))
    const bar = container.querySelector<HTMLElement>('.article-progress')
    expect(bar?.getAttribute('aria-hidden')).toBe('true')
    expect(bar?.style.transform).toBe('scaleX(0)')

    setScrollY(500)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(bar?.style.transform).toBe('scaleX(0.5)')

    setScrollY(5000)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(bar?.style.transform).toBe('scaleX(1)')
  })

  it('removes its scroll and resize listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(createElement(ReadingProgress))
    unmount()
    const removed = removeSpy.mock.calls.map((call) => call[0])
    expect(removed).toContain('scroll')
    expect(removed).toContain('resize')
    removeSpy.mockRestore()
  })

  it('renders nothing when the reader prefers reduced motion', () => {
    stubMatchMedia(true)
    const { container } = render(createElement(ReadingProgress))
    expect(container.querySelector('.article-progress')).toBeNull()
  })
})

describe('article.css scope', () => {
  it('scopes every selector under .article-page, so main.css and the homepage are not affected', () => {
    const css = readFileSync(
      path.resolve(__dirname, '../../src/app/(frontend)/styles/article.css'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media[^{]*\{/g, '')
      .replace(/\}\s*\}/g, '}')

    const selectors = css
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter((selector) => selector.length > 0)

    expect(selectors.length).toBeGreaterThan(10)
    for (const selector of selectors) {
      for (const part of selector.split(',').map((s) => s.trim())) {
        expect(part.startsWith('.article-page'), `unscoped selector: ${part}`).toBe(true)
      }
    }
  })
})
