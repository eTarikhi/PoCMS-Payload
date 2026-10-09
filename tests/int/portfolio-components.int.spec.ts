/**
 * Behaviour tests for the client islands in `src/app/(frontend)/components/portfolio/`.
 *
 * jsdom with @testing-library/react. The timings and effects come from the original vTarikhi components.
 * No database is needed.
 */

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackToTop } from '../../src/app/(frontend)/components/portfolio/layout/BackToTop'
import { Navigation } from '../../src/app/(frontend)/components/portfolio/layout/Navigation'
import { ProjectsGrid } from '../../src/app/(frontend)/components/portfolio/sections/ProjectsGrid'
import { getFooterIcon, getServiceIcon } from '../../src/app/(frontend)/components/portfolio/icons'
import { CoverImage } from '../../src/app/(frontend)/components/portfolio/ui/CoverImage'
import { EmailReveal } from '../../src/app/(frontend)/components/portfolio/ui/EmailReveal'
import { ProgressBar } from '../../src/app/(frontend)/components/portfolio/ui/ProgressBar'
import { TypingEffect } from '../../src/app/(frontend)/components/portfolio/ui/TypingEffect'
import type { ProjectFilter, ProjectItem } from '../../src/app/(frontend)/lib/portfolio/types'
import { VisibleIntersectionObserver } from '../helpers/visible-intersection-observer'

/** Sets window.scrollY, which jsdom leaves read-only. */
const setScrollY = (y: number) => {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y })
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', VisibleIntersectionObserver)
  setScrollY(0)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TypingEffect', () => {
  it('types each text, pauses, deletes, then moves to the next text', () => {
    vi.useFakeTimers()
    const { container } = render(
      createElement(TypingEffect, {
        texts: ['Ab', 'Cd'],
        typeSpeed: 100,
        deleteSpeed: 20,
        pauseTime: 200,
        infinite: true,
      }),
    )
    const el = container.querySelector('.typing-effect') as HTMLElement
    // The cursor span is " | " after the typed text, so strip that suffix.
    const shown = () => (el.textContent ?? '').replace(/ \| $/, '')

    const seen: string[] = []
    for (let t = 0; t < 4000; t += 10) {
      act(() => {
        vi.advanceTimersByTime(10)
      })
      const value = shown()
      if (seen[seen.length - 1] !== value) seen.push(value)
    }

    // One cycle is: empty, type "Ab" in steps, delete to empty, then type "Cd" and delete it again.
    const cycle = ['', 'A', 'Ab', 'A', '', 'C', 'Cd', 'C']
    expect(seen.slice(0, 8)).toEqual(cycle)
    // infinite=true: the cycle repeats instead of stopping.
    expect(seen.slice(8, 16)).toEqual(cycle)
  })

  it('renders the cursor span with the given colours', () => {
    const { container } = render(
      createElement(TypingEffect, { texts: ['Hi'], color: 'light', cursorColor: 'light' }),
    )
    const outer = container.querySelector('.typing-effect') as HTMLElement
    expect(outer.style.position).toBe('relative')
    expect(container.querySelector('.cursor')?.textContent).toBe('| ')
  })
})

