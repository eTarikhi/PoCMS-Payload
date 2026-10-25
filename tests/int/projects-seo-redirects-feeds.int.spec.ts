import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { governedEntities } from '@/access/permissions'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import { PayloadRedirects } from '@/app/(frontend)/components/seo/PayloadRedirects'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import {
  buildRobotsRules,
  buildRssFeedXml,
  buildSitemapEntries,
} from '@/app/(frontend)/lib/feeds'
import {
  buildLexicalDocument,
  lexicalHeadingNode,
  lexicalParagraphNode,
  lexicalTextNode,
} from '@/app/(frontend)/lib/lexical'
import { DEFAULT_SITE_SETTINGS, mapProjects } from '@/app/(frontend)/lib/mappers'
import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import { PROJECTS_HUB_PATH } from '@/app/(frontend)/lib/project-page'
import {
  matchRedirect,
  normalizeRedirectPath,
  resolveRedirectDestination,
  type RedirectLike,
} from '@/app/(frontend)/lib/redirects-utils'
import {
  buildArticleMetadata,
  buildBlogPostingJsonLd,
  buildPortfolioMetadata,
  buildProjectJsonLd,
  buildProjectMetadata,
  buildProjectsHubJsonLd,
  buildProjectsHubMetadata,
} from '@/app/(frontend)/lib/seo'
import { GET as getFeedXml } from '@/app/feed.xml/route'
import type { Article, Media, Project } from '@/payload-types'

const navigationMocks = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:302:${url}`)
  }),
  permanentRedirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:301:${url}`)
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

const redirectCacheMocks = vi.hoisted(() => ({
  findCachedRedirectMock: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    redirect: navigationMocks.redirectMock,
    permanentRedirect: navigationMocks.permanentRedirectMock,
    notFound: navigationMocks.notFoundMock,
  }
})

