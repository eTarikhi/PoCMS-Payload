import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import config from '@/payload.config'
import { ensureOrderable, ORDERABLE_COLLECTIONS } from '@/access/orderable'
import { governedEntities, mergeRoles } from '@/access/permissions'
import {
  DEFAULT_NAVIGATION,
  DEFAULT_SITE_SETTINGS,
  mapNavigation,
  mapPortfolioContent,
  mapSiteSettings,
} from '@/app/(frontend)/lib/mappers'
import {
  buildArticleMetadata,
  buildBlogPostingJsonLd,
  buildPersonJsonLd,
  buildPortfolioMetadata,
  buildPortfolioViewport,
  htmlLangFromLocale,
} from '@/app/(frontend)/lib/seo'
import { Navigation } from '@/app/(frontend)/components/layout/Navigation'
import { Hero } from '@/app/(frontend)/components/layout/Hero'
import { Footer } from '@/app/(frontend)/components/layout/Footer'
import { AboutSection } from '@/app/(frontend)/components/sections/AboutSection'
import { ArticlesSection } from '@/app/(frontend)/components/sections/ArticlesSection'
import { CertificatesSection } from '@/app/(frontend)/components/sections/CertificatesSection'
import { seed } from '@/seed/index'
import type { Media } from '@/payload-types'
import type { PayloadRequest } from 'payload'