describe('EmailReveal', () => {
  it('shows the placeholder, then a mailto link after a click', () => {
    render(createElement(EmailReveal, { email: 'amir@example.com', className: 'text-reset' }))

    const trigger = screen.getByText('Click to reveal email')
    expect(trigger.getAttribute('title')).toBe('Click to reveal email')

    fireEvent.click(trigger)

    const link = screen.getByRole('link', { name: 'amir@example.com' })
    expect(link.getAttribute('href')).toBe('mailto:amir@example.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.className).toBe('text-reset')
    expect(screen.queryByText('Click to reveal email')).toBeNull()
  })
})

describe('ProjectsGrid filter', () => {
  const filters: ProjectFilter[] = [
    { label: 'All Projects', value: '*' },
    { label: 'Front-End', value: 'front-end' },
    { label: 'Back-End', value: 'back-end' },
  ]

  const items: ProjectItem[] = [
    {
      id: 'a',
      title: 'Alpha',
      categories: ['front-end'],
      thumbnailUrl: '/images/projects/a.webp',
      imageUrl: '/images/projects/a-full.webp',
      url: 'https://a.example',
    },
    {
      id: 'b',
      title: 'Beta',
      categories: ['back-end'],
      thumbnailUrl: '/images/projects/b.webp',
      imageUrl: '/images/projects/b-full.webp',
      url: 'https://b.example',
    },
    {
      id: 'c',
      title: 'Gamma',
      categories: ['front-end', 'back-end'],
      thumbnailUrl: '/images/projects/c.webp',
      imageUrl: '/images/projects/c-full.webp',
      url: 'https://c.example',
    },
  ]

  it('renders the title, the filter list, and every project under "All"', () => {
    const { container } = render(createElement(ProjectsGrid, { filters, items }))

    expect(screen.getByRole('heading', { name: 'My Projects' })).toBeTruthy()
    expect(container.querySelector('#portfolio-flters')).not.toBeNull()
    expect(container.querySelectorAll('.portfolio-item')).toHaveLength(3)
    expect(screen.getByText('All Projects').className).toBe('m-3 active')
  })

  it('shows only matching projects after the filter delay', async () => {
    const { container } = render(createElement(ProjectsGrid, { filters, items }))

    fireEvent.click(screen.getByText('Front-End'))

    // The button highlights at once.
    expect(screen.getByText('Front-End').className).toBe('m-3 active')

    await waitFor(() => {
      expect(container.querySelectorAll('.portfolio-item')).toHaveLength(2)
    })
    expect(screen.getByLabelText('Visit Alpha')).toBeTruthy()
    expect(screen.getByLabelText('Visit Gamma')).toBeTruthy()
    expect(screen.queryByLabelText('Visit Beta')).toBeNull()
  })

  it('links the eye button to the full image and the link button to the project', async () => {
    render(createElement(ProjectsGrid, { filters, items }))

    const eye = screen.getByLabelText('View full image of Alpha') as HTMLAnchorElement
    expect(eye.getAttribute('href')).toBe('/images/projects/a-full.webp')

    const visit = screen.getByLabelText('Visit Alpha') as HTMLAnchorElement
    expect(visit.getAttribute('href')).toBe('https://a.example')
    expect(visit.getAttribute('rel')).toBe('noopener noreferrer')
  })
})

describe('BackToTop', () => {
  it('appears after scrolling past 300px and hides again above that line', async () => {
    const { container } = render(createElement(BackToTop))
    expect(container.querySelector('.back-to-top')).toBeNull()

    setScrollY(301)
    fireEvent.scroll(window)
    await waitFor(() => {
      expect(container.querySelector('.back-to-top')).not.toBeNull()
    })

    setScrollY(300)
    fireEvent.scroll(window)
    await waitFor(() => {
      expect(container.querySelector('.back-to-top')).toBeNull()
    })
  })
})

describe('Navigation', () => {
  it('adds d-flex to the bar only after scrolling past 300px', async () => {
    const { container } = render(createElement(Navigation))
    const nav = container.querySelector('nav') as HTMLElement
    expect(nav.className).not.toContain('d-flex')

    setScrollY(400)
    fireEvent.scroll(window)
    await waitFor(() => {
      expect(nav.className).toContain('d-flex')
    })
  })

  it('keeps the original hash targets and points the brand to "/"', () => {
    const { container } = render(createElement(Navigation))
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '/',
      '#home',
      '#about',
      '#skill',
      '/',
      '#service',
      '#project',
      '#contact',
    ])
    expect(container.querySelector('#navbarCollapse')).not.toBeNull()
  })
})

describe('ProgressBar', () => {
  it('animates to its value once it is in view', async () => {
    render(createElement(ProgressBar, { id: 's1', value: 85, label: 'PHP', color: 'success' }))

    expect(screen.getByText('0%')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeTruthy()
    })
    expect(screen.getByText('PHP')).toBeTruthy()
  })
})

describe('CoverImage', () => {
  it('switches to the fallback when the image fails, and stops after the fallback fails', () => {
    const { container } = render(
      createElement(CoverImage, {
        src: '/images/articles/missing.webp',
        alt: 'Cover',
        fallbackSrc: '/placeholder.svg',
        width: 400,
        height: 255,
      }),
    )
    const img = container.querySelector('img') as HTMLImageElement

    fireEvent.error(img)
    expect(img.src.endsWith('/placeholder.svg')).toBe(true)

    // A second error on the fallback must not change src again.
    const afterFirst = img.src
    fireEvent.error(img)
    expect(img.src).toBe(afterFirst)
  })

  it('shows the fallback straight away when src is empty', () => {
    const { container } = render(
      createElement(CoverImage, {
        src: '',
        alt: 'Cover',
        fallbackSrc: '/placeholder.svg',
        width: 400,
        height: 255,
      }),
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toContain('placeholder.svg')
  })
})

describe('icon maps', () => {
  it('resolves every key used by the original site and rejects prototype keys', () => {
    for (const key of ['faCode', 'faCropAlt', 'faLaptopCode', 'faCodeBranch']) {
      expect(getServiceIcon(key)).not.toBeNull()
    }
    for (const key of [
      'faFacebookF',
      'faXTwitter',
      'faInstagram',
      'faLinkedin',
      'faGithub',
      'faWhatsapp',
      'faWhatsappc',
      'faGem',
      'faHome',
      'faEnvelope',
      'faPhoneFlip',
    ]) {
      expect(getFooterIcon(key)).not.toBeNull()
    }
    expect(getServiceIcon('constructor')).toBeNull()
    expect(getFooterIcon('toString')).toBeNull()
    expect(getFooterIcon('missing')).toBeNull()
  })
})
