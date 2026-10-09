/**
 * Tests for the shell of the home page: hero, footer, JSON-LD, and metadata.
 *
 * Expected text comes from the baseline text extract of the original home page
 * (`/tmp/parity/vtarikhi-home.text.txt`). Content comes from the shared fixtures, which are built from
 * `src/app/(frontend)/data/database.json`. No database is needed.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Footer } from '../../src/app/(frontend)/components/portfolio/layout/Footer'
import { Hero } from '../../src/app/(frontend)/components/portfolio/layout/Hero'
import { JsonLd } from '../../src/app/(frontend)/components/portfolio/seo/JsonLd'
import { mapPortfolioContent } from '../../src/app/(frontend)/lib/portfolio/mappers'
import {
  buildPersonJsonLd,
  DEFAULT_SITE_URL,
  PROFILE_IMAGE_PATH,
  portfolioMetadata,
  siteUrl,
} from '../../src/app/(frontend)/lib/portfolio/seo'
import { toPayloadDocs } from '../helpers/portfolio-fixtures'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const content = mapPortfolioContent(toPayloadDocs())

/** Visible text of a rendered node, with runs of whitespace collapsed to one space. */
const textOf = (node: Element): string => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Asserts that each expected string appears in `text`, in the given order. */
const expectInOrder = (text: string, expected: string[]) => {
  let cursor = 0
  for (const line of expected) {
    const at = text.indexOf(line, cursor)
    expect(at, `missing or out of order: "${line}"`).toBeGreaterThanOrEqual(0)
    cursor = at + line.length
  }
}

describe('Hero', () => {
  it('matches the baseline text', () => {
    const { container } = render(createElement(Hero, { header: content.header! }))
    expectInOrder(textOf(container), ["I'm", 'Amir v.Tarikhi', 'Request CV'])
  })

  it('links the CV button to the header URL and keeps the typing effect', () => {
    const { container } = render(createElement(Hero, { header: content.header! }))
    const cv = screen.getByRole('link', { name: 'Request CV' })
    expect(cv.getAttribute('href')).toBe(content.header!.requestCV)
    expect(cv.className).toBe('btn btn-primary py-3 px-4 me-5')
    expect(container.querySelector('.typing-effect')).not.toBeNull()
  })

  it('keeps the original section id and profile image settings', () => {
    const { container } = render(createElement(Hero, { header: content.header! }))
    expect(container.querySelector('#home')).not.toBeNull()
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('alt')).toBe('Profile')
    expect(img.getAttribute('src')).toContain('profile.webp')
  })
})

describe('Footer', () => {
  it('matches the baseline text in order', () => {
    const { container } = render(createElement(Footer, { footer: content.footer! }))
    expectInOrder(textOf(container), [
      'Get connected with me on social networks:',
      'Amir v.Tarikhi',
      'Senior PHP Developer',
      'Junior NodeJS Developer',
      'Junior Laravel Developer',
      'E-Commerce CRM Developer',
      'Automation Panel Developer',
      'SEO Manager and Consultant',
      'My Profiles',
      'freelancer.com',
      'upwork.com',
      'fiverr.com',
      'themeforest.net',
      'Contact',
      '34805, Istanbul, Turkey',
      'Click to reveal email',
      '+90 552 570 0850',
      'Direct Whatsapp Call',
      'Copyright © 2023',
      'eTarikhi.com',
      ', All Rights Reserved.',
    ])
  })

  it('has the three column headings, matched exactly (a substring check would accept "Contacts")', () => {
    const { container } = render(createElement(Footer, { footer: content.footer! }))
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => textOf(h))
    expect(headings).toEqual(['Amir v.Tarikhi', 'My Profiles', 'Contact'])
  })

  it('renders one labelled social link for each social network', () => {
    const { container } = render(createElement(Footer, { footer: content.footer! }))
    const labels = Array.from(container.querySelectorAll('a[aria-label]')).map((a) =>
      a.getAttribute('aria-label'),
    )
    expect(labels).toEqual(['Facebook', 'Twitter', 'Instagram', 'LinkedIn', 'Github', 'Whatsapp'])
    const facebook = container.querySelector('a[aria-label="Facebook"]') as HTMLAnchorElement
    expect(facebook.getAttribute('href')).toBe('https://www.facebook.com/etarikhi')
    expect(facebook.getAttribute('target')).toBe('_blank')
  })

  it('reveals the email on click, then shows a mailto link', () => {
    render(createElement(Footer, { footer: content.footer! }))
    fireEvent.click(screen.getByText('Click to reveal email'))
    const link = screen.getByRole('link', { name: 'etarikhi@gmail.com' })
    expect(link.getAttribute('href')).toBe('mailto:etarikhi@gmail.com')
  })

  it('links the phone number as a tel: link', () => {
    render(createElement(Footer, { footer: content.footer! }))
    const phone = screen.getByRole('link', { name: '+90 552 570 0850' })
    expect(phone.getAttribute('href')).toBe('tel:00905525700850')
    expect(phone.getAttribute('title')).toBe('phone')
  })

  it('takes the copyright year from the CMS (D-6)', () => {
    const { container } = render(
      createElement(Footer, {
        footer: { ...content.footer!, copyright: { ...content.footer!.copyright, year: 2031 } },
      }),
    )
    expect(textOf(container)).toContain('Copyright © 2031')
  })
})

