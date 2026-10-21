import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioHome } from '@/app/(frontend)/components/studio/StudioHome'
import { WorkGrid } from '@/app/(frontend)/components/studio/WorkGrid'
import type { PortfolioContent, ProjectsContent } from '@/app/(frontend)/lib/types'

vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) =>
    React.createElement('img', props),
}))

afterEach(cleanup)

const projects: ProjectsContent = {
  filters: [
    { label: 'All', value: '*' },
    { label: 'Front-End', value: 'front-end' },
    { label: 'Back-End', value: 'back-end' },
  ],
  items: [
    {
      id: '1',
      title: 'Interface project',
      categories: ['front-end'],
      thumbnailUrl: '',
      imageUrl: '',
      url: 'https://example.com',
      readMoreUrl: 'https://example.com/story',
    },
    {
      id: '2',
      title: 'API project',
      categories: ['back-end'],
      thumbnailUrl: '',
      imageUrl: '',
      url: '#',
    },
  ],
}

const content: PortfolioContent = {
  header: null,
  about: null,
  footer: null,
  projects,
  articles: [],
  certificates: [],
  experiences: [],
  educations: [],
  skills: { frontend: [], backend: [] },
  services: { items: [], hiring: null },
}

describe('Engineer’s Studio homepage', () => {
  it('filters work with accessible pressed states and announces result counts', () => {
    render(React.createElement(WorkGrid, { projects }))
    fireEvent.click(screen.getByRole('button', { name: 'Front-End' }))
    expect(screen.getByRole('button', { name: 'Front-End' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByText('Interface project')).toBeDefined()
    expect(screen.queryByText('API project')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('1 projects shown')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('API project')).toBeDefined()
  })

  it('handles missing profile singletons and keeps work before expertise', () => {
    render(React.createElement(StudioHome, { content }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Engineering with purpose',
    )
    const main = screen.getByRole('main')
    expect(
      main.querySelector('#project')!.compareDocumentPosition(main.querySelector('#service')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#main-content',
    )
  })

  it('prioritizes featured writing and links to the local article when available', () => {
    const article = {
      id: 'a',
      title: 'External post',
      excerpt: 'A note',
      author: 'October 22, 2026',
      readTime: '3 min',
      imageUrl: '',
      link: 'https://example.com/post',
      pagePath: null,
    }
    render(
      React.createElement(StudioHome, {
        content: {
          ...content,
          articles: [
            article,
            {
              ...article,
              id: 'b',
              title: 'Featured local post',
              featured: true,
              pagePath: '/articles/local-post',
            },
          ],
        },
      }),
    )
    const writing = document.querySelector('#article')!
    expect(writing.querySelector('article a')!.getAttribute('href')).toBe('/articles/local-post')
    expect(screen.getByText('Featured local post')).toBeDefined()
  })

  it('limits the initial gallery and resets expansion when the category changes', () => {
    const manyProjects = {
      ...projects,
      items: Array.from({ length: 8 }, (_, index) => ({
        ...projects.items[0],
        id: String(index),
        title: `Project ${index}`,
      })),
    }
    render(React.createElement(WorkGrid, { projects: manyProjects }))
    expect(screen.getByRole('status').textContent).toBe('6 projects shown')
    fireEvent.click(screen.getByRole('button', { name: 'View all 8 projects' }))
    expect(screen.getByRole('status').textContent).toBe('8 projects shown')
    fireEvent.click(screen.getByRole('button', { name: 'Back-End' }))
    expect(screen.getByRole('status').textContent).toBe('0 projects shown')
    expect(screen.getByText(/No projects in this category/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('status').textContent).toBe('6 projects shown')
  })

  it('does not render a dead project link when no URL is provided', () => {
    render(React.createElement(WorkGrid, { projects }))
    expect(screen.queryByRole('link', { name: 'API project' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Explore project ↗' }).getAttribute('href')).toBe(
      'https://example.com/story',
    )
  })
})

describe('Studio image handling', () => {
  it('switches failed images to the fallback without looping and eagerly loads priority images', async () => {
    const { CoverImage } = await import('@/app/(frontend)/components/ui/CoverImage')
    render(
      React.createElement(CoverImage, {
        src: '/missing.jpg',
        fallbackSrc: '/placeholder.svg',
        alt: 'Portrait',
        width: 700,
        height: 800,
        priority: true,
      }),
    )
    const image = screen.getByRole('img', { name: 'Portrait' })
    expect(image.getAttribute('loading')).not.toBe('lazy')
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe('/placeholder.svg')
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe('/placeholder.svg')
  })
})
