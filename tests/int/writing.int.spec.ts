import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WritingIndex } from '@/app/(frontend)/components/studio/WritingIndex'
import { StudioChrome } from '@/app/(frontend)/components/studio/StudioChrome'
import { ArticleBody } from '@/app/(frontend)/components/article/ArticleBody'
import type { ArticleItem } from '@/app/(frontend)/lib/types'

vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    React.createElement('img', props),
}))
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})
const articles: ArticleItem[] = [
  {
    id: '1',
    title: 'Interfaces with React',
    excerpt: 'Designing accessible components',
    author: 'October 22, 2026',
    readTime: '4 min',
    imageUrl: '',
    link: 'https://example.com/react',
    pagePath: '/articles/react',
  },
  {
    id: '2',
    title: 'Backend systems',
    excerpt: 'Working with GraphQL',
    author: 'October 21, 2026',
    readTime: '5 min',
    imageUrl: '',
    link: 'https://example.com/graphql',
    pagePath: null,
  },
]

describe('Studio writing', () => {
  it('searches title and excerpt case-insensitively and clears the query', () => {
    render(React.createElement(WritingIndex, { articles }))
    const search = screen.getByRole('searchbox', { name: 'Search writing' })
    fireEvent.change(search, { target: { value: '  GRAPHQL  ' } })
    expect(screen.getByRole('status').textContent).toBe('1 article found')
    expect(screen.getByRole('heading', { name: /Backend systems/ })).toBeDefined()
    expect(screen.queryByRole('heading', { name: /Interfaces/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('status').textContent).toBe('2 articles')
  })

  it('links locally when an article body exists and externally otherwise', () => {
    render(React.createElement(WritingIndex, { articles }))
    expect(screen.getByRole('link', { name: /Interfaces with React/ }).getAttribute('href')).toBe(
      '/articles/react',
    )
    expect(screen.getByRole('link', { name: /Backend systems/ }).getAttribute('href')).toBe(
      'https://example.com/graphql',
    )
  })

  it('distinguishes an empty archive from a search with no matches', () => {
    const { rerender } = render(React.createElement(WritingIndex, { articles: [] }))
    expect(screen.getByRole('heading', { name: 'A little quiet here, for now.' })).toBeDefined()
    rerender(React.createElement(WritingIndex, { articles }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing title' } })
    expect(screen.getByRole('heading', { name: 'No matching articles.' })).toBeDefined()
  })

  it('uses homepage section URLs from nested pages and has a safe missing-profile fallback', () => {
    render(
      React.createElement(
        StudioChrome,
        { footer: null },
        React.createElement('main', { id: 'main-content' }, 'Article'),
      ),
    )
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('href')).toBe('/projects')
    expect(screen.getByRole('link', { name: 'Writing' }).getAttribute('href')).toBe('/articles')
    expect(screen.getByRole('link', { name: 'Portfolio' }).getAttribute('href')).toBe('/')
  })

  it('keeps markup in the plain-text body escaped', () => {
    const { container } = render(
      React.createElement(ArticleBody, {
        paragraphs: ['<script>not executable</script>', '  ', 'Second paragraph'],
      }),
    )
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>not executable</script>')).toBeDefined()
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })
})