vi.mock('@/app/(frontend)/lib/redirects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/(frontend)/lib/redirects')>()
  return {
    ...actual,
    findCachedRedirect: redirectCacheMocks.findCachedRedirectMock,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const richBody = () =>
  buildLexicalDocument([
    lexicalHeadingNode('h2', 'Overview'),
    lexicalParagraphNode([
      lexicalTextNode(
        'Production-grade architecture with Payload CMS 3, Next.js App Router, and PostgreSQL.',
      ),
    ]),
  ])

const sampleMedia = (url: string, alt: string): Media => ({
  id: 99,
  alt,
  url,
  updatedAt: '2026-10-20T10:00:00.000Z',
  createdAt: '2026-10-20T10:00:00.000Z',
})

const sampleProjectsRaw = (): Project[] => [
  {
    id: 1,
    title: 'AlyaPanel Automation Suite',
    slug: 'alyapanel',
    excerpt: 'Multi-tenant e-commerce & CRM automation platform.',
    categories: ['back-end', 'cms-crm'],
    role: 'Lead Architect',
    year: '2025',
    techStack: ['PHP 8', 'Laravel', 'MySQL'],
    content: richBody() as Project['content'],
    placeHolder: '/images/projects/alyapanel-thumb.webp',
    src: '/images/projects/alyapanel.webp',
    url: 'https://alyapanel.example.com',
    updatedAt: '2026-10-15T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 2,
    title: 'PoCMS Portfolio Engine',
    slug: 'pocms-payload',
    excerpt: 'Headless portfolio & publishing hub powered by Payload 3.',
    categories: ['front-end', 'cms-crm'],
    role: 'Full-Stack Developer',
    year: '2026',
    techStack: ['Next.js', 'Payload CMS', 'TypeScript'],
    content: richBody() as Project['content'],
    placeHolder: '/images/projects/pocms-thumb.webp',
    src: '/images/projects/pocms.webp',
    url: 'https://vtarikhi.com',
    updatedAt: '2026-10-24T12:00:00.000Z',
    createdAt: '2026-10-01T12:00:00.000Z',
  },
  {
    id: 3,
    title: 'SepiWhite Storefront',
    slug: 'sepiwhite',
    excerpt: 'High-conversion cosmetics storefront without an on-site case study.',
    categories: ['front-end'],
    role: 'Frontend Engineer',
    year: '2024',
    techStack: ['Shopify', 'TypeScript'],
    content: null,
    placeHolder: '/images/projects/sepiwhite-thumb.webp',
    src: '/images/projects/sepiwhite.webp',
    url: 'https://sepiwhite.example.com',
    updatedAt: '2026-08-10T12:00:00.000Z',
    createdAt: '2026-08-01T12:00:00.000Z',
  },
]

describe('Improvement 1: /projects Archive Page with Tech-Stack/Category Filtering & Search', () => {
  it('renders ProjectsArchive in a uniform 3-column grid and filters by category, tech stack, and search', () => {
    const mapped = mapProjects(sampleProjectsRaw())
    const { container } = render(
      React.createElement(ProjectsArchive, {
        projects: mapped.items,
        labels: DEFAULT_SITE_SETTINGS.projectsSection,
      }),
    )

    expect(screen.getByRole('heading', { level: 1, name: 'My Projects' })).toBeDefined()
    expect(screen.getByText('Showing 3 of 3 projects')).toBeDefined()

    // Uniform 3-column grid (`col-lg-4 col-md-6`), no full-width col-12 banner card
    const cards = container.querySelectorAll('article.col-lg-4.col-md-6')
    expect(cards.length).toBe(3)
    expect(container.querySelectorAll('article.col-12').length).toBe(0)

    // Filter by "Case studies" (only items with pagePath)
    fireEvent.click(screen.getByRole('button', { name: 'Case studies' }))
    expect(screen.getByText('Showing 2 of 3 projects')).toBeDefined()
    expect(screen.queryByText('SepiWhite Storefront')).toBeNull()

    // Filter further by Tech Stack ("Laravel")
    const techFilterGroup = screen.getByRole('group', { name: 'Filter projects by technology' })
    const laravelFilterBtn = Array.from(techFilterGroup.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Laravel',
    )
    expect(laravelFilterBtn).toBeDefined()
    fireEvent.click(laravelFilterBtn!)
    expect(screen.getByText('Showing 1 of 3 projects')).toBeDefined()
    expect(screen.getByText('AlyaPanel Automation Suite')).toBeDefined()

    // Search query that yields empty state, then reset all filters
    const searchInput = screen.getByRole('searchbox', { name: 'Search projects' })
    fireEvent.change(searchInput, { target: { value: 'rust-wasm-nonexistent' } })
    expect(screen.getByText('Showing 0 of 3 projects')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByText('Showing 3 of 3 projects')).toBeDefined()

    // Search by role ("Lead Architect")
    fireEvent.change(searchInput, { target: { value: 'lead architect' } })
    expect(screen.getByText('Showing 1 of 3 projects')).toBeDefined()
    expect(screen.getByText('AlyaPanel Automation Suite')).toBeDefined()
  })

  it('builds /projects hub metadata & CollectionPage JSON-LD and links ProjectLayout back to /projects', () => {
    const mapped = mapProjects(sampleProjectsRaw())
    const meta = buildProjectsHubMetadata(DEFAULT_SITE_SETTINGS, 'https://vtarikhi.com')
    expect(meta.title).toBe('My Projects | Amir v.Tarikhi Live Resume')
    expect(meta.alternates?.canonical).toBe('https://vtarikhi.com/projects')
    expect(meta.alternates?.types?.['application/rss+xml']).toBe('https://vtarikhi.com/feed.xml')

    const jsonLd = buildProjectsHubJsonLd(
      mapped.items,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(jsonLd['@type']).toBe('CollectionPage')
    expect(jsonLd.url).toBe('https://vtarikhi.com/projects')
    const mainEntity = jsonLd.mainEntity as {
      numberOfItems: number
      itemListElement: Array<{ url: string }>
    }
    expect(mainEntity.numberOfItems).toBe(3)
    expect(mainEntity.itemListElement[0]?.url).toBe('https://vtarikhi.com/projects/alyapanel')
    expect(mainEntity.itemListElement[2]?.url).toBe('https://sepiwhite.example.com')

    const detail = mapProjectDetail(sampleProjectsRaw()[0]!)!
    render(React.createElement(ProjectLayout, { project: detail }))
    const backLink = screen.getByRole('link', { name: 'Back to projects' })
    expect(backLink.getAttribute('href')).toBe(PROJECTS_HUB_PATH)
  })
})

describe('Improvement 2: @payloadcms/plugin-seo Overrides & @payloadcms/plugin-redirects (301/302)', () => {
  it('registers plugin-seo (with SERP preview & generate endpoints) and plugin-redirects (with RBAC) in payload.config', async () => {
    const sanitized = await config

    for (const slug of ['articles', 'projects'] as const) {
      const col = sanitized.collections.find((c) => c.slug === slug)
      expect(col).toBeDefined()
      const metaGroup = col?.fields.find(
        (field) => 'name' in field && field.name === 'meta' && field.type === 'group',
      )
      expect(metaGroup).toBeDefined()
      if (metaGroup && 'fields' in metaGroup) {
        const subNames = metaGroup.fields
          .map((f) => ('name' in f ? f.name : undefined))
          .filter(Boolean)
        expect(subNames).toEqual(
          expect.arrayContaining(['overview', 'title', 'description', 'image', 'preview']),
        )
      }
    }

    const endpointPaths = (sanitized.endpoints ?? []).map((e) => e.path)
    expect(endpointPaths).toEqual(
      expect.arrayContaining([
        '/plugin-seo/generate-title',
        '/plugin-seo/generate-description',
        '/plugin-seo/generate-url',
        '/plugin-seo/generate-image',
      ]),
    )

    const redirectsCol = sanitized.collections.find((c) => c.slug === 'redirects')
    expect(redirectsCol).toBeDefined()
    expect(redirectsCol?.admin?.group).toBe('Site settings')
    const statusTypeField = redirectsCol?.fields.find(
      (f) => 'name' in f && f.name === 'type' && f.type === 'select',
    )
    expect(statusTypeField).toBeDefined()

    // RBAC governance includes redirects
    const entities = governedEntities(sanitized)
    expect(entities.some((e) => e.slug === 'redirects' && e.field === 'redirects')).toBe(true)
  })

  it('applies per-document SEO overrides (meta.title, meta.description, meta.image) to Articles and Projects metadata & JSON-LD', () => {
    const customOg = sampleMedia('/media/custom-seo-card.webp', 'Custom SERP Social Banner')

    const articleDoc: Article = {
      id: 10,
      title: 'Original Article Headline',
      slug: 'original-article',
      excerpt: 'Default article excerpt.',
      content: richBody() as Article['content'],
      publishedAt: '2026-10-20T09:00:00.000Z',
      meta: {
        title: 'Custom SEO Title — Search Optimized',
        description: 'Custom SERP meta description tailored for click-through.',
        image: customOg,
      },
      updatedAt: '2026-10-21T09:00:00.000Z',
      createdAt: '2026-10-20T09:00:00.000Z',
    }

    const mappedArticle = mapArticleDetail(articleDoc)!
    expect(mappedArticle.seo).toEqual({
      title: 'Custom SEO Title — Search Optimized',
      description: 'Custom SERP meta description tailored for click-through.',
      imageUrl: '/media/custom-seo-card.webp',
      imageAlt: 'Custom SERP Social Banner',
    })

    const articleMeta = buildArticleMetadata(
      mappedArticle,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(articleMeta.title).toBe('Custom SEO Title — Search Optimized')
    expect(articleMeta.description).toBe(
      'Custom SERP meta description tailored for click-through.',
    )
    expect(articleMeta.openGraph?.title).toBe('Custom SEO Title — Search Optimized')
    const ogImages = articleMeta.openGraph?.images as Array<{ url: string; alt: string }>
    expect(ogImages[0]?.url).toBe('https://vtarikhi.com/media/custom-seo-card.webp')
    expect(ogImages[0]?.alt).toBe('Custom SERP Social Banner')

    const articleJsonLd = buildBlogPostingJsonLd(
      mappedArticle,
      null,
      null,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(articleJsonLd.description).toBe(
      'Custom SERP meta description tailored for click-through.',
    )
    expect(articleJsonLd.image).toBe('https://vtarikhi.com/media/custom-seo-card.webp')

    // Project SEO override
    const projectDoc: Project = {
      ...sampleProjectsRaw()[0]!,
      meta: {
        title: 'AlyaPanel Case Study | Enterprise SaaS Architecture',
        description: 'Deep dive into multi-tenant Laravel & MySQL automation.',
        image: customOg,
      },
    }
    const mappedProject = mapProjectDetail(projectDoc)!
    const projectMeta = buildProjectMetadata(
      mappedProject,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(projectMeta.title).toBe('AlyaPanel Case Study | Enterprise SaaS Architecture')
    expect(projectMeta.description).toBe(
      'Deep dive into multi-tenant Laravel & MySQL automation.',
    )
    const projectJsonLd = buildProjectJsonLd(
      mappedProject,
      null,
      null,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(projectJsonLd.description).toBe(
      'Deep dive into multi-tenant Laravel & MySQL automation.',
    )
    expect(projectJsonLd.image).toBe('https://vtarikhi.com/media/custom-seo-card.webp')
  })

  it('normalizes paths, resolves 301/302 internal & custom redirects, prevents self-loops, and executes PayloadRedirects', async () => {
    expect(normalizeRedirectPath('old-blog/post/')).toBe('/old-blog/post')
    expect(
      normalizeRedirectPath('https://vtarikhi.com/legacy/page/?utm=1', 'https://vtarikhi.com'),
    ).toBe('/legacy/page')

    const rules: RedirectLike[] = [
      {
        from: '/articles/legacy-devops',
        type: '301',
        to: {
          type: 'reference',
          reference: {
            relationTo: 'articles',
            value: { slug: 'modern-devops-roadmap' },
          },
        },
      },
      {
        from: '/cv-temp',
        type: '302',
        to: {
          type: 'custom',
          url: 'https://linkedin.com/in/etarikhi',
        },
      },
      {
        from: '/portfolio/alyapanel',
        type: '301',
        to: {
          type: 'reference',
          reference: {
            relationTo: 'projects',
            value: { slug: 'alyapanel' },
          },
        },
      },
      {
        from: '/self-loop',
        type: '301',
        to: {
          type: 'custom',
          url: '/self-loop/',
        },
      },
    ]

    expect(resolveRedirectDestination(rules[0]!)).toBe('/articles/modern-devops-roadmap')
    expect(resolveRedirectDestination(rules[2]!)).toBe('/projects/alyapanel')

    expect(matchRedirect('/articles/legacy-devops/', rules, 'https://vtarikhi.com')).toEqual({
      from: '/articles/legacy-devops',
      destination: '/articles/modern-devops-roadmap',
      statusCode: 301,
    })

    expect(matchRedirect('/CV-TEMP?ref=nav', rules, 'https://vtarikhi.com')).toEqual({
      from: '/cv-temp',
      destination: 'https://linkedin.com/in/etarikhi',
      statusCode: 302,
    })

    // Self-loop is ignored safely
    expect(matchRedirect('/self-loop', rules, 'https://vtarikhi.com')).toBeNull()

    // PayloadRedirects component triggers permanentRedirect for 301, redirect for 302, and notFound on miss
    redirectCacheMocks.findCachedRedirectMock.mockResolvedValueOnce({
      from: '/old-url',
      destination: '/projects/alyapanel',
      statusCode: 301,
    })
    await expect(PayloadRedirects({ url: '/old-url' })).rejects.toThrow(
      'NEXT_REDIRECT:301:/projects/alyapanel',
    )
    expect(navigationMocks.permanentRedirectMock).toHaveBeenCalledWith('/projects/alyapanel')

    redirectCacheMocks.findCachedRedirectMock.mockResolvedValueOnce({
      from: '/promo',
      destination: 'https://linkedin.com/in/etarikhi',
      statusCode: 302,
    })
    await expect(PayloadRedirects({ url: '/promo' })).rejects.toThrow(
      'NEXT_REDIRECT:302:https://linkedin.com/in/etarikhi',
    )
    expect(navigationMocks.redirectMock).toHaveBeenCalledWith('https://linkedin.com/in/etarikhi')

    redirectCacheMocks.findCachedRedirectMock.mockResolvedValueOnce(null)
    await expect(PayloadRedirects({ url: '/missing-page' })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(navigationMocks.notFoundMock).toHaveBeenCalledTimes(1)
  })
})

describe('Improvement 3: Dynamic sitemap.ts, robots.ts & RSS Feed (/feed.xml)', () => {
  const sampleArticlesRaw = (): Partial<Article>[] => [
    {
      id: 1,
      title: 'TypeScript & Payload <v3> Architecture',
      slug: 'ts-payload-v3',
      excerpt: 'Building fast & safe headless apps with <Lexical> & Postgres.',
      content: richBody() as Article['content'],
      publishedAt: '2026-10-22T08:00:00.000Z',
      updatedAt: '2026-10-23T08:00:00.000Z',
    },
    {
      id: 2,
      title: 'External LinkedIn Note',
      slug: 'external-note',
      excerpt: 'Published externally with no on-site body.',
      link: 'https://www.linkedin.com/pulse/external-note',
      content: null,
      description: '',
      publishedAt: '2026-10-10T08:00:00.000Z',
    },
  ]

  it('generates sitemap entries covering /, /articles, /projects, /articles/[slug], and /projects/[slug]', () => {
    const entries = buildSitemapEntries({
      articles: sampleArticlesRaw(),
      projects: sampleProjectsRaw(),
      site: 'https://vtarikhi.com',
    })

    const urls = entries.map((entry) => entry.url)
    expect(urls).toEqual([
      'https://vtarikhi.com',
      'https://vtarikhi.com/articles',
      'https://vtarikhi.com/projects',
      'https://vtarikhi.com/articles/ts-payload-v3',
      'https://vtarikhi.com/projects/alyapanel',
      'https://vtarikhi.com/projects/pocms-payload',
    ])
    // External-only article and project without rich-text case study are excluded from on-site sitemap URLs
    expect(urls).not.toContain('https://vtarikhi.com/articles/external-note')
    expect(urls).not.toContain('https://vtarikhi.com/projects/sepiwhite')
  })

  it('generates robots.txt rules allowing public routes, disallowing /admin & /api, and referencing /sitemap.xml', () => {
    const rules = buildRobotsRules('https://vtarikhi.com')
    expect(rules.sitemap).toBe('https://vtarikhi.com/sitemap.xml')
    expect(rules.host).toBe('https://vtarikhi.com')
    expect(rules.rules).toEqual([
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api', '/api/'],
      },
    ])
  })

  it('generates valid, XML-escaped RSS 2.0 + Atom feed XML and advertises /feed.xml in portfolio metadata', async () => {
    const homeMeta = buildPortfolioMetadata(DEFAULT_SITE_SETTINGS, 'https://vtarikhi.com')
    expect(homeMeta.alternates?.types?.['application/rss+xml']).toBe(
      'https://vtarikhi.com/feed.xml',
    )

    const xml = buildRssFeedXml({
      articles: sampleArticlesRaw(),
      projects: sampleProjectsRaw(),
      settings: DEFAULT_SITE_SETTINGS,
      site: 'https://vtarikhi.com',
    })

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain(
      '<atom:link href="https://vtarikhi.com/feed.xml" rel="self" type="application/rss+xml" />',
    )
    // Special XML characters (&, <, >) are escaped properly
    expect(xml).toContain(
      '<title>TypeScript &amp; Payload &lt;v3&gt; Architecture</title>',
    )
    expect(xml).toContain(
      '<description>Building fast &amp; safe headless apps with &lt;Lexical&gt; &amp; Postgres.</description>',
    )
    // Covers both articles and project case studies sorted newest-first
    const pocmsIdx = xml.indexOf('https://vtarikhi.com/projects/pocms-payload')
    const articleIdx = xml.indexOf('https://vtarikhi.com/articles/ts-payload-v3')
    const alyaIdx = xml.indexOf('https://vtarikhi.com/projects/alyapanel')
    expect(pocmsIdx).toBeGreaterThan(-1)
    expect(articleIdx).toBeGreaterThan(pocmsIdx)
    expect(alyaIdx).toBeGreaterThan(articleIdx)

    // Route handler falls back cleanly and returns application/rss+xml even without a live Postgres daemon
    const response = await getFeedXml()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8')
    const body = await response.text()
    expect(body).toContain('<rss version="2.0"')
  })
})