describe('JsonLd (Person)', () => {
  const person = buildPersonJsonLd(content.header, content.footer, 'https://vtarikhi.com')

  it('parses as JSON and describes the Person from the original schema', () => {
    const { container } = render(createElement(JsonLd, { data: person }))
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    ) as HTMLScriptElement
    const parsed = JSON.parse(script.textContent ?? '')

    expect(parsed['@context']).toBe('https://schema.org/')
    expect(parsed['@type']).toBe('Person')
    expect(parsed.name).toBe('Amir v.Tarikhi')
    expect(parsed.jobTitle).toBe('Senior Full-Stack Web Developer')
    expect(parsed.address.postalCode).toBe('34805')
  })

  it('derives telephone, email, and sameAs from the footer, without the WhatsApp link', () => {
    expect(person.telephone).toBe('+90 552 570 0850')
    expect(person.email).toBe('mailto:etarikhi@gmail.com')
    expect(person.sameAs).toEqual([
      'https://www.facebook.com/etarikhi',
      'https://www.twitter.com/eTarikhi',
      'https://www.instagram.com/eTarikhi',
      'https://www.linkedin.com/in/eTarikhi',
      'https://www.github.com/eTarikhi',
      'https://vtarikhi.com',
    ])
  })

  it('uses absolute URLs throughout', () => {
    expect(person.url).toBe('https://vtarikhi.com')
    expect(person.image).toBe('https://vtarikhi.com/images/profile.webp')
  })

  it('escapes "<" so a value cannot close the script element', () => {
    const hostile = buildPersonJsonLd(
      { ...content.header!, sureName: '</script><b>x' },
      content.footer,
      'https://vtarikhi.com',
    )
    const { container } = render(createElement(JsonLd, { data: hostile }))
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    ) as HTMLScriptElement
    expect(script.innerHTML).not.toContain('</script>')
    expect(JSON.parse(script.textContent ?? '').name).toBe('</script><b>x')
  })
})

describe('metadata (D-5, D-7)', () => {
  it('has no empty values', () => {
    const emptyPaths: string[] = []
    const walk = (value: unknown, path: string) => {
      if (value === '' || value === null || value === undefined) emptyPaths.push(path)
      else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`))
      else if (typeof value === 'object' && !(value instanceof URL)) {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`)
      }
    }
    walk(portfolioMetadata, 'metadata')
    expect(emptyPaths).toEqual([])
  })

  it('drops the invalid X-Content-Type-Options tag', () => {
    expect(JSON.stringify(portfolioMetadata)).not.toContain('X-Content-Type-Options')
  })

  it('points og:image at the profile photo on the site origin, with its real size', () => {
    const image = portfolioMetadata.openGraph?.images
    expect(Array.isArray(image)).toBe(true)
    const [first] = image as Array<{ url: string; width: number; height: number; type: string }>
    expect(first.url).toBe(`${siteUrl()}${PROFILE_IMAGE_PATH}`)
    expect(first.width).toBe(668)
    expect(first.height).toBe(689)
    expect(first.type).toBe('image/webp')
    expect(existsSync(join(process.cwd(), 'public', PROFILE_IMAGE_PATH))).toBe(true)
  })

  it('defaults the site URL to the canonical domain and honours NEXT_PUBLIC_SITE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(siteUrl()).toBe(DEFAULT_SITE_URL)

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.example.test//')
    expect(siteUrl()).toBe('https://staging.example.test')
  })
})
