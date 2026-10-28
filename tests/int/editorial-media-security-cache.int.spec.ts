// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Payload, PayloadRequest } from 'payload'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { revalidateTagMock, revalidatePathMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
  revalidatePath: revalidatePathMock,
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { ensureDraftVersions } from '@/access/draftMigration'
import { type EffectivePermissions, NO_PERMISSIONS } from '@/access/permissions'
import { draftContentAccess, PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import { RichTextContent } from '@/app/(frontend)/components/richtext/RichTextContent'
import {
  articleAfterChange,
  chromeAfterChange,
  homeSectionAfterChange,
  isPureDraftAutosave,
  projectAfterChange,
  redirectAfterChange,
} from '@/app/(frontend)/lib/hooks'
import {
  buildLexicalDocument,
  lexicalBlockNode,
  lexicalHeadingNode,
  lexicalParagraphNode,
  lexicalTextNode,
} from '@/app/(frontend)/lib/lexical'
import { parseMermaidDiagram } from '@/app/(frontend)/lib/mermaid-lite'
import {
  ARTICLE_CARD_SELECT,
  ARTICLE_SLUG_SELECT,
  DETAIL_POPULATE,
  MEDIA_PUBLIC_POPULATE,
  PROJECT_CARD_SELECT,
  PROJECT_SLUG_SELECT,
} from '@/app/(frontend)/lib/payload-source'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'
import { parseHighlightLineRange, tokenizeCodeLines } from '@/app/(frontend)/lib/shiki'
import { ContentHealthWidget } from '@/components/admin/widgets/ContentHealth'
import {
  draftPreviewEndpoint,
  exitDraftPreviewEndpoint,
  sanitizeInternalRedirect,
} from '@/endpoints/draftPreview'
import { resolveInternalLinkDocHref } from '@/fields/richText'
import {
  analyzeRedirectGraph,
  auditContentHealth,
  collectReferencedMediaIds,
  findOrphanedMediaIds,
} from '@/lib/contentHealth'
import { consolidateLegacyMediaUrls } from '@/lib/legacyMediaConsolidation'
import { generateBlurDataURLFromBuffer, mediaBlurBeforeChange } from '@/lib/mediaBlur'
import { resolvePayloadSecret, SECURITY_HEADERS } from '@/lib/security'
import config from '@/payload.config'

function makeUser(
  levels: EffectivePermissions['levels'] = {},
): PayloadRequest['user'] {
  return {
    id: 1,
    email: 'editor@example.com',
    roles: [{ id: 10, name: 'Editor' }],
    permissions: {
      ...NO_PERMISSIONS,
      roles: ['Editor'],
      levels,
    },
  } as unknown as PayloadRequest['user']
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  revalidateTagMock.mockReset()
  revalidatePathMock.mockReset()
})