describe('Drag-and-drop ordering & globals configuration', () => {
  it('enables orderable: true with _order defaultSort and native drag list view on all 5 collections', async () => {
    const sanitized = await config

    for (const slug of ORDERABLE_COLLECTIONS) {
      const collection = sanitized.collections.find((c) => c.slug === slug)
      expect(collection, `Expected collection "${slug}" to exist`).toBeDefined()
      expect(collection?.orderable).toBe(true)
      expect(collection?.defaultSort).toBe('_order')

      const fieldNames = collection?.flattenedFields.map((f) => f.name) ?? []
      expect(fieldNames).toContain('_order')
      expect(fieldNames).not.toContain('order')

      // adminUIPlugin keeps Payload's native drag-and-drop list view for orderable collections
      // while still attaching ListSummary and the GraphQL document tab.
      expect(collection?.admin.components?.views?.list?.Component).toBeUndefined()
      expect(collection?.admin.components?.beforeListTable).toContain(
        '/components/admin/views/List/ListSummary#ListSummary',
      )
      const editViews = collection?.admin.components?.views?.edit ?? {}
      expect('graphql' in editViews).toBe(true)
    }

    // Payload registers its POST /reorder endpoint when orderable collections exist.
    const reorderEndpoint = sanitized.endpoints?.find(
      (endpoint) => endpoint.path === '/reorder' && endpoint.method === 'post',
    )
    expect(reorderEndpoint).toBeDefined()

    // Non-orderable collections keep TanStackListView.
    const articles = sanitized.collections.find((c) => c.slug === 'articles')
    expect(articles?.admin.components?.views?.list?.Component).toBe(
      '/components/admin/views/List#TanStackListView',
    )
  })

  it('registers header, site-settings, navigation, footer and custom-code globals with RBAC governance', async () => {
    const sanitized = await config
    const globalSlugs = sanitized.globals.map((g) => g.slug)
    expect(globalSlugs).toEqual([
      'header',
      'site-settings',
      'navigation',
      'footer',
      'custom-code',
    ])

    for (const slug of ['header', 'site-settings', 'navigation', 'footer', 'custom-code']) {
      const globalConfig = sanitized.globals.find((g) => g.slug === slug)
      expect(globalConfig?.admin.group).toBe('Site settings')
      const editViews = globalConfig?.admin.components?.views?.edit ?? {}
      expect('graphql' in editViews).toBe(true)
    }

    const entities = governedEntities(sanitized)
    const governedGlobals = entities.filter((e) => e.kind === 'global')
    expect(governedGlobals.map((g) => ({ slug: g.slug, field: g.field }))).toEqual([
      { slug: 'header', field: 'header' },
      { slug: 'site-settings', field: 'siteSettings' },
      { slug: 'navigation', field: 'navigation' },
      { slug: 'footer', field: 'footer' },
      { slug: 'custom-code', field: 'customCode' },
    ])

    const merged = mergeRoles(
      [
        {
          name: 'Content Lead',
          levels: { siteSettings: 'edit', navigation: 'read' },
        },
      ],
      entities,
    )
    expect(merged.levels['site-settings']).toBe('edit')
    expect(merged.levels['navigation']).toBe('read')
    expect(merged.levels['footer']).toBeUndefined()
  })

  it('backfills fractional _order keys for pre-existing documents without _order', async () => {
    const updates: Array<{ collection: string; id: number | string; data: Record<string, unknown> }> =
      []
    const mockPayload = {
      count: vi.fn(async ({ collection }: { collection: string }) => ({
        totalDocs: collection === 'projects' ? 2 : 0,
      })),
      find: vi.fn(async () => ({
        docs: [
          { id: 1, _order: 'a0' },
          { id: 2, _order: null },
          { id: 3 },
        ],
      })),
      update: vi.fn(
        async ({
          collection,
          id,
          data,
        }: {
          collection: string
          id: number | string
          data: Record<string, unknown>
        }) => {
          updates.push({ collection, id, data })
          return { id, ...data }
        },
      ),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as Payload

    await ensureOrderable(mockPayload)

    expect(updates).toHaveLength(2)
    expect(updates[0].collection).toBe('projects')
    expect(updates[0].id).toBe(2)
    expect(updates[1].id).toBe(3)

    const key2 = String(updates[0].data._order)
    const key3 = String(updates[1].data._order)
    expect(key2 > 'a0').toBe(true)
    expect(key3 > key2).toBe(true)
  })
})

describe('Navigation & SiteSettings mappers and SEO builders', () => {
  it('falls back to DEFAULT_NAVIGATION and DEFAULT_SITE_SETTINGS when globals are unsaved', () => {
    expect(mapNavigation(null)).toEqual(DEFAULT_NAVIGATION)
    expect(mapNavigation({})).toEqual(DEFAULT_NAVIGATION)
    expect(mapSiteSettings(null)).toEqual(DEFAULT_SITE_SETTINGS)
    expect(mapSiteSettings({})).toEqual(DEFAULT_SITE_SETTINGS)
  })

  it('maps custom Navigation brand, link positions, visibility and new-tab flags', () => {
    const nav = mapNavigation({
      brand: { text: 'StudioX', href: '/home' },
      skipToContentLabel: 'Jump to main',
      items: [
        { id: '1', label: 'Work', href: '/#work', position: 'left', enabled: true },
        { id: '2', label: 'Hidden', href: '/#secret', position: 'left', enabled: false },
        {
          id: '3',
          label: 'GitHub',
          href: 'https://github.com/example',
          position: 'right',
          openInNewTab: true,
          enabled: true,
        },
      ],
    })

    expect(nav.brand).toEqual({ text: 'StudioX', href: '/home' })
    expect(nav.skipToContentLabel).toBe('Jump to main')
    expect(nav.items).toEqual([
      { id: '1', label: 'Work', href: '/#work', position: 'left', openInNewTab: false },
      {
        id: '3',
        label: 'GitHub',
        href: 'https://github.com/example',
        position: 'right',
        openInNewTab: true,
      },
    ])
  })

  it('maps custom SiteSettings, resolves uploaded OG media, and hides cleared CTAs', () => {
    const uploadedOg: Media = {
      id: 42,
      alt: 'Custom OG Card',
      url: '/api/media/file/og-card.png',
      width: 1200,
      height: 630,
      mimeType: 'image/png',
      updatedAt: '2026-10-25T00:00:00.000Z',
      createdAt: '2026-10-25T00:00:00.000Z',
    }

    const settings = mapSiteSettings({
      siteName: 'Jane Doe Portfolio',
      ownerName: 'Jane Doe',
      locale: 'tr_TR',
      themeColor: '#112233',
      siteTitle: 'Jane Doe | Principal Engineer',
      metaDescription: 'Distributed systems & cloud architecture.',
      keywords: 'Go, Rust, Kubernetes',
      ogDescription: 'Jane Doe cloud portfolio',
      ogImage: uploadedOg,
      jobTitle: 'Principal Cloud Architect',
      address: {
        streetAddress: '100 Market St',
        addressLocality: 'San Francisco',
        addressRegion: 'CA',
        postalCode: '94105',
      },
      projectsSection: {
        heading: 'Selected Case Studies',
        allFilterLabel: 'Everything',
      },
      certificatesSection: {
        heading: 'Certifications',
        ctaLabel: '',
        ctaUrl: '',
      },
      articlesSection: {
        heading: 'Writing',
        ctaLabel: 'Browse Archive',
        ctaUrl: '/articles',
      },
    })

    expect(settings.ownerName).toBe('Jane Doe')
    expect(settings.ogImage).toEqual({
      url: '/api/media/file/og-card.png',
      width: 1200,
      height: 630,
      alt: 'Custom OG Card',
      mimeType: 'image/png',
    })
    expect(settings.certificatesSection.cta).toBeNull()
    expect(settings.articlesSection.cta).toEqual({ label: 'Browse Archive', url: '/articles' })

    const portfolio = mapPortfolioContent({
      siteSettings: {
        siteName: 'Jane Doe Portfolio',
        ownerName: 'Jane Doe',
        siteTitle: 'Jane Doe | Principal Engineer',
        metaDescription: 'Distributed systems.',
        projectsSection: { heading: 'Selected Case Studies', allFilterLabel: 'Everything' },
      },
      navigation: { brand: { text: 'JD', href: '/' }, items: [] },
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

    expect(portfolio.projects.heading).toBe('Selected Case Studies')
    expect(portfolio.projects.filters[0]).toEqual({ label: 'Everything', value: '*' })

    // Verify metadata, viewport, lang, and JSON-LD builders consume SiteSettings
    expect(htmlLangFromLocale(settings.locale)).toBe('tr')
    expect(buildPortfolioViewport(settings).themeColor).toBe('#112233')

    const meta = buildPortfolioMetadata(settings, 'https://janedoe.dev')
    expect(meta.title).toBe('Jane Doe | Principal Engineer')
    expect(meta.description).toBe('Distributed systems & cloud architecture.')
    expect(meta.other).toEqual({ owner: 'Jane Doe' })
    expect(meta.openGraph?.siteName).toBe('Jane Doe Portfolio')
    expect(meta.openGraph?.locale).toBe('tr_TR')

    const personLd = buildPersonJsonLd(null, null, settings, 'https://janedoe.dev')
    expect(personLd.name).toBe('Jane Doe')
    expect(personLd.jobTitle).toBe('Principal Cloud Architect')
    expect(personLd.image).toBe('https://janedoe.dev/api/media/file/og-card.png')
    expect(personLd.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '100 Market St',
      addressLocality: 'San Francisco',
      addressRegion: 'CA',
      postalCode: '94105',
    })

    const articleDetail = {
      id: 7,
      slug: 'zero-downtime',
      title: 'Zero Downtime Migrations',
      excerpt: 'How to evolve schemas safely.',
      category: 'articles' as const,
      publishedAt: '2026-10-01T00:00:00.000Z',
      publishedDisplay: 'October 1, 2026',
      readTimeDisplay: '5 min',
      coverUrl: null,
      coverAlt: 'Zero Downtime Migrations',
      paragraphs: ['Paragraph one.'],
      externalLink: null,
    }
    const articleMeta = buildArticleMetadata(articleDetail, settings, 'https://janedoe.dev')
    expect(articleMeta.openGraph?.siteName).toBe('Jane Doe Portfolio')
    expect(articleMeta.openGraph?.locale).toBe('tr_TR')

    const blogLd = buildBlogPostingJsonLd(
      articleDetail,
      null,
      null,
      settings,
      'https://janedoe.dev',
    )
    expect((blogLd.author as Record<string, unknown>).name).toBe('Jane Doe')
    expect(blogLd.image).toBe('https://janedoe.dev/api/media/file/og-card.png')
  })
})

describe('Frontend components render CMS-driven Navigation & SiteSettings strings', () => {
  it('renders custom Navigation brand and split desktop links without hardcoded brand text', () => {
    render(
      React.createElement(Navigation, {
        navigation: {
          brand: { text: 'NovaBrand', href: '/welcome' },
          skipToContentLabel: 'Skip',
          items: [
            { id: 'a', label: 'Intro', href: '/#intro', position: 'left', openInNewTab: false },
            {
              id: 'b',
              label: 'External Docs',
              href: 'https://docs.example.com',
              position: 'right',
              openInNewTab: true,
            },
          ],
        },
      }),
    )

    expect(screen.getAllByText('NovaBrand')).toHaveLength(2)
    expect(screen.queryByText('eTarikhi')).toBeNull()
    expect(screen.getByText('Intro').closest('a')?.getAttribute('href')).toBe('/#intro')
    const extLink = screen.getByText('External Docs').closest('a')
    expect(extLink?.getAttribute('target')).toBe('_blank')
  })

  it('renders custom Hero, About, Certificates, Articles, and Footer strings from SiteSettings', () => {
    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Hero, {
          header: {
            id: '1',
            sureName: 'Alex Mercer',
            imageUrl: '/images/profile.webp',
            requestCV: '/cv.pdf',
            professionTexts: ['Systems Architect'],
          },
          labels: { greeting: 'Hello, I am', requestCvLabel: 'Download Résumé' },
        }),
        React.createElement(AboutSection, {
          about: {
            experience: { years: 12, title: 'Years Building', description: 'Bio' },
            workPermit: { title: 'Remote', description: 'Worldwide' },
            images: ['/images/about/about-1.jpg'],
            interests: { title: 'Focus', description: 'Cloud', areas: ['Rust'] },
          },
          ownerName: 'Alex Mercer',
        }),
        React.createElement(CertificatesSection, {
          certificates: [],
          labels: {
            heading: 'Verified Credentials',
            cta: null,
            viewCertificateLabel: 'Inspect Credential',
          },
        }),
        React.createElement(ArticlesSection, {
          articles: [
            {
              id: '10',
              title: 'Scaling Postgres',
              excerpt: 'Deep dive',
              author: 'Oct 2026',
              readTime: '4 min',
              imageUrl: '/placeholder.svg',
              link: 'https://example.com/post',
              pagePath: '/articles/scaling-postgres',
            },
          ],
          labels: {
            ...DEFAULT_SITE_SETTINGS.articlesSection,
            heading: 'Engineering Notes',
            cta: { label: 'Read Full Archive', url: '/articles' },
            readOnSiteLabel: 'Open full article',
          },
        }),
        React.createElement(Footer, {
          footer: {
            socialLinks: [],
            fullName: 'Alex Mercer',
            roles: ['Architect'],
            profiles: [],
            contactInfo: [],
            copyright: { year: 2026, website: 'alexmercer.dev', url: 'https://alexmercer.dev' },
          },
          labels: {
            socialPrompt: 'Follow my work:',
            profilesHeading: 'Platforms',
            contactHeading: 'Get in Touch',
          },
        }),
      ),
    )

    expect(screen.getByText('Hello, I am')).toBeTruthy()
    expect(screen.getByText('Download Résumé')).toBeTruthy()
    expect(screen.getByAltText('About Alex Mercer')).toBeTruthy()
    expect(screen.getByText('Verified Credentials')).toBeTruthy()
    expect(screen.queryByText('All Certificates >')).toBeNull()
    expect(screen.getByText('Engineering Notes')).toBeTruthy()
    expect(screen.getByText('Read Full Archive')).toBeTruthy()
    expect(screen.getByText('Open full article')).toBeTruthy()
    expect(screen.getByText('Follow my work:')).toBeTruthy()
    expect(screen.getByText('Platforms')).toBeTruthy()
    expect(screen.getByText('Get in Touch')).toBeTruthy()
  })

  it('seeds deterministic _order keys on orderable collections and populates all 3 globals', async () => {
    const createdByCollection = new Map<string, Array<Record<string, unknown>>>()
    const updatedGlobals = new Map<string, Record<string, unknown>>()
    let nextId = 1

    const mockPayload = {
      collections: {},
      db: {
        deleteMany: vi.fn(async () => undefined),
        deleteVersions: vi.fn(async () => undefined),
      },
      create: vi.fn(
        async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
          const list = createdByCollection.get(collection) ?? []
          const doc = { id: nextId++, ...data }
          list.push(doc)
          createdByCollection.set(collection, list)
          return doc
        },
      ),
      updateGlobal: vi.fn(
        async ({ slug, data }: { slug: string; data: Record<string, unknown> }) => {
          updatedGlobals.set(slug, data)
          return data
        },
      ),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as Payload

    await seed({ payload: mockPayload, req: {} as PayloadRequest })

    for (const slug of ORDERABLE_COLLECTIONS) {
      const docs = createdByCollection.get(slug) ?? []
      expect(docs.length).toBeGreaterThan(0)
      const orders = docs.map((d) => String(d._order))
      expect(orders.every((o) => typeof o === 'string' && o.length > 0)).toBe(true)
      const sorted = [...orders].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      expect(orders).toEqual(sorted)
      expect(docs.some((d) => 'order' in d)).toBe(false)
    }

    expect(Array.from(updatedGlobals.keys())).toEqual([
      'header',
      'site-settings',
      'navigation',
      'footer',
    ])
    expect(updatedGlobals.get('header')?.sureName).toBe('Amir v.Tarikhi')
    expect(updatedGlobals.get('site-settings')?.siteName).toBe('Amir v.Tarikhi Live Resume')
    expect((updatedGlobals.get('navigation')?.items as unknown[])?.length).toBe(6)
  })
})
