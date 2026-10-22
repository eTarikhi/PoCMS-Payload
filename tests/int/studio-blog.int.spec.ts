import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BlogArchive } from '@/app/(frontend)/components/studio/BlogArchive'
import type { ArticleItem, PortfolioContent } from '@/app/(frontend)/lib/types'
vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    React.createElement('img', props),
}))
afterEach(cleanup)
const article: ArticleItem = {
  id: 'a',
  title: 'A field note',
  excerpt: 'An idea',
  author: 'October 22, 2026',
  readTime: '3 min',
  imageUrl: '',
  link: 'https://example.com/post',
  pagePath: null,
}
const content: PortfolioContent = {
  header: null,
  about: null,
  footer: null,
  projects: { filters: [], items: [] },
  articles: [],
  certificates: [],
  experiences: [],
  educations: [],
  skills: { frontend: [], backend: [] },
  services: { items: [], hiring: null },
}

describe('Original-theme blog', () => {
  it('prioritizes featured articles without mutating CMS ordering', () => {
    const articles = [
      article,
      {
        ...article,
        id: 'b',
        title: 'Featured note',
        featured: true,
        pagePath: '/articles/featured',
      },
    ]
    render(React.createElement(BlogArchive, { content: { ...content, articles } }))
    expect(document.querySelector('.journal-feature h2')?.textContent).toBe('Featured note')
    expect(screen.getByRole('link', { name: 'Read the story ↗' }).getAttribute('href')).toBe(
      '/articles/featured',
    )
    expect(articles[0].id).toBe('a')
  })
  it('keeps external-only articles readable', () => {
    render(React.createElement(BlogArchive, { content: { ...content, articles: [article] } }))
    expect(screen.getByRole('link', { name: 'Read the story ↗' }).getAttribute('href')).toBe(
      article.link,
    )
  })
  it('handles an empty journal and still links to the searchable archive', () => {
    render(React.createElement(BlogArchive, { content }))
    expect(screen.getByText('New stories will appear here when published.')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Explore all articles ↗' }).getAttribute('href')).toBe(
      '/articles',
    )
  })
})