describe('Milestone 2.1: Drafts, Version History, Autosave, Scheduled Publishing & /api/draft', () => {
  it('configures versions, drafts, autosave, schedulePublish, and /api/draft preview URLs on Articles & Projects', async () => {
    const sanitized = await config
    const articles = sanitized.collections.find((c) => c.slug === 'articles')
    const projects = sanitized.collections.find((c) => c.slug === 'projects')

    expect(articles?.versions).toBeTruthy()
    expect(typeof articles?.versions === 'object' && articles.versions.maxPerDoc).toBe(25)
    expect(
      typeof articles?.versions === 'object' &&
        typeof articles.versions.drafts === 'object' &&
        articles.versions.drafts.schedulePublish,
    ).toBe(true)

    expect(projects?.versions).toBeTruthy()
    expect(typeof projects?.versions === 'object' && projects.versions.maxPerDoc).toBe(25)
    expect(
      typeof projects?.versions === 'object' &&
        typeof projects.versions.drafts === 'object' &&
        projects.versions.drafts.schedulePublish,
    ).toBe(true)

    const previewUrl = articles?.admin?.preview?.(
      {
        slug: 'my-draft-post',
        content: buildLexicalDocument([lexicalParagraphNode([lexicalTextNode('Draft body')])]),
      },
      { req: {} as PayloadRequest, locale: 'en', token: '' },
    )
    expect(previewUrl).toBe('/api/draft?collection=articles&slug=my-draft-post')
  })

  it('auto-backfills published version snapshots for pre-existing Articles & Projects rows with 0 versions while preserving real drafts', async () => {
    const updated: Array<{ collection: string; id: number | string; status: unknown }> = []

    const mockPayload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'articles') {
          return { docs: [{ id: 1 }, { id: 2 }] }
        }
        if (collection === 'projects') {
          return { docs: [{ id: 10 }] }
        }
        return { docs: [] }
      }),
      findVersions: vi.fn(async ({ collection }: { collection: string }) => {
        // Article #2 already has a version row (e.g. a real draft created in Admin); #1 and Project #10 do not!
        if (collection === 'articles') {
          return { docs: [{ parent: 2 }] }
        }
        return { docs: [] }
      }),
      update: vi.fn(async ({ collection, id, data }) => {
        updated.push({ collection, id, status: data._status })
        return { id }
      }),
      logger: { info: vi.fn(), error: vi.fn() },
    } as unknown as Payload

    const count = await ensureDraftVersions(mockPayload)
    expect(count).toBe(2)
    expect(updated).toEqual([
      { collection: 'articles', id: 1, status: 'published' },
      { collection: 'projects', id: 10, status: 'published' },
    ])
  })

  it('restricts anonymous reads to published-or-legacy documents while letting editors read drafts & versions', () => {
    const access = draftContentAccess('articles')

    const anonRead = access.read?.({ req: { user: null } as unknown as PayloadRequest } as never)
    expect(anonRead).toEqual(PUBLISHED_OR_LEGACY_WHERE)

    const anonVersions = access.readVersions?.({
      req: { user: null } as unknown as PayloadRequest,
    } as never)
    expect(anonVersions).toBe(false)

    const editorReq = {
      user: makeUser({ articles: 'edit' }),
    } as unknown as PayloadRequest
    expect(access.read?.({ req: editorReq } as never)).toBe(true)
    expect(access.readVersions?.({ req: editorReq } as never)).toBe(true)
  })

  it('guards /api/draft with RBAC or PAYLOAD_SECRET and prevents open redirects on /api/exit-draft', async () => {
    const findMock = vi.fn().mockResolvedValue({ docs: [{ id: 7, slug: 'edge-architecture' }] })
    const mockPayload = { find: findMock } as unknown as Payload

    const unauthRes = await draftPreviewEndpoint.handler({
      url: 'http://localhost:3000/api/draft?collection=articles&slug=edge-architecture',
      user: null,
      payload: mockPayload,
    } as unknown as PayloadRequest)
    expect(unauthRes.status).toBe(401)

    const badParamsRes = await draftPreviewEndpoint.handler({
      url: 'http://localhost:3000/api/draft?collection=users&slug=admin',
      user: makeUser({ articles: 'edit' }),
      payload: mockPayload,
    } as unknown as PayloadRequest)
    expect(badParamsRes.status).toBe(400)

    const editorRes = await draftPreviewEndpoint.handler({
      url: 'http://localhost:3000/api/draft?collection=articles&slug=edge-architecture',
      user: makeUser({ articles: 'read' }),
      payload: mockPayload,
    } as unknown as PayloadRequest)
    expect(editorRes.status).toBe(307)
    expect(editorRes.headers.get('location')).toBe(
      'http://localhost:3000/articles/edge-architecture',
    )

    expect(sanitizeInternalRedirect('//evil.example.com/phish')).toBe('/')
    expect(sanitizeInternalRedirect('https://evil.example.com')).toBe('/')
    expect(sanitizeInternalRedirect('/projects/sepiwhite')).toBe('/projects/sepiwhite')

    const exitRes = await exitDraftPreviewEndpoint.handler({
      url: 'http://localhost:3000/api/exit-draft?redirect=//evil.example.com',
    } as unknown as PayloadRequest)
    expect(exitRes.status).toBe(307)
    expect(exitRes.headers.get('location')).toBe('http://localhost:3000/')
  })
})

