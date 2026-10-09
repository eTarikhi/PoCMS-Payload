/**
 * Tests for the server sections in `src/app/(frontend)/components/portfolio/sections/`.
 *
 * The expected strings come from the baseline text extract of the original home page
 * (`/tmp/parity/vtarikhi-home.text.txt`, one region at a time). The content comes from the shared
 * fixtures, which are built from `src/app/(frontend)/data/database.json`. No database is needed.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'

import { AboutSection } from '../../src/app/(frontend)/components/portfolio/sections/AboutSection'
import { ArticlesSection } from '../../src/app/(frontend)/components/portfolio/sections/ArticlesSection'
import { CertificatesSection } from '../../src/app/(frontend)/components/portfolio/sections/CertificatesSection'
import { ProjectsSection } from '../../src/app/(frontend)/components/portfolio/sections/ProjectsSection'
import { ServicesSection } from '../../src/app/(frontend)/components/portfolio/sections/ServicesSection'
import { SkillsSection } from '../../src/app/(frontend)/components/portfolio/sections/SkillsSection'
import { mapPortfolioContent } from '../../src/app/(frontend)/lib/portfolio/mappers'
import type { CertificateItem, PortfolioContent } from '../../src/app/(frontend)/lib/portfolio/types'
import { toPayloadDocs } from '../helpers/portfolio-fixtures'
import { VisibleIntersectionObserver } from '../helpers/visible-intersection-observer'

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', VisibleIntersectionObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const content: PortfolioContent = mapPortfolioContent(toPayloadDocs())

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

const renderSection = (element: ReturnType<typeof createElement>) => {
  const { container } = render(element)
  return container
}

describe('section ids', () => {
  it('keeps the original anchor ids for the six sections', () => {
    const about = renderSection(createElement(AboutSection, { about: content.about }))
    const services = renderSection(createElement(ServicesSection, { services: content.services }))
    const skills = renderSection(
      createElement(SkillsSection, {
        skills: content.skills,
        experiences: content.experiences,
        educations: content.educations,
      }),
    )
    const certificates = renderSection(
      createElement(CertificatesSection, { certificates: content.certificates }),
    )
    const projects = renderSection(createElement(ProjectsSection, { projects: content.projects }))
    const articles = renderSection(createElement(ArticlesSection, { articles: content.articles }))

    expect(about.querySelector('section')?.id).toBe('about')
    expect(services.querySelector('section')?.id).toBe('service')
    expect(skills.querySelector('section')?.id).toBe('skill')
    expect(certificates.querySelector('section')?.id).toBe('certificate')
    expect(projects.querySelector('section')?.id).toBe('project')
    expect(articles.querySelector('section')?.id).toBe('article')
  })
})

describe('AboutSection', () => {
  it('matches the baseline text', () => {
    const container = renderSection(createElement(AboutSection, { about: content.about }))
    expectInOrder(textOf(container), [
      '12+',
      'Years',
      'of working experience as Web Designer & Developer',
      'For approximately 12 years, I have continuously improved myself, embracing innovation and achieving success in areas such as content management systems, survey analysis systems, online e-commerce management panels, and integration systems.',
      'Sponsorship and Work Permit:',
      "I don't have currently a work permit in EU or USA, but if the employer sponsors me, I am eligible to work wherever the employer wants and also i'm open to immigration.",
      'Interests',
      'In my professional career, I have always remained open to learning.',
      'Robotics',
      'Machine Learning',
      'Artificial Intelligence',
      'Big Data and Data Analysis',
    ])
  })

  it('renders nothing when the singleton is missing', () => {
    const container = renderSection(createElement(AboutSection, { about: null }))
    expect(container.innerHTML).toBe('')
  })
})

describe('ServicesSection', () => {
  it('matches the baseline text', () => {
    const container = renderSection(createElement(ServicesSection, { services: content.services }))
    expectInOrder(textOf(container), [
      'My Services',
      'Hiring Me ..',
      'Back-End Development',
      'PHP, OOP, MVC, MySQL, PDO',
      'RESTful API, SOAP, GraphQL',
      'Ajax, JavaScript, TypeScript,',
      'Frameworks ( Laravel, Symfony, .. )',
      'CMS & CRM ( WordPress, Joomla, .. )',
      'Shopify, WooCommerce, OpenCart, Presta',
      'Front-End Development',
      'HTML5, CSS3, Bootstrap 5',
      'JavaScript, TypeScript, ES6',
      'React, Next.js, Vue.js',
      'Vite, WebPack, JQuery',
      'Elementor & UI Kits',
      'Responsive Design',
      'Data Analysis and SEO',
      'Bing & Yandex Webmaster Tools',
      'Facebook Meta Webmaster Tools',
      'Google Analytics and Webmaster Tools',
      'Search Engine Optimization',
      'Google PageSpeed Optimization',
      'Database and Server Cache Optimization',
      'Network, Server and WHM',
      'Linux Web Server Configuration (CP, DA, PL)',
      'WHM (Cpanel, Direct Admin, Plesk) Management',
      'WHMCS, CloudFlare & DNS Server Management',
      'Web Server Security and Data Protection',
      'CloudFlare Load Balancing & Cloud Configuration',
    ])
  })

  it('renders an icon for every service, using the CMS icon keys', () => {
    const container = renderSection(createElement(ServicesSection, { services: content.services }))
    const icons = Array.from(container.querySelectorAll('.bg-icon svg')).map(
      (svg) => svg.getAttribute('class') ?? '',
    )

    // The four keys seeded in src/seed/services.ts. Each one must map to a real icon.
    const expectedClasses = ['fa-code', 'fa-crop-alt', 'fa-laptop-code', 'fa-code-branch']
    expect(icons).toHaveLength(content.services.items.length)
    expectedClasses.forEach((cls, index) => {
      expect(icons[index], `icon ${index}`).toContain(cls)
    })
  })

  it('links the hiring CTA when present and omits it when not', () => {
    const withCta = renderSection(createElement(ServicesSection, { services: content.services }))
    const cta = withCta.querySelector('a.btn-primary') as HTMLAnchorElement
    expect(cta.textContent).toBe('Hiring Me ..')
    expect(cta.getAttribute('target')).toBe('_blank')
    expect(cta.getAttribute('href')).toBe(content.services.hiring?.url)

    const withoutCta = renderSection(
      createElement(ServicesSection, { services: { items: [], hiring: null } }),
    )
    expect(withoutCta.querySelector('a.btn-primary')).toBeNull()
  })
})

describe('SkillsSection', () => {
  it('matches the baseline text and renders one bar per skill', () => {
    const container = renderSection(
      createElement(SkillsSection, {
        skills: content.skills,
        experiences: content.experiences,
        educations: content.educations,
      }),
    )
    expectInOrder(textOf(container), [
      'Skills & Experience',
      'Some of my top skills listed as below.',
      'My Skills',
      'HTML, CSS, Bootstrap',
      'React, Next.js, Vue.js',
      'PHP, MySQL, OOP',
      'JavaScript, TypeScript',
      'NodeJS, Express',
      'Laravel, Symfony',
      'Experience',
      'Education',
      'IT Department Manager',
      '2022 - 2023',
      'Tiryaki İlaç LTD. ŞTİ. Istanbul, Turkey',
      'Chief Technology Officer (CTO)',
      '2023.01 - 2023.06',
      'Proxima Agency LTD. Istanbul, Turkey',
      'e-Commerce CMS Developer',
      '2019 - 2022',
      'Cadde10 İnteraktif LTD. Turkey',
      'Web Developer & Manager',
      '2011 - 2019',
      'ARK Informatic Services, Tabriz, Iran',
      'Bachelor in Computer Software Engineering',
      '2014 - Leaved',
      'Payam-e Nur University / Tabriz, East Azerbaijan Province, Iran',
      'Theoretical Diploma - Mathematics & Physics',
      '2001 - 2007',
      'Ferdosi Pre-University Center / Tabriz, East Azerbaijan Province, Iran',
    ])

    const totalSkills = content.skills.frontend.length + content.skills.backend.length
    expect(container.querySelectorAll('.progress-bar')).toHaveLength(totalSkills)
    expect(container.querySelectorAll('#tab-1 .col-sm-6')).toHaveLength(content.experiences.length)
    expect(container.querySelectorAll('#tab-2 .col-sm-6')).toHaveLength(content.educations.length)
  })
})

describe('CertificatesSection', () => {
  it('matches the baseline text', () => {
    const container = renderSection(
      createElement(CertificatesSection, { certificates: content.certificates }),
    )
    expectInOrder(textOf(container), [
      'Recent Certificates',
      'All Certificates >',
      'Become a Full-Stack Web Developer',
      'Issued by: LinkedIn Learning',
      'January 9, 2025',
      'View Certificate →',
      'JavaScript Foundations Professional Certificate',
      'Issued by: LinkedIn & Mozilla',
      'January 28, 2025',
      'View Certificate →',
      'Developing for Web Performance',
      'Issued by: LinkedIn',
      'February 9, 2025',
      'View Certificate →',
    ])
  })

  it('omits the certificate link when the item has none', () => {
    const noLink: CertificateItem = {
      id: 'x',
      title: 'No link',
      issuer: 'Issuer',
      date: 'March 1, 2025',
      imageUrl: '/images/certificates/x.webp',
      link: null,
    }
    const container = renderSection(createElement(CertificatesSection, { certificates: [noLink] }))
    expect(container.textContent).not.toContain('View Certificate')
    expect(container.querySelectorAll('.service-item')).toHaveLength(1)
  })
})

describe('ProjectsSection', () => {
  it('matches the baseline text and renders every project under "All"', () => {
    const container = renderSection(createElement(ProjectsSection, { projects: content.projects }))
    expectInOrder(textOf(container), [
      'My Projects',
      'All Projects',
      'Front-End',
      'Back-End',
      'CMS-CRM',
    ])
    expect(container.querySelector('#portfolio-flters')).not.toBeNull()
    expect(container.querySelectorAll('.portfolio-item')).toHaveLength(
      content.projects.items.length,
    )
  })
})

describe('ArticlesSection', () => {
  it('matches the baseline text for every article (D-12)', () => {
    const container = renderSection(createElement(ArticlesSection, { articles: content.articles }))
    const text = textOf(container)

    expectInOrder(text, ['Latest Articles', 'All Articles >'])
    for (const article of content.articles) {
      expectInOrder(text, [article.title, 'Issued:', article.author, article.readTime, 'read'])
    }
    expect(container.querySelectorAll('article')).toHaveLength(content.articles.length)
  })

  it('shows the six baseline titles, in order, with their dates', () => {
    const container = renderSection(createElement(ArticlesSection, { articles: content.articles }))
    expectInOrder(textOf(container), [
      'Full-Stack Geliştiriciler İçin DevOps: Temel Kavramlar ve Pratikler İçin Yol Haritası',
      'February 2, 2025',
      'The Best Code Editors: A Comprehensive Guide',
      'January 15, 2025',
      'Essential DevOps Toolchains for Every Syllabus: Modern Software Development',
      'January 6, 2025',
      'DevOps Syllabus You Need to Learn as a Full-Stack Developer',
      'January 1, 2025',
      'Most Used Laravel Packages: A Comprehensive Guide',
      'December 30, 2024',
      'Becoming a full-stack developer',
      'December 4, 2024',
    ])
  })

  it('points empty cover images at the placeholder', () => {
    const container = renderSection(
      createElement(ArticlesSection, {
        articles: [{ ...content.articles[0], imageUrl: '' }],
      }),
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toContain('placeholder.svg')
  })
})
