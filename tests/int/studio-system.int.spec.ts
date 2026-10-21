import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FrontendError from '@/app/(frontend)/error'
import FrontendLoading from '@/app/(frontend)/loading'
import robots from '@/app/(frontend)/robots'
import { publicSitemapEntries } from '@/app/(frontend)/lib/discovery'

afterEach(cleanup)

describe('Public app reliability', () => {
  it('offers recovery without exposing an exception or replacing CMS content with sample data', () => {
    const reset = vi.fn()
    render(
      React.createElement(FrontendError, {
        error: new Error('private database hostname and credentials'),
        reset,
      }),
    )
    expect(screen.queryByText(/private database/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again ↻' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Return home' }).getAttribute('href')).toBe('/')
  })
  it('announces loading once and marks its main region busy', () => {
    render(React.createElement(FrontendLoading))
    expect(screen.getByRole('status').textContent).toBe('Loading portfolio…')
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true')
  })
  it('includes only public archives and supplied local article slugs in the sitemap', () => {
    const entries = publicSitemapEntries('https://example.com/', ['hello', 'hello', '', 'a/b'])
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://example.com/',
      'https://example.com/projects',
      'https://example.com/articles',
      'https://example.com/articles/hello',
      'https://example.com/articles/a%2Fb',
    ])
    expect(entries.some((entry) => entry.url.includes('/admin'))).toBe(false)
  })
  it('discourages crawling admin/API routes and publishes a sitemap location', () => {
    const config = robots()
    expect(config.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] })
    expect(String(config.sitemap)).toMatch(/\/sitemap.xml$/)
  })
})