describe('Milestone 3.2: Media Pipeline 2.0, Folders, Direct Client Uploads & Legacy Consolidation', () => {
  it('enables focalPoint, crop, WebP variants (thumbnail/card/hero/og), sharp blurDataURL, folders, and Vercel Blob next/image safety', async () => {
    const sanitized = await config
    const media = sanitized.collections.find((c) => c.slug === 'media')
    expect(media?.folders).toBeTruthy()
    expect(sanitized.collections.some((c) => c.slug === 'payload-folders')).toBe(true)

    const hasBlurField = (media?.fields ?? []).some(
      (f) => 'name' in f && f.name === 'blurDataURL',
    )
    expect(hasBlurField).toBe(true)

    const upload = typeof media?.upload === 'object' ? media.upload : undefined
    expect(upload?.focalPoint).toBe(true)
    expect(upload?.crop).toBe(true)
    const sizeSpecs = (upload?.imageSizes ?? []).map((s) => ({
      name: s.name,
      width: s.width,
      height: s.height,
    }))
    expect(sizeSpecs).toEqual([
      { name: 'thumbnail', width: 400, height: 300 },
      { name: 'card', width: 800, height: 520 },
      { name: 'hero', width: 1400, height: undefined },
      { name: 'og', width: 1200, height: 630 },
    ])
    for (const size of upload?.imageSizes ?? []) {
      expect(size.withoutEnlargement).toBe(true)
      expect(size.formatOptions?.format).toBe('webp')
    }

    // Generate a real tiny WebP base64 LQIP placeholder via sharp from public/images/profile.webp
    const sampleBuffer = fs.readFileSync(
      path.join(process.cwd(), 'public/images/profile.webp'),
    )
    const blur = await generateBlurDataURLFromBuffer(sampleBuffer)
    expect(blur).toMatch(/^data:image\/webp;base64,/)

    const hookedData = await mediaBlurBeforeChange({
      data: { alt: 'Profile' },
      req: {
        file: {
          data: sampleBuffer,
          mimetype: 'image/webp',
          name: 'profile.webp',
          size: sampleBuffer.byteLength,
        },
      },
    } as never)
    expect((hookedData as { blurDataURL?: string }).blurDataURL).toMatch(
      /^data:image\/webp;base64,/,
    )

    // Verify next.config.ts gates dangerouslyAllowLocalIP behind development and allows Vercel Blob
    const nextConfigSrc = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(nextConfigSrc).toContain("process.env.NODE_ENV === 'development'")
    expect(nextConfigSrc).toContain('*.public.blob.vercel-storage.com')
  })

  it('consolidates local legacy imageUrl & src paths idempotently and rejects path traversal', async () => {
    const createdMedia: Record<string, unknown>[] = []
    const updatedDocs: { collection: string; id: number | string; image: unknown }[] = []

    const mockPayload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'articles') {
          return {
            docs: [
              {
                id: 101,
                title: 'Safe Local Image',
                imageUrl: '/images/profile.webp',
                _status: 'published',
              },
              {
                id: 102,
                title: 'Traversal Attempt',
                imageUrl: '/../../package.json',
                _status: 'published',
              },
            ],
          }
        }
        if (collection === 'projects') {
          return {
            docs: [
              {
                id: 201,
                title: 'Same Local Image Reused',
                src: '/images/profile.webp',
                _status: 'draft',
              },
            ],
          }
        }
        if (collection === 'media') {
          return { docs: [] }
        }
        return { docs: [] }
      }),
      create: vi.fn(async ({ data, file }) => {
        createdMedia.push({ data, filename: file?.name })
        return { id: 555 }
      }),
      update: vi.fn(async ({ collection, id, data }) => {
        updatedDocs.push({ collection, id, image: data.image })
        return { id }
      }),
    } as unknown as Payload

    const result = await consolidateLegacyMediaUrls({
      payload: mockPayload,
      publicDir: path.resolve(process.cwd(), 'public'),
    })

    expect(result.scannedArticles).toBe(2)
    expect(result.migratedArticles).toBe(1)
    expect(result.scannedProjects).toBe(1)
    expect(result.migratedProjects).toBe(1)
    expect(result.skippedCount).toBe(1)
    // Deduplicated across article + project sharing `/images/profile.webp`!
    expect(createdMedia).toHaveLength(1)
    expect(updatedDocs).toEqual([
      { collection: 'articles', id: 101, image: 555 },
      { collection: 'projects', id: 201, image: 555 },
    ])
  })
})

