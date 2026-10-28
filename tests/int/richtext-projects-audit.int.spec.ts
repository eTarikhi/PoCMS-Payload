import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest, WidgetServerProps } from 'payload'

import config from '@/payload.config'
import { governedEntities } from '@/access/permissions'
import {
  preventAuditLogDeletion,
  preventAuditLogMutation,
} from '@/collections/AuditLogs'
import {
  computeChangedFields,
  resolveAuditAction,
} from '@/plugins/auditLog'
import { RecentChangesWidget } from '@/components/admin/widgets/RecentChanges'
import {
  buildLexicalDocument,
  calculateReadTimeMinutes,
  extractTableOfContents,
  hasLexicalContent,
  lexicalBlockNode,
  lexicalBulletListNode,
  lexicalHeadingNode,
  lexicalParagraphNode,
  lexicalTextNode,
} from '@/app/(frontend)/lib/lexical'
import { computeReadTimeBeforeChange } from '@/app/(frontend)/lib/hooks'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import { mapArticles, mapProjects } from '@/app/(frontend)/lib/mappers'
import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import {
  buildArticlesHubJsonLd,
  buildArticlesHubMetadata,
  buildProjectJsonLd,
  buildProjectMetadata,
} from '@/app/(frontend)/lib/seo'
import { RichTextContent } from '@/app/(frontend)/components/richtext/RichTextContent'
import { TableOfContents } from '@/app/(frontend)/components/richtext/TableOfContents'
import { ArticlesArchive } from '@/app/(frontend)/components/article/ArticlesArchive'
import { ArticlesSection } from '@/app/(frontend)/components/sections/ArticlesSection'
import { ProjectsGrid } from '@/app/(frontend)/components/sections/ProjectsGrid'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import type { Article, Project } from '@/payload-types'

afterEach(() => {
  cleanup()
})

const sampleLexicalDoc = () =>
  buildLexicalDocument([
    lexicalParagraphNode([
      lexicalTextNode(
        ' Payload v3 combines Next.js Server Components with Lexical rich text and structured blocks. '.repeat(
          18,
        ),
      ),
    ]),
    lexicalHeadingNode('h2', 'System Architecture'),
    lexicalParagraphNode([lexicalTextNode('Core architecture notes and module boundaries.')]),
    lexicalBlockNode({
      blockType: 'code',
      language: 'typescript',
      filename: 'src/example.ts',
      code: 'export const answer: number = 42\nconsole.log(answer)',
    }),
    lexicalBlockNode({
      blockType: 'callout',
      variant: 'tip',
      title: 'Zero-DB unit tests',
      content: 'Keep mappers pure so integration specs run in milliseconds.',
    }),
    lexicalHeadingNode('h3', 'System Architecture'),
    lexicalBulletListNode(['Immutable audit logs', 'Deterministic ToC anchors']),
    lexicalBlockNode({
      blockType: 'mediaBlock',
      imageUrl: '/images/projects/SepiWhite.webp',
      size: 'wide',
      caption: 'Production architecture diagram',
    }),
  ])

