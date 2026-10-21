import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectsIndex } from '@/app/(frontend)/components/studio/ProjectsIndex'
import type { ProjectsContent } from '@/app/(frontend)/lib/types'

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

const projects: ProjectsContent = {
  filters: [
    { label: 'All', value: '*' },
    { label: 'Front-End', value: 'front-end' },
    { label: 'Back-End', value: 'back-end' },
  ],
  items: [
    {
      id: '1',
      title: 'Commerce interface',
      categories: ['front-end'],
      thumbnailUrl: '',
      imageUrl: '',
      url: '#',
    },
    {
      id: '2',
      title: 'Commerce API',
      categories: ['back-end'],
      thumbnailUrl: '',
      imageUrl: '',
      url: '#',
    },
    {
      id: '3',
      title: 'Dashboard',
      categories: ['front-end'],
      thumbnailUrl: '',
      imageUrl: '',
      url: '#',
    },
  ],
}

describe('Studio project archive', () => {
  it('combines case-insensitive title search with the selected category', () => {
    render(React.createElement(ProjectsIndex, { projects }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), {
      target: { value: ' COMMERCE ' },
    })
    expect(screen.getByRole('status').textContent).toBe('2 projects shown')
    fireEvent.click(screen.getByRole('button', { name: 'Back-End' }))
    expect(screen.getByRole('status').textContent).toBe('1 projects shown')
    expect(screen.getByRole('heading', { name: 'Commerce API' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Commerce interface' })).toBeNull()
  })

  it('searches human-readable category labels and restores focus after clearing', () => {
    render(React.createElement(ProjectsIndex, { projects }))
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'front-end' } })
    expect(screen.getByRole('status').textContent).toBe('2 projects shown')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(document.activeElement).toBe(input)
    expect(screen.getByRole('status').textContent).toBe('3 projects shown')
  })

  it('shows the complete archive instead of the six-item homepage limit', () => {
    const many = {
      ...projects,
      items: Array.from({ length: 9 }, (_, i) => ({
        ...projects.items[0],
        id: String(i),
        title: `Project ${i}`,
      })),
    }
    render(React.createElement(ProjectsIndex, { projects: many }))
    expect(screen.getByRole('status').textContent).toBe('9 projects shown')
    expect(screen.queryByRole('button', { name: /View all/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Preview screenshot of/ })).toHaveLength(9)
  })

  it('preserves router history state, other query parameters and fragments when resetting filters', () => {
    const state = { __NA: true, marker: 'router-state' }
    window.history.replaceState(
      state,
      '',
      '/projects?q=Commerce&category=back-end&campaign=preview#main-content',
    )
    render(React.createElement(ProjectsIndex, { projects }))
    expect(screen.getByRole('status').textContent).toBe('1 projects shown')
    fireEvent.click(screen.getByRole('button', { name: 'Reset all filters' }))
    expect(screen.getByRole('status').textContent).toBe('3 projects shown')
    expect(window.location.search).toBe('?campaign=preview')
    expect(window.location.hash).toBe('#main-content')
    expect(window.history.state).toEqual(state)
  })

  it('explains no search results without implying projects were deleted', () => {
    render(React.createElement(ProjectsIndex, { projects }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no such project' } })
    expect(screen.getByRole('status').textContent).toBe('0 projects shown')
    expect(screen.getByText(/No projects match this search and category/)).toBeDefined()
  })
})