describe('Milestone 3.3: Shiki Highlighting, Internal Relationship Links & Case-Study Blocks', () => {
  it('parses line highlight specs and tokenizes TypeScript + Unified Diff synchronously via Shiki JS engine', () => {
    const range = parseHighlightLineRange('1, 3-5, 9')
    expect([...range]).toEqual([1, 3, 4, 5, 9])

    const tsLines = tokenizeCodeLines(
      `const answer: number = 42\nexport default answer`,
      'typescript',
      '2',
    )
    expect(tsLines).toHaveLength(2)
    expect(tsLines[0].isHighlighted).toBe(false)
    expect(tsLines[1].isHighlighted).toBe(true)
    expect(tsLines[0].tokens.some((t) => Boolean(t.color))).toBe(true)

    const diffLines = tokenizeCodeLines(
      `--- a/config.ts\n+++ b/config.ts\n-const oldVal = false\n+const newVal = true`,
      'diff',
    )
    expect(diffLines[0].diffKind).toBeNull()
    expect(diffLines[2].diffKind).toBe('del')
    expect(diffLines[3].diffKind).toBe('add')
  })

  it('parses Mermaid flowcharts and sequence diagrams into deterministic SVG layouts', () => {
    const flow = parseMermaidDiagram(`flowchart LR
      A[Browser] -->|HTTPS| B(Next.js Edge)
      B --> C[(Neon Postgres)]`)
    expect(flow?.kind).toBe('flowchart')
    if (flow?.kind === 'flowchart') {
      expect(flow.nodes.map((n) => n.label)).toEqual(['Browser', 'Next.js Edge', 'Neon Postgres'])
      expect(flow.edges).toHaveLength(2)
      expect(flow.edges[0].label).toBe('HTTPS')
    }

    const seq = parseMermaidDiagram(`sequenceDiagram
      participant Editor
      participant Payload
      Editor->>Payload: Save Draft
      Payload-->>Editor: 200 OK`)
    expect(seq?.kind).toBe('sequence')
    if (seq?.kind === 'sequence') {
      expect(seq.actors).toHaveLength(2)
      expect(seq.messages).toHaveLength(2)
      expect(seq.messages[1].dashed).toBe(true)
    }
  })

  it('renders internal links, Shiki CodeBlock, interactive CodeTabs, Metrics, and Mermaid Diagrams in RichTextContent', () => {
    expect(
      resolveInternalLinkDocHref({ relationTo: 'articles', value: { slug: 'devops-roadmap' } }),
    ).toBe('/articles/devops-roadmap')
    expect(
      resolveInternalLinkDocHref({ relationTo: 'projects', value: { slug: 'sepiwhite' } }),
    ).toBe('/projects/sepiwhite')

    const doc = buildLexicalDocument([
      lexicalHeadingNode('h2', 'System Outcomes'),
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'link',
            version: 3,
            fields: {
              linkType: 'internal',
              newTab: false,
              doc: { relationTo: 'projects', value: { id: 9, slug: 'sepiwhite' } },
            },
            children: [lexicalTextNode('Explore SepiWhite Case Study')],
          },
        ],
      },
      lexicalBlockNode({
        blockType: 'metrics',
        heading: 'Production Impact',
        items: [
          { value: '-64%', label: 'p99 Latency', context: 'Across EU & US edges', tone: 'emerald' },
          { value: '99.99%', label: 'Availability', tone: 'gold' },
        ],
      }),
      lexicalBlockNode({
        blockType: 'codeTabs',
        title: 'Cache Layer',
        tabs: [
          { label: 'revalidate.ts', language: 'typescript', code: 'export const TAG = "chrome"' },
          { label: 'patch.diff', language: 'diff', code: '+revalidateTag("portfolio:chrome")' },
        ],
      }),
      lexicalBlockNode({
        blockType: 'diagram',
        title: 'Request Flow',
        engine: 'mermaid',
        code: 'flowchart LR\n  Client[Client] --> Edge(Edge Cache)',
        caption: 'Edge-first cache topology',
      }),
    ])

    render(React.createElement(RichTextContent, { data: doc }))

    const internalLink = screen.getByRole('link', { name: 'Explore SepiWhite Case Study' })
    expect(internalLink.getAttribute('href')).toBe('/projects/sepiwhite')

    expect(screen.getByText('-64%')).toBeDefined()
    expect(screen.getByText('p99 Latency')).toBeDefined()

    // Switch active tab in CodeTabsBlockView
    expect(screen.getByText(/TAG/)).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: /patch\.diff/i }))
    expect(screen.getByText(/portfolio:chrome/)).toBeDefined()

    // Diagram SVG + toggle to Source
    expect(screen.getByRole('img', { name: /Architecture flowchart diagram/i })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(screen.getByText(/flowchart LR/)).toBeDefined()
  })
})