describe('Feature 1: Lexical Rich Text + Blocks, ReadTime, and Table of Contents', () => {
  it('configures Lexical richText fields with Code, Callout, and Media blocks on Articles and Projects', async () => {
    const sanitized = await config

    const findNamedField = (
      fields: readonly unknown[],
      targetName: string,
    ): { type?: string } | undefined => {
      for (const raw of fields) {
        const f = raw as { name?: string; type?: string; fields?: readonly unknown[]; tabs?: Array<{ fields?: readonly unknown[] }> }
        if (f?.name === targetName) return f
        if (Array.isArray(f?.fields)) {
          const found = findNamedField(f.fields, targetName)
          if (found) return found
        }
        if (Array.isArray(f?.tabs)) {
          for (const tab of f.tabs) {
            if (Array.isArray(tab?.fields)) {
              const found = findNamedField(tab.fields, targetName)
              if (found) return found
            }
          }
        }
      }
      return undefined
    }

    for (const slug of ['articles', 'projects'] as const) {
      const collection = sanitized.collections.find((c) => c.slug === slug)
      expect(collection).toBeDefined()
      const contentField = findNamedField(collection?.fields ?? [], 'content')
      expect(contentField?.type).toBe('richText')
      expect(collection?.hooks.beforeValidate?.length).toBeGreaterThan(0)
      expect(collection?.hooks.beforeChange?.length).toBeGreaterThan(0)
      expect(collection?.admin.livePreview?.url).toBeTypeOf('function')
      expect(collection?.admin.preview).toBeTypeOf('function')
    }
  })

  it('distinguishes empty Lexical scaffolds from populated prose and blocks, and auto-calculates readTime', () => {
    const emptyScaffold = buildLexicalDocument([lexicalParagraphNode([])])
    expect(hasLexicalContent(null)).toBe(false)
    expect(hasLexicalContent(emptyScaffold)).toBe(false)

    const richDoc = sampleLexicalDoc()
    expect(hasLexicalContent(richDoc)).toBe(true)

    const minutes = calculateReadTimeMinutes({ content: richDoc }, 200)
    expect(minutes).toBeGreaterThanOrEqual(2)

    // Hook computes readTime when Lexical content is present
    const updated = computeReadTimeBeforeChange({
      data: { title: 'Post', content: richDoc },
      originalDoc: {},
    } as never) as Record<string, unknown>
    expect(updated.readTime).toBe(minutes)

    // Hook preserves manual readTime on body-less link-out articles
    const linkOnly = computeReadTimeBeforeChange({
      data: { title: 'External Post', content: emptyScaffold, readTime: 6 },
      originalDoc: {},
    } as never) as Record<string, unknown>
    expect(linkOnly.readTime).toBe(6)
  })

  it('extracts deduplicated Table of Contents headings matching rendered DOM heading IDs and custom blocks', () => {
    const richDoc = sampleLexicalDoc()
    const toc = extractTableOfContents(richDoc)

    expect(toc).toEqual([
      { id: 'system-architecture', text: 'System Architecture', level: 2 },
      { id: 'system-architecture-2', text: 'System Architecture', level: 3 },
    ])

    const { container } = render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TableOfContents, { items: toc }),
        React.createElement(RichTextContent, { data: richDoc as never }),
      ),
    )

    // ToC anchors match rendered H2/H3 element IDs
    const nav = screen.getByRole('navigation', { name: 'Table of contents' })
    const links = nav.querySelectorAll('a')
    expect(links).toHaveLength(2)
    expect(links[0].getAttribute('href')).toBe('#system-architecture')
    expect(links[1].getAttribute('href')).toBe('#system-architecture-2')

    expect(container.querySelector('h2#system-architecture')?.textContent).toBe(
      'System Architecture',
    )
    expect(container.querySelector('h3#system-architecture-2')?.textContent).toBe(
      'System Architecture',
    )

    // Code block renders language badge, filename, highlighted code, and copy button
    expect(screen.getByText('TypeScript')).toBeTruthy()
    expect(screen.getByText('src/example.ts')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Copy code/i })).toBeTruthy()
    expect(container.querySelector('.rich-code-pre')?.textContent).toContain('answer')

    // Callout block renders role="note", title, and body
    const callout = screen.getByRole('note', { name: 'Zero-DB unit tests' })
    expect(callout.getAttribute('data-variant')).toBe('tip')
    expect(callout.textContent).toContain('Keep mappers pure')

    // MediaBlock renders figure + caption
    expect(screen.getByText('Production architecture diagram')).toBeTruthy()
    expect(screen.getByAltText('Production architecture diagram')).toBeTruthy()
  })

  it('keeps backward compatibility for legacy plain-text article descriptions', () => {
    const legacyArticle = {
      id: 99,
      title: 'Legacy Post',
      slug: 'legacy-post',
      excerpt: 'Summary',
      description: 'First paragraph.\n\nSecond paragraph.',
      publishedAt: '2025-01-10T00:00:00.000Z',
      updatedAt: '2025-01-10T00:00:00.000Z',
      createdAt: '2025-01-10T00:00:00.000Z',
    } as Article

    const detail = mapArticleDetail(legacyArticle)
    expect(detail).not.toBeNull()
    expect(detail?.paragraphs).toEqual(['First paragraph.', 'Second paragraph.'])
    expect(hasLexicalContent(detail?.content)).toBe(true)
    expect(detail?.readTimeDisplay).toBe('1 min')
  })
})

