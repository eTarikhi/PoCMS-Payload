/**
 * Tests for the shared shell (article page spec §4 and §4.3).
 *
 * `SiteChrome` is the only place Navigation, Footer, BackToTop, and BootstrapClient are composed.
 * These tests check that every page that uses it gets the same navigation and footer markup, that
 * the skip link comes first, and that section links are absolute so they work from any route.
 * Content comes from the shared fixtures. No database is needed.
 */

import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { SiteChrome } from '../../src/app/(frontend)/components/layout/SiteChrome'
import { mapPortfolioContent } from '../../src/app/(frontend)/lib/mappers'
import { toPayloadDocs } from '../helpers/portfolio-fixtures'

afterEach(() => {
  cleanup()
})

const footer = mapPortfolioContent(toPayloadDocs()).footer

// Two different page bodies, to stand in for the homepage and an article page.
const homeBody = createElement('main', { id: 'main-content' }, createElement('section', null, 'Home'))
const articleBody = createElement(
  'article',
  { id: 'main-content' },
  createElement('h1', null, 'An article'),
  createElement('p', null, 'Body text'),
)

describe('SiteChrome', () => {
  it('puts the skip link first and points it at #main-content', () => {
    const { container } = render(createElement(SiteChrome, { footer }, homeBody))
    const first = container.firstElementChild
    expect(first).not.toBeNull()
    expect(first?.tagName).toBe('A')
    expect(first?.getAttribute('href')).toBe('#main-content')
    expect(first?.textContent).toBe('Skip to content')
    expect(container.querySelector('#main-content')).not.toBeNull()
  })

  it('renders identical navigation and footer markup for every page that uses it', () => {
    const home = render(createElement(SiteChrome, { footer }, homeBody))
    const homeNav = home.container.querySelector('nav')?.outerHTML
    const homeFooter = home.container.querySelector('footer')?.outerHTML
    home.unmount()

    const article = render(createElement(SiteChrome, { footer }, articleBody))
    const articleNav = article.container.querySelector('nav')?.outerHTML
    const articleFooter = article.container.querySelector('footer')?.outerHTML

    expect(homeNav).toBeDefined()
    expect(homeFooter).toBeDefined()
    expect(articleNav).toBe(homeNav)
    expect(articleFooter).toBe(homeFooter)
  })

  it('points every section link at "/#section", so the links work on an article page', () => {
    const { container } = render(createElement(SiteChrome, { footer }, articleBody))
    const nav = container.querySelector('nav')
    expect(nav).not.toBeNull()
    const sectionLinks = Array.from(nav?.querySelectorAll('a') ?? [])
      .map((a) => a.getAttribute('href'))
      .filter((href) => href !== '/')
    expect(sectionLinks.length).toBeGreaterThan(0)
    for (const href of sectionLinks) {
      expect(href).toMatch(/^\/#[a-z]+$/)
    }
  })

  it('omits the footer when there is no footer data, and keeps the navigation', () => {
    const { container } = render(createElement(SiteChrome, { footer: null }, homeBody))
    expect(container.querySelector('footer')).toBeNull()
    expect(container.querySelector('nav')).not.toBeNull()
  })
})