describe('Milestone 4.1: Granular Cache-Tag Architecture & Draft-Aware Hooks', () => {
  it('skips cache busting on pure draft autosaves and invalidates only scoped tags on publish/update', () => {
    expect(isPureDraftAutosave({ _status: 'draft' }, { _status: 'draft' })).toBe(true)
    expect(isPureDraftAutosave({ _status: 'draft' }, { _status: 'published' })).toBe(false)

    // Draft-over-draft update -> 0 revalidateTag calls
    articleAfterChange({
      doc: { id: 1, slug: 'draft-post', _status: 'draft' },
      previousDoc: { id: 1, slug: 'draft-post', _status: 'draft' },
      context: {},
    } as never)
    expect(revalidateTagMock).not.toHaveBeenCalled()

    // Publishing an article -> invalidates articles:list + home:articles + article:{slug} + feeds, NOT umbrella/chrome/projects!
    articleAfterChange({
      doc: { id: 1, slug: 'live-post', _status: 'published' },
      previousDoc: { id: 1, slug: 'old-slug', _status: 'published' },
      context: {},
    } as never)
    const invalidatedArticleTags = revalidateTagMock.mock.calls.map((c) => c[0])
    expect(invalidatedArticleTags).not.toContain(PORTFOLIO_CACHE_TAG)
    expect(invalidatedArticleTags).toContain('articles:list')
    expect(invalidatedArticleTags).toContain('home:articles')
    expect(invalidatedArticleTags).toContain('article:live-post')
    expect(invalidatedArticleTags).toContain('article:old-slug')
    expect(invalidatedArticleTags).toContain(CACHE_TAGS.home)
    expect(invalidatedArticleTags).toContain(CACHE_TAGS.feeds)
    expect(invalidatedArticleTags).not.toContain(CACHE_TAGS.chrome)
    expect(invalidatedArticleTags).not.toContain(CACHE_TAGS.projects)

    // Saving only Footer global -> invalidates global:footer + chrome + home, NOT global:header or articles/projects!
    revalidateTagMock.mockReset()
    chromeAfterChange({ global: { slug: 'footer' }, doc: {}, context: {} } as never)
    const footerTags = revalidateTagMock.mock.calls.map((c) => c[0])
    expect(footerTags).toContain('global:footer')
    expect(footerTags).toContain(CACHE_TAGS.chrome)
    expect(footerTags).not.toContain('global:header')
    expect(footerTags).not.toContain('home:header')
    expect(footerTags).not.toContain(CACHE_TAGS.articles)
    expect(footerTags).not.toContain(CACHE_TAGS.projects)

    // Saving Header global -> invalidates global:header + home:header + chrome + home, NOT global:footer!
    revalidateTagMock.mockReset()
    chromeAfterChange({ global: { slug: 'header' }, doc: {}, context: {} } as never)
    const headerTags = revalidateTagMock.mock.calls.map((c) => c[0])
    expect(headerTags).toContain('global:header')
    expect(headerTags).toContain('home:header')
    expect(headerTags).not.toContain('global:footer')

    // Home section save -> invalidates only home:profile + portfolio:home!
    revalidateTagMock.mockReset()
    homeSectionAfterChange({ doc: {}, context: {} } as never)
    const homeTags = revalidateTagMock.mock.calls.map((c) => c[0])
    expect(homeTags).toEqual([CACHE_TAGS.homeProfile, CACHE_TAGS.home])

    // Project publish -> invalidates projects:list + home:projects + project:{slug} + home, NOT articles or chrome!
    revalidateTagMock.mockReset()
    projectAfterChange({
      doc: { id: 2, slug: 'sepiwhite', _status: 'published' },
      previousDoc: {},
      context: {},
    } as never)
    const projectTags = revalidateTagMock.mock.calls.map((c) => c[0])
    expect(projectTags).toContain('projects:list')
    expect(projectTags).toContain('home:projects')
    expect(projectTags).toContain('project:sepiwhite')
    expect(projectTags).not.toContain(CACHE_TAGS.articles)
    expect(projectTags).not.toContain(CACHE_TAGS.chrome)

    // Redirect save -> invalidates only portfolio:redirects!
    revalidateTagMock.mockReset()
    redirectAfterChange({ doc: {}, context: {} } as never)
    expect(revalidateTagMock.mock.calls.map((c) => c[0])).toEqual([CACHE_TAGS.redirects])

    // Explicit Payload select & populate projections omit unused columns on RSC queries
    expect(ARTICLE_CARD_SELECT).toHaveProperty('title', true)
    expect(ARTICLE_CARD_SELECT).not.toHaveProperty('meta')
    expect(ARTICLE_SLUG_SELECT).toEqual({ slug: true, content: true, description: true })
    expect(PROJECT_CARD_SELECT).toHaveProperty('title', true)
    expect(PROJECT_CARD_SELECT).not.toHaveProperty('meta')
    expect(PROJECT_SLUG_SELECT).toEqual({ slug: true, content: true })
    expect(MEDIA_PUBLIC_POPULATE.media.blurDataURL).toBe(true)
    expect(DETAIL_POPULATE.articles).toEqual({ slug: true, title: true })
    expect(DETAIL_POPULATE.projects).toEqual({ slug: true, title: true })
  })
})