describe('Feature 2: Project Case Studies (/projects/[slug]), /articles Hub & Featured Toggle', () => {
  it('maps Project case studies, metadata, JSON-LD, ProjectLayout, and ProjectsGrid links', () => {
    const caseStudyDoc: Project = {
      id: 1,
      title: 'AlyaPanel',
      slug: 'alyapanel',
      excerpt: 'Enterprise CRM & fulfillment suite.',
      role: 'Principal Architect',
      client: 'Enterprise Ops',
      year: '2025',
      techStack: ['Next.js', 'Payload CMS', 'PostgreSQL'],
      categories: ['front-end', 'cms-crm'],
      src: '/images/projects/AlyaPanel.webp',
      placeHolder: '/images/projects/thumb/AlyaPanel.webp',
      url: 'https://alyapanel.example.com',
      content: sampleLexicalDoc() as unknown as Project['content'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const externalOnlyDoc: Project = {
      id: 2,
      title: 'QuickLanding',
      slug: 'quicklanding',
      categories: ['front-end'],
      src: '/images/projects/ARKBlog.webp',
      placeHolder: '/images/projects/thumb/ARKBlog.webp',
      url: 'https://quick.example.com',
      content: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(mapProjectDetail(externalOnlyDoc)).toBeNull()

    const detail = mapProjectDetail(caseStudyDoc)
    expect(detail).not.toBeNull()
    expect(detail?.categoryLabels).toEqual(['Front-End', 'CMS-CRM'])
    expect(detail?.techStack).toEqual(['Next.js', 'Payload CMS', 'PostgreSQL'])
    expect(detail?.toc).toHaveLength(2)

    const meta = buildProjectMetadata(detail!, undefined, 'https://vtarikhi.com')
    expect(meta.title).toBe('AlyaPanel — Case study')
    expect(meta.alternates?.canonical).toBe('https://vtarikhi.com/projects/alyapanel')

    const jsonLd = buildProjectJsonLd(detail!, null, null, undefined, 'https://vtarikhi.com')
    expect(jsonLd['@type']).toBe('CreativeWork')
    expect(jsonLd.keywords).toBe('Next.js, Payload CMS, PostgreSQL')

    const mappedGrid = mapProjects([caseStudyDoc, externalOnlyDoc])
    expect(mappedGrid.items[0].pagePath).toBe('/projects/alyapanel')
    expect(mappedGrid.items[1].pagePath).toBeNull()

    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(ProjectsGrid, {
          filters: mappedGrid.filters,
          items: mappedGrid.items,
        }),
        React.createElement(ProjectLayout, { project: detail! }),
      ),
    )

    expect(screen.getByLabelText('Case study: AlyaPanel').getAttribute('href')).toBe(
      '/projects/alyapanel',
    )
    expect(screen.queryByLabelText('Case study: QuickLanding')).toBeNull()
    expect(screen.getByText('Principal Architect')).toBeTruthy()
    expect(screen.getByText('Enterprise Ops')).toBeTruthy()
    expect(screen.getByText('Payload CMS')).toBeTruthy()
  })

  it('wires the featured article spotlight on the home page and supports search + filtering on /articles', () => {
    const rawArticles: Article[] = [
      {
        id: 1,
        title: 'Zero-Downtime Postgres Upgrades',
        slug: 'zero-downtime-postgres',
        excerpt: 'Blue-green logical replication strategies.',
        featured: true,
        category: 'articles',
        publishedAt: '2026-02-01T12:00:00.000Z',
        content: sampleLexicalDoc() as unknown as Article['content'],
        imageUrl: '/images/articles/1735708966846.webp',
        link: 'https://linkedin.com/pulse/postgres',
        createdAt: '2026-02-01T12:00:00.000Z',
        updatedAt: '2026-02-01T12:00:00.000Z',
      },
      {
        id: 2,
        title: 'Career Reflections in Software',
        slug: 'career-reflections',
        excerpt: 'Lessons from leading distributed teams.',
        featured: false,
        category: 'others',
        publishedAt: '2026-01-15T12:00:00.000Z',
        readTime: 4,
        imageUrl: '/images/articles/1733263816314.webp',
        link: 'https://linkedin.com/pulse/career',
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      },
    ]

    const mapped = mapArticles(rawArticles)
    expect(mapped[0].featured).toBe(true)
    expect(mapped[0].pagePath).toBe('/articles/zero-downtime-postgres')
    expect(mapped[1].featured).toBe(false)
    expect(mapped[1].pagePath).toBeNull()

    const hubMeta = buildArticlesHubMetadata(undefined, 'https://vtarikhi.com')
    expect(hubMeta.alternates?.canonical).toBe('https://vtarikhi.com/articles')
    const hubLd = buildArticlesHubJsonLd(mapped, undefined, 'https://vtarikhi.com')
    expect(hubLd['@type']).toBe('CollectionPage')

    // Home-page ArticlesSection keeps the 3-column grid (no col-12 list banner) and sorts featured first
    const reversedOrder = [mapped[1], mapped[0]]
    const homeRender = render(React.createElement(ArticlesSection, { articles: reversedOrder }))
    const homeCards = homeRender.container.querySelectorAll('article')
    expect(homeCards).toHaveLength(2)
    expect(
      Array.from(homeCards).every((card) => card.classList.contains('col-lg-4')),
    ).toBe(true)
    expect(homeRender.container.querySelector('article.col-12')).toBeNull()
    expect(homeCards[0].getAttribute('data-featured')).toBe('true')
    expect(homeCards[0].textContent).toContain('Zero-Downtime Postgres Upgrades')
    homeRender.unmount()

    // /articles Archive hub keeps the 3-column grid and supports live search & category filtering
    const archiveRender = render(React.createElement(ArticlesArchive, { articles: reversedOrder }))
    expect(screen.getByText('Showing 2 of 2 articles')).toBeTruthy()
    const archiveCards = archiveRender.container.querySelectorAll('article')
    expect(
      Array.from(archiveCards).every((card) => card.classList.contains('col-lg-4')),
    ).toBe(true)
    expect(archiveCards[0].getAttribute('data-featured')).toBe('true')
    expect(archiveCards[0].textContent).toContain('Zero-Downtime Postgres Upgrades')

    // Filter by category "Others"
    fireEvent.click(screen.getByRole('button', { name: 'Others' }))
    expect(screen.getByText('Showing 1 of 2 articles')).toBeTruthy()
    expect(screen.queryByText('Zero-Downtime Postgres Upgrades')).toBeNull()
    expect(screen.getByText('Career Reflections in Software')).toBeTruthy()

    // Filter by "On this site"
    fireEvent.click(screen.getByRole('button', { name: 'On this site' }))
    expect(screen.getByText('Showing 1 of 2 articles')).toBeTruthy()
    expect(screen.getByText('Zero-Downtime Postgres Upgrades')).toBeTruthy()

    // Search with no match -> Reset filters restores all
    const searchInput = screen.getByLabelText('Search articles')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-topic-xyz' } })
    expect(screen.getByText('Showing 0 of 2 articles')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByText('Showing 2 of 2 articles')).toBeTruthy()
  })
})

describe('Feature 3: Immutable Audit Log (viewAuditLog) & RecentChanges Attribution', () => {
  it('enforces viewAuditLog capability access and rejects any mutation or deletion on audit-logs', async () => {
    const sanitized = await config
    const auditCollection = sanitized.collections.find((c) => c.slug === 'audit-logs')
    expect(auditCollection).toBeDefined()
    expect(auditCollection?.admin.group).toBe('Admin')

    // Opted out of CRUD role levels; governed via the `viewAuditLog` capability instead.
    const entities = governedEntities(sanitized)
    expect(entities.some((e) => e.slug === 'audit-logs')).toBe(false)

    const editorWithoutCap = {
      id: 2,
      email: 'editor@example.com',
      permissions: {
        fullAccess: false,
        roles: ['Editor'],
        levels: { articles: 'edit' },
        capabilities: [],
      },
    }
    const auditorUser = {
      id: 3,
      email: 'auditor@example.com',
      permissions: {
        fullAccess: false,
        roles: ['Auditor'],
        levels: {},
        capabilities: ['viewAuditLog'],
      },
    }

    expect(
      auditCollection?.access.read?.({ req: { user: editorWithoutCap } } as never),
    ).toBe(false)
    expect(
      auditCollection?.access.read?.({ req: { user: auditorUser } } as never),
    ).toBe(true)
    expect(auditCollection?.access.create?.({ req: { user: auditorUser } } as never)).toBe(false)
    expect(auditCollection?.access.update?.({ req: { user: auditorUser } } as never)).toBe(false)
    expect(auditCollection?.access.delete?.({ req: { user: auditorUser } } as never)).toBe(false)

    const hiddenFn = auditCollection?.admin.hidden as (args: { user: unknown }) => boolean
    expect(hiddenFn({ user: editorWithoutCap })).toBe(true)
    expect(hiddenFn({ user: auditorUser })).toBe(false)

    // Immutability hooks reject updates & deletes even with overrideAccess
    expect(() =>
      preventAuditLogMutation({
        data: { summary: 'tampered' },
        operation: 'update',
      } as never),
    ).toThrow(/immutable/i)
    expect(() => preventAuditLogDeletion({} as never)).toThrow(/immutable/i)
  })

  it('records create, update, trash, restore, delete, global update, and login events via auditLogPlugin', async () => {
    const sanitized = await config
    const recorded: Array<Record<string, unknown>> = []

    const actorUser = { id: 7, name: 'Amir Tarikhi', email: 'amir@vtarikhi.com' }
    const mockReq = {
      user: actorUser,
      context: {},
      headers: new Headers({
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'user-agent': 'Vitest/4.0',
      }),
      payload: {
        create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
          expect(collection).toBe('audit-logs')
          recorded.push(data)
          return { id: recorded.length, ...data }
        }),
        logger: { error: vi.fn() },
      },
    } as unknown as PayloadRequest

    const articlesCol = sanitized.collections.find((c) => c.slug === 'articles')!
    const usersCol = sanitized.collections.find((c) => c.slug === 'users')!
    const siteSettingsGlobal = sanitized.globals.find((g) => g.slug === 'site-settings')!

    // 1. Create article
    for (const hook of articlesCol.hooks.afterChange) {
      await hook({
        collection: articlesCol,
        context: { skipRevalidate: true },
        data: {},
        doc: { id: 101, title: 'DevOps Guide', deletedAt: null },
        operation: 'create',
        previousDoc: {},
        req: mockReq,
      } as never)
    }

    // 2. Edit article
    for (const hook of articlesCol.hooks.afterChange) {
      await hook({
        collection: articlesCol,
        context: { skipRevalidate: true },
        data: {},
        doc: { id: 101, title: 'DevOps Guide v2', deletedAt: null },
        operation: 'update',
        previousDoc: { id: 101, title: 'DevOps Guide', deletedAt: null },
        req: mockReq,
      } as never)
    }

    // 3. Move article to trash (`deletedAt` transitions from null -> timestamp)
    for (const hook of articlesCol.hooks.afterChange) {
      await hook({
        collection: articlesCol,
        context: { skipRevalidate: true },
        data: {},
        doc: { id: 101, title: 'DevOps Guide v2', deletedAt: '2026-10-25T04:00:00.000Z' },
        operation: 'update',
        previousDoc: { id: 101, title: 'DevOps Guide v2', deletedAt: null },
        req: mockReq,
      } as never)
    }

    // 4. Restore article from trash
    for (const hook of articlesCol.hooks.afterChange) {
      await hook({
        collection: articlesCol,
        context: { skipRevalidate: true },
        data: {},
        doc: { id: 101, title: 'DevOps Guide v2', deletedAt: null },
        operation: 'update',
        previousDoc: { id: 101, title: 'DevOps Guide v2', deletedAt: '2026-10-25T04:00:00.000Z' },
        req: mockReq,
      } as never)
    }

    // 5. Permanently delete article
    for (const hook of articlesCol.hooks.afterDelete) {
      await hook({
        collection: articlesCol,
        context: { skipRevalidate: true },
        doc: { id: 101, title: 'DevOps Guide v2' },
        id: 101,
        req: mockReq,
      } as never)
    }

    // 6. Update global (`site-settings`)
    for (const hook of siteSettingsGlobal.hooks.afterChange) {
      await hook({
        context: { skipRevalidate: true },
        doc: { siteName: 'Updated Site' },
        global: siteSettingsGlobal,
        previousDoc: { siteName: 'Old Site' },
        req: mockReq,
      } as never)
    }

    // 7. User login (`afterLogin`) + verify internal auth-counter update on users is ignored
    for (const hook of usersCol.hooks.afterChange) {
      await hook({
        collection: usersCol,
        context: {},
        data: {},
        doc: { id: 7, email: 'amir@vtarikhi.com', loginAttempts: 0 },
        operation: 'update',
        previousDoc: { id: 7, email: 'amir@vtarikhi.com', loginAttempts: 1 },
        req: mockReq,
      } as never)
    }
    for (const hook of usersCol.hooks.afterLogin) {
      await hook({
        collection: usersCol,
        context: {},
        req: mockReq,
        token: 'jwt',
        user: actorUser,
      } as never)
    }

    expect(recorded.map((r) => r.action)).toEqual([
      'create',
      'update',
      'trash',
      'restore',
      'delete',
      'update',
      'login',
    ])
    expect(recorded[0]).toMatchObject({
      action: 'create',
      entityKind: 'collection',
      entityType: 'articles',
      documentId: '101',
      documentTitle: 'DevOps Guide',
      actor: 7,
      actorName: 'Amir Tarikhi',
      actorEmail: 'amir@vtarikhi.com',
      ip: '203.0.113.10',
      userAgent: 'Vitest/4.0',
    })
    expect((recorded[1].meta as { changedFields: string[] }).changedFields).toEqual(['title'])
    expect(recorded[5]).toMatchObject({
      action: 'update',
      entityKind: 'global',
      entityType: 'site-settings',
    })
    expect(recorded[6]).toMatchObject({
      action: 'login',
      entityKind: 'auth',
      entityType: 'users',
      summary: 'Amir Tarikhi signed in',
    })

    // Helper unit checks
    expect(
      resolveAuditAction({
        operation: 'update',
        doc: { deletedAt: '2026-10-25' },
        previousDoc: { deletedAt: null },
      }),
    ).toBe('trash')
    expect(
      computeChangedFields(
        { id: 1, title: 'B', updatedAt: 't2', hash: 'h2' },
        { id: 1, title: 'A', updatedAt: 't1', hash: 'h1' },
      ),
    ).toEqual(['title'])
  })

  it('attributes recent changes to actors in RecentChangesWidget and links to audit-logs for authorized users', async () => {
    const findCalls: string[] = []
    const mockReq = {
      i18n: { language: 'en' },
      user: {
        id: 1,
        permissions: {
          fullAccess: false,
          roles: ['Auditor'],
          levels: { articles: 'read', projects: 'read' },
          capabilities: ['viewAuditLog'],
        },
      },
      payload: {
        config: { routes: { admin: '/admin' } },
        collections: {
          articles: { config: { admin: { useAsTitle: 'title' }, labels: { plural: 'Articles' } } },
          projects: { config: { admin: { useAsTitle: 'title' }, labels: { plural: 'Projects' } } },
          'audit-logs': { config: { slug: 'audit-logs' } },
        },
        find: vi.fn(async ({ collection }: { collection: string }) => {
          findCalls.push(collection)
          if (collection === 'articles') {
            return {
              docs: [{ id: 12, title: 'Lexical Deep Dive', updatedAt: '2026-10-25T03:55:00.000Z' }],
            }
          }
          if (collection === 'projects') {
            return {
              docs: [{ id: 5, title: 'SepiWhite', updatedAt: '2026-10-25T03:50:00.000Z' }],
            }
          }
          if (collection === 'audit-logs') {
            return {
              docs: [
                {
                  action: 'create',
                  entityType: 'articles',
                  documentId: '12',
                  actorName: 'Sara Kaya',
                  actorEmail: 'sara@example.com',
                },
                {
                  action: 'trash',
                  entityType: 'projects',
                  documentId: '5',
                  actorName: null,
                  actorEmail: 'ops@example.com',
                },
              ],
            }
          }
          return { docs: [] }
        }),
      },
    } as unknown as WidgetServerProps['req']

    const element = await RecentChangesWidget({ req: mockReq } as WidgetServerProps)
    render(element)

    // Single batched audit-logs query
    expect(findCalls.filter((c) => c === 'audit-logs')).toHaveLength(1)
    expect(screen.getByText('Lexical Deep Dive')).toBeTruthy()
    expect(screen.getByText('Sara Kaya')).toBeTruthy()
    expect(screen.getByText(/created by/i)).toBeTruthy()
    expect(screen.getByText('ops@example.com')).toBeTruthy()
    expect(screen.getByText(/trashed by/i)).toBeTruthy()
    expect(screen.getByText('Audit log →').closest('a')?.getAttribute('href')).toBe(
      '/admin/collections/audit-logs',
    )
  })
})
