import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Header } from '@/globals/Header'
import { ArticlesArchive } from '@/app/(frontend)/components/article/ArticlesArchive'
import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { HeaderBackground } from '@/app/(frontend)/components/headers/HeaderBackground'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import type { ArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import {
  DEFAULT_HEADER_STUDIO,
  DEFAULT_SITE_SETTINGS,
  mapHeader,
  mapHeaderStudio,
  mapPortfolioContent,
} from '@/app/(frontend)/lib/mappers'
import type { ProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import type { ArticleItem, ProjectItem } from '@/app/(frontend)/lib/types'
import { headerData } from '@/seed/header'
import type { Header as HeaderDoc } from '@/payload-types'

afterEach(() => {
  cleanup()
})

describe('Unified 3-Type Header Studio, Creative Backgrounds & Subpage Layouts', () => {
  it('structures Header global ("Header") into 3 Admin Studio tabs while keeping Home Hero root fields intact', () => {
    expect(Header.slug).toBe('header')
    expect(Header.label).toBe('Header')
    expect(Header.admin?.group).toBe('Site settings')

    const tabsField = Header.fields[0]
    expect(tabsField.type).toBe('tabs')
    if (tabsField.type !== 'tabs') return

    expect(tabsField.tabs).toHaveLength(3)
    expect(tabsField.tabs[0].label).toContain('Home Hero')
    expect(tabsField.tabs[1].label).toContain('Archive Headers')
    expect(tabsField.tabs[2].label).toContain('Detail Headers')

    // Tab 1 preserves unnamed root fields so Home page (/) and DB columns remain untouched
    const homeFieldNames = tabsField.tabs[0].fields
      .map((f) => ('name' in f ? f.name : null))
      .filter(Boolean)
    expect(homeFieldNames).toEqual([
      'sureName',
      'profileImage',
      'imageUrl',
      'requestCV',
      'professionTexts',
    ])

    // Tab 2 & Tab 3 expose group configs for /articles, /projects, and detail pages
    const archiveGroupNames = tabsField.tabs[1].fields
      .map((f) => ('name' in f ? f.name : null))
      .filter(Boolean)
    expect(archiveGroupNames).toEqual(['articlesHeader', 'projectsHeader'])

    const detailGroupNames = tabsField.tabs[2].fields
      .map((f) => ('name' in f ? f.name : null))
      .filter(Boolean)
    expect(detailGroupNames).toEqual(['articleDetailHeader', 'projectDetailHeader'])

    const seeded = headerData(null)
    expect(seeded.sureName).toBe('Amir v.Tarikhi')
    expect(seeded.articlesHeader?.defaultLayout).toBe('magazine')
    expect(seeded.projectsHeader?.defaultLayout).toBe('showcase')
    expect(seeded.articleDetailHeader?.backgroundPreset).toBe('chromatic-cover')
    expect(seeded.projectDetailHeader?.backgroundPreset).toBe('chromatic-cover')
  })

  it('maps Header Studio defaults cleanly for null/legacy documents and honors custom CMS overrides', () => {
    const fallbackStudio = mapHeaderStudio(null)
    expect(fallbackStudio).toEqual(DEFAULT_HEADER_STUDIO)

    const portfolioEmpty = mapPortfolioContent({
      siteSettings: null,
      navigation: null,
      header: null,
      about: null,
      skills: [],
      experiences: [],
      educations: [],
      certificates: [],
      articles: [],
      services: [],
      projects: [],
      footer: null,
    })
    expect(portfolioEmpty.header).toBeNull()
    expect(portfolioEmpty.headerStudio.articlesArchive.defaultLayout).toBe('magazine')
    expect(portfolioEmpty.headerStudio.projectsArchive.backgroundPreset).toBe('blueprint-spotlight')

    const customDoc = {
      id: 1,
      sureName: 'Amir v.Tarikhi',
      professionTexts: ['Principal Engineer'],
      articlesHeader: {
        eyebrow: 'Systems Dispatch',
        headingOverride: 'Architecture Dispatches',
        subtitleOverride: 'Deep dives on distributed systems.',
        backgroundPreset: 'constellation-canvas',
        accentTone: 'cyan-gold',
        defaultLayout: 'list',
        showSearch: true,
        showFilters: false,
        showStatsBar: true,
        showRssLink: false,
      },
      projectDetailHeader: {
        eyebrow: 'System Blueprint',
        backgroundPreset: 'blueprint-spotlight',
        accentTone: 'amber-slate',
        showBreadcrumbs: true,
        showSpecDock: true,
        showTechLinks: false,
        showStickySidebar: false,
        showRelatedProjects: false,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as HeaderDoc

    const mapped = mapHeader(customDoc)
    expect(mapped?.sureName).toBe('Amir v.Tarikhi')
    expect(mapped?.studio?.articlesArchive.headingOverride).toBe('Architecture Dispatches')
    expect(mapped?.studio?.articlesArchive.backgroundPreset).toBe('constellation-canvas')
    expect(mapped?.studio?.articlesArchive.accentTone).toBe('cyan-gold')
    expect(mapped?.studio?.articlesArchive.defaultLayout).toBe('list')
    expect(mapped?.studio?.articlesArchive.showFilters).toBe(false)
    expect(mapped?.studio?.projectDetail.showTechLinks).toBe(false)
    expect(mapped?.studio?.projectDetail.showStickySidebar).toBe(false)
  })

  it('renders all Creative Header Background presets and falls back gracefully when chromatic-cover has no image', () => {
    const { container: c1 } = render(
      React.createElement(HeaderBackground, {
        preset: 'chromatic-cover',
        coverUrl: '/media/cover.webp',
      }),
    )
    expect(c1.querySelector('[data-bg-preset="chromatic-cover"]')).not.toBeNull()
    cleanup()

    const { container: cFallback } = render(
      React.createElement(HeaderBackground, {
        preset: 'chromatic-cover',
        coverUrl: null,
      }),
    )
    expect(cFallback.querySelector('[data-bg-preset="aurora-grain"]')).not.toBeNull()
    cleanup()

    const { container: cBlueprint } = render(
      React.createElement(HeaderBackground, { preset: 'blueprint-spotlight' }),
    )
    expect(cBlueprint.querySelector('[data-bg-preset="blueprint-spotlight"]')).not.toBeNull()
    cleanup()

    const { container: cCanvas } = render(
      React.createElement(HeaderBackground, { preset: 'constellation-canvas' }),
    )
    expect(cCanvas.querySelector('[data-bg-preset="constellation-canvas"]')).not.toBeNull()
    expect(cCanvas.querySelector('canvas')).not.toBeNull()
  })

  it('renders /articles Type 2 Header + Magazine layout (Spotlight + Stream + Essential Reads rail) and switches views', () => {
    const sampleArticles: ArticleItem[] = [
      {
        id: '1',
        title: 'Zero-Downtime Postgres Migrations on Neon',
        excerpt: 'Safe expand-and-contract patterns for serverless Postgres.',
        author: 'October 10, 2026',
        readTime: '6 min',
        imageUrl: '/images/a1.webp',
        link: '',
        pagePath: '/articles/zero-downtime-neon',
        featured: true,
        category: 'articles',
      },
      {
        id: '2',
        title: 'Payload v3 Lexical Blocks Architecture',
        excerpt: 'Designing type-safe Code, Callout, and Media blocks.',
        author: 'September 18, 2026',
        readTime: '4 min',
        imageUrl: '/images/a2.webp',
        link: 'https://linkedin.com/posts/lexical',
        pagePath: '/articles/payload-lexical-blocks',
        featured: false,
        category: 'articles',
      },
      {
        id: '3',
        title: 'Edge Caching Notes',
        excerpt: 'Short syndication note on tag-based revalidation.',
        author: 'August 4, 2026',
        readTime: '2 min',
        imageUrl: '/images/a3.webp',
        link: 'https://medium.com/@etarikhi/edge',
        pagePath: null,
        featured: false,
        category: 'others',
      },
    ]

    const { container } = render(
      React.createElement(ArticlesArchive, {
        articles: sampleArticles,
        labels: DEFAULT_SITE_SETTINGS.articlesSection,
        headerConfig: {
          ...DEFAULT_HEADER_STUDIO.articlesArchive,
          headingOverride: 'Engineering Publication',
        },
      }),
    )

    // Type 2 Header stage, custom heading override, RSS pill, and telemetry
    expect(container.querySelector('header[data-header-type="archive"]')).not.toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Engineering Publication' }),
    ).toBeTruthy()
    expect(container.querySelector('[data-bg-preset="aurora-grain"]')).not.toBeNull()

    // Magazine default layout: Featured Lead + Engineering Stream + Essential Reads rail
    expect(container.querySelector('[data-archive-view="magazine"]')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Featured spotlight' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Editorial highlights' })).toBeTruthy()
    expect(screen.getByText('Essential Reads')).toBeTruthy()

    // Switch layout view to List, then Grid
    const viewGroup = screen.getByRole('group', { name: 'Layout view' })
    fireEvent.click(within(viewGroup).getByRole('button', { name: 'List' }))
    expect(container.querySelector('[data-archive-view="list"]')).not.toBeNull()
    expect(
      container.querySelectorAll('[data-archive-view="list"] .pocms-btn-gold').length,
    ).toBeGreaterThan(0)

    fireEvent.click(within(viewGroup).getByRole('button', { name: 'Grid' }))
    expect(container.querySelector('[data-archive-view="grid"]')).not.toBeNull()
    expect(container.querySelectorAll('article.col-lg-4')).toHaveLength(3)
    expect(container.querySelectorAll('.pocms-showcase-card--grid')).toHaveLength(3)
    expect(container.querySelectorAll('h2.pocms-card-title')).toHaveLength(3)
  })

  it('renders /projects Type 2 Header + Showcase layout (Case Studies Spotlight + Portfolio Builds) and Index table', () => {
    const sampleProjects: ProjectItem[] = [
      {
        id: '10',
        title: 'AlyaPanel Cloud Control Plane',
        excerpt: 'Multi-tenant server orchestration platform.',
        categories: ['back-end', 'cms-crm'],
        techStack: ['Payload CMS', 'Next.js', 'PostgreSQL'],
        role: 'Lead Architect',
        year: '2026',
        readTime: '5 min',
        thumbnailUrl: '/images/p1.webp',
        imageUrl: '/images/p1.webp',
        url: 'https://alyapanel.example.com',
        pagePath: '/projects/alyapanel',
      },
      {
        id: '11',
        title: 'Commerce Sync Engine',
        excerpt: 'High-throughput inventory bridge for Shopify & WooCommerce.',
        categories: ['back-end'],
        techStack: ['Laravel', 'Redis'],
        role: 'Senior Developer',
        year: '2025',
        readTime: null,
        thumbnailUrl: '/images/p2.webp',
        imageUrl: '/images/p2.webp',
        url: 'https://sync.example.com',
        pagePath: null,
      },
    ]

    const { container } = render(
      React.createElement(ProjectsArchive, {
        projects: sampleProjects,
        labels: DEFAULT_SITE_SETTINGS.projectsSection,
        headerConfig: DEFAULT_HEADER_STUDIO.projectsArchive,
      }),
    )

    expect(container.querySelector('[data-bg-preset="blueprint-spotlight"]')).not.toBeNull()
    expect(container.querySelector('[data-archive-view="showcase"]')).not.toBeNull()
    expect(container.querySelectorAll('.pocms-showcase-card--pan-preview')).toHaveLength(2)
    expect(
      screen.getByRole('region', { name: 'Featured engineering case studies' }),
    ).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Portfolio builds' })).toBeTruthy()

    // Switch to Grid view -> centered cards without hover vertical pan
    const viewGroup = screen.getByRole('group', { name: 'Layout view' })
    fireEvent.click(within(viewGroup).getByRole('button', { name: 'Grid' }))
    expect(container.querySelectorAll('.pocms-showcase-card--grid')).toHaveLength(2)
    expect(container.querySelectorAll('.pocms-showcase-card--pan-preview')).toHaveLength(0)

    // Switch to Architectural Index view
    fireEvent.click(within(viewGroup).getByRole('button', { name: 'Index' }))
    expect(container.querySelector('[data-archive-view="list"]')).not.toBeNull()
    expect(container.querySelectorAll('.pocms-index-row')).toHaveLength(2)
  })

  it('renders Type 3 Detail Headers, H2 jump chips, deep-linked tech chips, 2-column sticky TOC rails, and continuation cards', () => {
    const articleDetail: ArticleDetail = {
      id: 1,
      slug: 'distributed-queues',
      title: 'Designing Resilient Distributed Queues',
      excerpt: 'Idempotency keys, dead-letter recovery, and backpressure.',
      featured: true,
      category: 'articles',
      publishedAt: '2026-09-15T00:00:00.000Z',
      publishedDisplay: 'September 15, 2026',
      readTimeDisplay: '7 min',
      coverUrl: '/media/queues.webp',
      coverAlt: 'Distributed Queues Diagram',
      paragraphs: ['Queue reliability starts with idempotent consumers.'],
      toc: [
        { id: 'idempotency-keys', text: 'Idempotency Keys', level: 2 },
        { id: 'dead-letter-queues', text: 'Dead-Letter Queues', level: 2 },
      ],
      externalLink: 'https://linkedin.com/posts/queues',
    }

    const relatedArticle: ArticleItem = {
      id: '99',
      title: 'Outbox Pattern in PostgreSQL',
      excerpt: 'Transactional event publishing without dual writes.',
      author: 'August 20, 2026',
      readTime: '5 min',
      imageUrl: '/images/outbox.webp',
      link: '',
      pagePath: '/articles/outbox-pattern',
      featured: false,
      category: 'articles',
    }

    const { container: articleContainer } = render(
      React.createElement(ArticleLayout, {
        article: articleDetail,
        ownerName: 'Amir v.Tarikhi',
        headerConfig: DEFAULT_HEADER_STUDIO.articleDetail,
        relatedArticles: [relatedArticle],
      }),
    )

    expect(articleContainer.querySelector('header[data-header-type="detail"]')).not.toBeNull()
    expect(articleContainer.querySelector('[data-bg-preset="chromatic-cover"]')).not.toBeNull()
    expect(articleContainer.querySelector('.pocms-reading-grid--with-rail')).not.toBeNull()
    expect(screen.getByRole('navigation', { name: 'Table of contents' })).toBeTruthy()
    expect(screen.getByText('Amir v.Tarikhi')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Continue reading' })).toBeTruthy()
    expect(screen.getByText('Outbox Pattern in PostgreSQL')).toBeTruthy()
    cleanup()

    const projectDetail: ProjectDetail = {
      id: 5,
      slug: 'alyapanel',
      title: 'AlyaPanel Orchestrator',
      excerpt: 'Automated cluster provisioning and backup telemetry.',
      categories: ['back-end'],
      categoryLabels: ['Back-End'],
      role: 'Principal Systems Architect',
      client: 'Alya Cloud',
      year: '2026',
      techStack: ['Payload CMS', 'TypeScript'],
      readTimeDisplay: '6 min',
      coverUrl: '/media/alyapanel.webp',
      coverAlt: 'AlyaPanel Dashboard',
      liveUrl: 'https://alyapanel.example.com',
      readMoreUrl: null,
      content: undefined,
      toc: [{ id: 'system-topology', text: 'System Topology', level: 2 }],
    }

    const relatedProject: ProjectItem = {
      id: '12',
      title: 'Edge Analytics Gateway',
      excerpt: 'Sub-millisecond telemetry ingestion.',
      categories: ['back-end'],
      techStack: ['Go'],
      role: 'Lead Engineer',
      year: '2025',
      readTime: '4 min',
      thumbnailUrl: '/images/edge.webp',
      imageUrl: '/images/edge.webp',
      url: 'https://edge.example.com',
      pagePath: '/projects/edge-gateway',
    }

    const { container: projectContainer } = render(
      React.createElement(ProjectLayout, {
        project: projectDetail,
        headerConfig: DEFAULT_HEADER_STUDIO.projectDetail,
        relatedProjects: [relatedProject],
      }),
    )

    expect(projectContainer.querySelector('header[data-detail-variant="project"]')).not.toBeNull()
    expect(projectContainer.querySelector('.pocms-reading-grid--with-rail')).not.toBeNull()
    // Tech stack pills deep-link to /projects?tech=...
    const payloadTechLink = screen.getByRole('link', { name: 'Payload CMS' })
    expect(payloadTechLink.getAttribute('href')).toBe('/projects?tech=Payload%20CMS')
    expect(screen.getByRole('region', { name: 'More selected projects' })).toBeTruthy()
    expect(screen.getByText('Edge Analytics Gateway')).toBeTruthy()
  })
})