describe('Milestone 4.2: Saved Admin Query Presets & Content Health 2.0', () => {
  it('enables Query Presets on Media & AuditLogs (disabled on Articles & Projects), registers Header as Global, and collapses Browse-by-Folder in rail mode', async () => {
    const sanitized = await config
    for (const slug of ['media', 'audit-logs']) {
      const col = sanitized.collections.find((c) => c.slug === slug)
      expect(col?.enableQueryPresets).toBe(true)
    }
    for (const slug of ['articles', 'projects']) {
      const col = sanitized.collections.find((c) => c.slug === slug)
      expect(Boolean(col?.enableQueryPresets)).toBe(false)
    }
    expect(sanitized.collections.some((c) => c.slug === 'payload-query-presets')).toBe(true)

    // Header is registered as a Global with brief label "Header" (not a collection)
    expect(sanitized.collections.some((c) => String(c.slug) === 'header')).toBe(false)
    const headerGlobal = sanitized.globals.find((g) => g.slug === 'header')
    expect(headerGlobal?.label).toBe('Header')

    // Collapsed sidebar rail hides Browse-by-Folder label overflow and hub pages use wide .pocms-hub-container
    const navRailCss = fs.readFileSync(
      path.join(process.cwd(), 'src/styles/admin/nav-rail.css'),
      'utf8',
    )
    expect(navRailCss).toContain('.browse-by-folder-button')
    expect(navRailCss).toContain('font-size: 0;')

    const articleCss = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(frontend)/styles/article.css'),
      'utf8',
    )
    expect(articleCss).not.toMatch(/\.articles-hub\s*\{[^}]*max-width:\s*1140px/)

    // RichTextContent is rendered inside 'use client' Live Preview trees and must never import
    // server-only Payload config modules (@/fields/*, @/collections/*, payload) that pull in 'fs'.
    const richTextContentSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(frontend)/components/richtext/RichTextContent.tsx'),
      'utf8',
    )
    expect(richTextContentSrc).not.toContain("@/fields/")
  })

  it('detects redirect chains (A -> B -> C), redirect loops (A -> B -> A), and orphaned Media across Lexical & SEO', async () => {
    const graph = analyzeRedirectGraph([
      { id: 1, from: '/old-a', to: { type: 'custom', url: '/mid-b' } },
      { id: 2, from: '/mid-b', to: { type: 'custom', url: '/articles/final-c' } },
      { id: 3, from: '/loop-x', to: { type: 'custom', url: '/loop-y' } },
      { id: 4, from: '/loop-y', to: { type: 'custom', url: '/loop-x' } },
      { id: 5, from: '/clean', to: { type: 'custom', url: '/projects/clean-dest' } },
    ])
    expect(graph.chainCount).toBe(1)
    expect(graph.loopCount).toBe(2)
    expect(graph.problematicIds).toEqual([1, 3, 4])

    const referenced = collectReferencedMediaIds({
      header: { profileImage: 10, archiveHeader: { backgroundImage: { id: 11 } } },
      articles: [
        {
          image: 12,
          meta: { image: 13 },
          content: buildLexicalDocument([
            lexicalBlockNode({ blockType: 'mediaBlock', media: { id: 14 } }),
          ]),
        },
      ],
      projects: [{ image: { id: 15 } }],
      siteSettings: { ogImage: 16 },
    })
    expect(findOrphanedMediaIds([10, 11, 12, 13, 14, 15, 16, 99, 100], referenced)).toEqual([
      99,
      100,
    ])

    const mockPayload = {
      config: { routes: { admin: '/admin' } },
      count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
      findGlobal: vi.fn(async ({ slug }: { slug: string }) => {
        if (slug === 'header') return { sureName: 'Amir v.Tarikhi', profileImage: 1 }
        if (slug === 'site-settings') return { siteTitle: 'PoCMS', ownerName: 'Amir' }
        if (slug === 'navigation') return { items: [{ label: 'Home', enabled: true }] }
        if (slug === 'footer') return { socialLinks: [{ platform: 'github' }] }
        return {}
      }),
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'articles') {
          return {
            totalDocs: 2,
            docs: [
              { id: 1, _status: 'published', image: 1, excerpt: 'Valid summary' },
              { id: 2, _status: 'draft', image: null, imageUrl: '', excerpt: '', meta: {} },
            ],
          }
        }
        if (collection === 'projects') {
          return {
            totalDocs: 1,
            docs: [{ id: 10, _status: 'published', image: 1, excerpt: 'Project summary' }],
          }
        }
        if (collection === 'media') {
          return { totalDocs: 2, docs: [{ id: 1 }, { id: 77 }] }
        }
        if (collection === 'redirects') {
          return {
            totalDocs: 2,
            docs: [
              { id: 1, from: '/step-1', to: { type: 'custom', url: '/step-2' } },
              { id: 2, from: '/step-2', to: { type: 'custom', url: '/articles/final' } },
            ],
          }
        }
        return { totalDocs: 0, docs: [] }
      }),
    } as unknown as Payload

    const report = await auditContentHealth(mockPayload)
    expect(report.missingArticleImages).toBe(1)
    expect(report.missingArticleSeoDescriptions).toBe(1)
    expect(report.draftBacklogCount).toBe(1)
    expect(report.orphanedMediaIds).toEqual([77])
    expect(report.redirectChainCount).toBe(1)

    const widgetNode = await ContentHealthWidget({
      req: {
        payload: mockPayload,
        user: makeUser({ media: 'read', redirects: 'read', articles: 'edit', projects: 'edit' }),
      } as unknown as PayloadRequest,
    } as never)
    render(widgetNode)
    expect(screen.getByText(/1 unpublished draft/i)).toBeDefined()
    expect(screen.getByText(/1 media upload is unreferenced/i)).toBeDefined()
    expect(screen.getByText(/1 redirect has chains/i)).toBeDefined()
  })
})

describe('Milestone 4.3: Production Security Tightening', () => {
  it('enforces fail-fast PAYLOAD_SECRET in production, brute-force lockout, disabled GraphQL Playground, and Live-Preview-safe security headers', async () => {
    expect(() => resolvePayloadSecret({ NODE_ENV: 'production', PAYLOAD_SECRET: '' })).toThrow(
      /FATAL: PAYLOAD_SECRET/,
    )
    expect(() =>
      resolvePayloadSecret({ NODE_ENV: 'production', PAYLOAD_SECRET: 'too-short' }),
    ).toThrow(/FATAL: PAYLOAD_SECRET/)
    expect(
      resolvePayloadSecret({
        NODE_ENV: 'production',
        PAYLOAD_SECRET: 'strong-production-secret-2026',
      }),
    ).toBe('strong-production-secret-2026')

    const sanitized = await config
    expect(sanitized.graphQL.disablePlaygroundInProduction).toBe(true)

    const users = sanitized.collections.find((c) => c.slug === 'users')
    expect(typeof users?.auth === 'object' && users.auth.maxLoginAttempts).toBe(5)
    expect(typeof users?.auth === 'object' && users.auth.lockTime).toBe(600_000)

    const headerKeys = SECURITY_HEADERS.map((h) => h.key.toLowerCase())
    expect(headerKeys).toContain('x-content-type-options')
    expect(headerKeys).toContain('referrer-policy')
    expect(headerKeys).toContain('permissions-policy')
    // Must omit X-Frame-Options: DENY so Payload Admin Live Preview & preview iframes work.
    expect(headerKeys).not.toContain('x-frame-options')
  })
})
