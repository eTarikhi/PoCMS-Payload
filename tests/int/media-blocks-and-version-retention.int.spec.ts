// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { ArticlesArchive } from '@/app/(frontend)/components/article/ArticlesArchive'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import {
  DEFAULT_SITE_SETTINGS,
  mapArticles,
  mapProjects,
  resolveArticleDetailMedia,
  resolveArticlePrimaryMedia,
  resolveProjectDetailMedia,
  resolveProjectPrimaryMedia,
} from '@/app/(frontend)/lib/mappers'
import {
  ARTICLE_CARD_SELECT,
  ARTICLE_DETAIL_SELECT,
  PROJECT_CARD_SELECT,
  PROJECT_DETAIL_SELECT,
} from '@/app/(frontend)/lib/payload-source'
import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import { adminVersionsEndpoints } from '@/endpoints/adminVersions'
import { createJobsConfig, REGISTERED_JOB_TASKS } from '@/jobs/config'
import { collectReferencedMediaIds } from '@/lib/contentHealth'
import {
  enrichArticleStaticImageMetaBeforeChange,
  enrichProjectStaticImageMetaBeforeChange,
  syncArticleMediaBlocksBeforeValidate,
  syncProjectMediaBlocksBeforeValidate,
} from '@/lib/staticImageMeta'
import {
  inspectDocumentVersionRetention,
  inspectVersionRetention,
  pruneContentVersions,
} from '@/lib/versionRetention'
import {
  DEFAULT_MAX_VERSIONS_PER_DOC,
  planVersionRetention,
  type VersionRowSnapshot,
} from '@/lib/versionRetentionShared'
import type { Article, Media as MediaDoc, Project } from '@/payload-types'
import config from '@/payload.config'

const sampleBody: Article['content'] = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Decoupled media & version retention test body.',
            version: 1,
          },
        ],
      },
    ],
  },
}

const makeMedia = (id: number, slug: string): MediaDoc => ({
  id,
  alt: `${slug} alt`,
  url: `/api/media/file/${slug}.webp`,
  width: 1600,
  height: 900,
  sizes: {
    thumbnail: { url: `/api/media/file/${slug}-400x300.webp`, width: 400, height: 300 },
    card: { url: `/api/media/file/${slug}-800x520.webp`, width: 800, height: 520 },
    content: { url: `/api/media/file/${slug}-1080.webp`, width: 1080, height: 608 },
    hero: { url: `/api/media/file/${slug}-1600.webp`, width: 1600, height: 900 },
    og: { url: `/api/media/file/${slug}-1200x630.webp`, width: 1200, height: 630 },
  },
  updatedAt: '2026-10-30T00:00:00.000Z',
  createdAt: '2026-10-30T00:00:00.000Z',
})

describe('Two-Block Decoupled Media Management (Primary Media vs Detail Media)', () => {
  it('auto-maps primaryMedia into detailMedia.items[0] on explicit save while skipping 1s autosave ticks', async () => {
    const autosavePayload = {
      title: 'Autosave Typing Test',
      primaryMedia: {
        mode: 'single',
        source: 'url',
        imageUrl: '/images/ar',
      },
    }

    const duringAutosave = await syncArticleMediaBlocksBeforeValidate({
      data: autosavePayload,
      originalDoc: undefined,
      operation: 'update',
      req: { query: { autosave: 'true' } },
    } as never)
    expect((duringAutosave as Record<string, unknown>).detailMedia).toBeUndefined()

    const savedArticle = (await syncArticleMediaBlocksBeforeValidate({
      data: {
        title: 'Saved Article',
        primaryMedia: {
          mode: 'single',
          source: 'url',
          imageUrl: '/images/articles/1735708966846.webp',
          alt: 'DevOps roadmap card',
        },
      },
      originalDoc: undefined,
      operation: 'create',
      req: { query: {} },
    } as never)) as Record<string, unknown>

    const dm = savedArticle.detailMedia as {
      mode?: string
      items?: Array<{ source?: string; imageUrl?: string; alt?: string }>
    }
    expect(dm?.mode).toBe('single')
    expect(dm?.items).toHaveLength(1)
    expect(dm?.items?.[0]).toMatchObject({
      source: 'url',
      imageUrl: '/images/articles/1735708966846.webp',
      alt: 'DevOps roadmap card',
    })

    // Also verify sharp blurDataURL enrichment runs on both primaryMedia and detailMedia.items[0]
    const enriched = (await enrichArticleStaticImageMetaBeforeChange({
      data: savedArticle,
    } as never)) as Record<string, unknown>
    expect(
      (enriched.primaryMedia as { urlMeta?: { blurDataURL?: string } })?.urlMeta?.blurDataURL,
    ).toMatch(/^data:image\/webp;base64,/)
    expect(
      (
        enriched.detailMedia as {
          items?: Array<{ urlMeta?: { blurDataURL?: string } }>
        }
      )?.items?.[0]?.urlMeta?.blurDataURL,
    ).toMatch(/^data:image\/webp;base64,/)

    // Verify legacy seed-style Project creation hydrates both primaryMedia (with thumbnailUrl) & detailMedia.items[0]
    const savedProject = (await syncProjectMediaBlocksBeforeValidate({
      data: {
        title: 'Seeded Project',
        src: '/images/articles/1735708966846.webp',
        placeHolder: '/images/articles/1733263816314.webp',
      },
      originalDoc: undefined,
      operation: 'create',
      req: { query: {} },
    } as never)) as Record<string, unknown>

    expect(savedProject.primaryMedia).toMatchObject({
      mode: 'single',
      source: 'url',
      imageUrl: '/images/articles/1735708966846.webp',
      thumbnailUrl: '/images/articles/1733263816314.webp',
    })
    expect(
      (savedProject.detailMedia as { items?: Array<{ imageUrl?: string }> })?.items?.[0]?.imageUrl,
    ).toBe('/images/articles/1735708966846.webp')

    const enrichedProj = (await enrichProjectStaticImageMetaBeforeChange({
      data: savedProject,
    } as never)) as Record<string, unknown>
    expect(
      (enrichedProj.primaryMedia as { urlMeta?: { width?: number } })?.urlMeta?.width,
    ).toBeGreaterThan(0)
  })

  it('completely decouples listing cards (/, /articles, /projects) from slug detail pages (/articles/[slug], /projects/[slug])', () => {
    const cardUpload = makeMedia(101, 'card-only')
    const gallerySlide1 = makeMedia(201, 'slug-slide-1')
    const gallerySlide2 = makeMedia(202, 'slug-slide-2')

    // Case A: Article with Single Image on cards, but "No picture" on /articles/[slug]
    const cardOnlyArticle: Article = {
      id: 50,
      title: 'Card Image Only Article',
      slug: 'card-image-only',
      excerpt: 'Has card image on / and /articles, pure typography on /articles/[slug].',
      primaryMedia: {
        mode: 'single',
        source: 'upload',
        media: cardUpload,
      },
      detailMedia: {
        mode: 'none',
      },
      content: sampleBody,
      publishedAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
    }

    const mappedArticleCardA = mapArticles([cardOnlyArticle])[0]!
    expect(mappedArticleCardA.mediaMode).toBe('single')
    expect(mappedArticleCardA.imageUrl).toBe('/api/media/file/card-only-800x520.webp')

    const mappedArticleDetailA = mapArticleDetail(cardOnlyArticle)!
    expect(mappedArticleDetailA.mediaMode).toBe('none')
    expect(mappedArticleDetailA.coverUrl).toBeNull()

    // Case B: Project with "No picture" on /projects cards, but rich Gallery View on /projects/[slug]
    const slugGalleryProject: Project = {
      id: 60,
      title: 'Text Card + Rich Slug Gallery Project',
      slug: 'text-card-rich-gallery',
      excerpt: 'No card picture on /projects, full 2-slide gallery on /projects/[slug].',
      categories: ['front-end'],
      primaryMedia: {
        mode: 'none',
      },
      detailMedia: {
        mode: 'gallery',
        galleryLayout: 'grid',
        items: [
          { id: 'g1', source: 'upload', media: gallerySlide1, caption: 'Architecture diagram' },
          { id: 'g2', source: 'upload', media: gallerySlide2, caption: 'Telemetry view' },
        ],
      },
      content: sampleBody,
      updatedAt: '2026-10-02T00:00:00.000Z',
      createdAt: '2026-10-02T00:00:00.000Z',
    }

    const mappedProjectCardB = mapProjects([slugGalleryProject]).items[0]!
    expect(mappedProjectCardB.mediaMode).toBe('none')
    expect(mappedProjectCardB.imageUrl).toBe('')
    expect(mappedProjectCardB.thumbnailUrl).toBe('')

    const mappedProjectDetailB = mapProjectDetail(slugGalleryProject)!
    expect(mappedProjectDetailB.mediaMode).toBe('gallery')
    expect(mappedProjectDetailB.galleryLayout).toBe('grid')
    expect(mappedProjectDetailB.gallery).toHaveLength(2)

    // Render /projects archive card -> omits `.pocms-showcase-card__media` when primaryMedia.mode === 'none'
    const archiveProjectsHtml = renderToStaticMarkup(
      React.createElement(ProjectsArchive, {
        projects: [mappedProjectCardB],
        labels: DEFAULT_SITE_SETTINGS.projectsSection,
      }),
    )
    expect(archiveProjectsHtml).toContain('Text Card + Rich Slug Gallery Project')
    expect(archiveProjectsHtml).not.toContain('pocms-showcase-card__media')

    // Render /projects/[slug] -> renders full 2-slide gallery grid!
    const projectSlugHtml = renderToStaticMarkup(
      React.createElement(ProjectLayout, { project: mappedProjectDetailB }),
    )
    expect(projectSlugHtml).toContain('article-gallery-grid')
    expect(projectSlugHtml).toContain('Architecture diagram')

    // Case C: Default Detail Media ('single' with empty items[]) auto-mirrors Primary Media in Live Preview & SSR
    expect(
      resolveArticleDetailMedia({
        title: 'Live Preview Unsaved Post',
        primaryMedia: {
          mode: 'single',
          source: 'url',
          imageUrl: '/images/articles/1735708966846.webp',
        },
        detailMedia: {
          mode: 'single',
          items: [],
        },
      }).heroUrl,
    ).toBe('/images/articles/1735708966846.webp')

    expect(
      resolveProjectDetailMedia({
        title: 'Live Preview Unsaved Project',
        primaryMedia: {
          mode: 'single',
          source: 'url',
          imageUrl: '/images/projects/SepiWhite.webp',
        },
        detailMedia: {
          mode: 'single',
          items: [],
        },
      }).heroUrl,
    ).toBe('/images/projects/SepiWhite.webp')

    expect(resolveArticlePrimaryMedia(cardOnlyArticle).mode).toBe('single')
    expect(resolveProjectPrimaryMedia(slugGalleryProject).mode).toBe('none')

    // Render ArticleArchive + ArticleLayout for Case A
    const archiveArticlesHtml = renderToStaticMarkup(
      React.createElement(ArticlesArchive, {
        articles: [mappedArticleCardA],
        labels: DEFAULT_SITE_SETTINGS.articlesSection,
      }),
    )
    expect(archiveArticlesHtml).toContain('card-only-800x520.webp')

    const articleSlugHtml = renderToStaticMarkup(
      React.createElement(ArticleLayout, { article: mappedArticleDetailA }),
    )
    expect(articleSlugHtml).not.toContain('article-cover')
  })

  it('splits card vs detail query projections and protects primaryMedia/detailMedia uploads from orphan cleanup', () => {
    expect(ARTICLE_CARD_SELECT).toHaveProperty('primaryMedia', true)
    expect(ARTICLE_CARD_SELECT).not.toHaveProperty('detailMedia')
    expect(ARTICLE_CARD_SELECT).not.toHaveProperty('gallery')
    expect(ARTICLE_DETAIL_SELECT).toHaveProperty('detailMedia', true)

    expect(PROJECT_CARD_SELECT).toHaveProperty('primaryMedia', true)
    expect(PROJECT_CARD_SELECT).not.toHaveProperty('detailMedia')
    expect(PROJECT_CARD_SELECT).not.toHaveProperty('gallery')
    expect(PROJECT_DETAIL_SELECT).toHaveProperty('detailMedia', true)

    const referenced = collectReferencedMediaIds({
      articles: [
        {
          primaryMedia: { media: 301 },
          detailMedia: { items: [{ media: 302 }, { media: { id: 303 } }] },
        },
      ],
      projects: [
        {
          primaryMedia: { media: 401 },
          detailMedia: { items: [{ media: 402 }] },
        },
      ],
    })
    expect([...referenced].sort()).toEqual(['301', '302', '303', '401', '402'])
  })
})

describe('Content Version Data Retention & Pruning Policy', () => {
  it('lowers maxPerDoc to 10, registers pruneDocumentVersions job, and keeps client components free of server imports', async () => {
    const sanitized = await config
    const articles = sanitized.collections.find((c) => c.slug === 'articles')
    const projects = sanitized.collections.find((c) => c.slug === 'projects')
    expect(typeof articles?.versions === 'object' && articles.versions.maxPerDoc).toBe(
      DEFAULT_MAX_VERSIONS_PER_DOC,
    )
    expect(typeof projects?.versions === 'object' && projects.versions.maxPerDoc).toBe(
      DEFAULT_MAX_VERSIONS_PER_DOC,
    )

    expect(REGISTERED_JOB_TASKS.some((t) => t.slug === 'pruneDocumentVersions')).toBe(true)
    const jobsCfg = createJobsConfig()
    expect((jobsCfg.tasks ?? []).some((t) => t.slug === 'pruneDocumentVersions')).toBe(true)

    const clientFiles = [
      'src/lib/versionRetentionShared.ts',
      'src/components/admin/fields/DetailMediaSyncBar.tsx',
      'src/components/admin/fields/DocumentVersionRetention.tsx',
      'src/components/admin/views/Database/VersionRetentionPanel.tsx',
    ]
    for (const rel of clientFiles) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      expect(src).not.toMatch(/from\s+['"]node:/)
      expect(src).not.toMatch(/from\s+['"]next\/cache['"]/)
      expect(src).not.toMatch(/from\s+['"]pg['"]/)
      expect(src).not.toMatch(/from\s+['"]@\/collections\//)
      expect(src).not.toMatch(/from\s+['"]@\/fields\//)
    }
  })

  it('strictly protects latest=true and newest published snapshots under every retention policy', () => {
    const nowMs = Date.parse('2026-10-30T12:00:00.000Z')
    const rows: VersionRowSnapshot[] = [
      // Latest active autosave draft (MUST NEVER BE DELETED even with pruneAutosaveSnapshots=true)
      {
        id: 108,
        parentId: '7',
        latest: true,
        autosave: true,
        status: 'draft',
        updatedAt: '2026-10-30T11:55:00.000Z',
        createdAt: '2026-10-30T11:55:00.000Z',
      },
      // Stale non-latest autosave row -> pruned when pruneAutosaveSnapshots=true
      {
        id: 107,
        parentId: '7',
        latest: false,
        autosave: true,
        status: 'draft',
        updatedAt: '2026-10-29T10:00:00.000Z',
        createdAt: '2026-10-29T10:00:00.000Z',
      },
      {
        id: 106,
        parentId: '7',
        latest: false,
        autosave: false,
        status: 'draft',
        updatedAt: '2026-10-28T10:00:00.000Z',
        createdAt: '2026-10-28T10:00:00.000Z',
      },
      {
        id: 105,
        parentId: '7',
        latest: false,
        autosave: false,
        status: 'draft',
        updatedAt: '2026-10-27T10:00:00.000Z',
        createdAt: '2026-10-27T10:00:00.000Z',
      },
      // Live published version buried beneath newer drafts -> MUST NEVER BE DELETED!
      {
        id: 104,
        parentId: '7',
        latest: false,
        autosave: false,
        status: 'published',
        updatedAt: '2026-08-01T10:00:00.000Z',
        createdAt: '2026-08-01T10:00:00.000Z',
      },
      // Older superseded published version -> eligible for pruning
      {
        id: 103,
        parentId: '7',
        latest: false,
        autosave: false,
        status: 'published',
        updatedAt: '2026-07-01T10:00:00.000Z',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]

    // Aggressive policy: keepLatestPerDoc = 1, maxAgeDays = 7, pruneAutosaveSnapshots = true
    const aggressive = planVersionRetention(
      rows,
      { keepLatestPerDoc: 1, maxAgeDays: 7, pruneAutosaveSnapshots: true },
      nowMs,
    )
    expect(aggressive.protectedIds).toEqual([108, 104])
    expect(aggressive.prunableIds).toEqual([107, 106, 105, 103])
    expect(aggressive.affectedParents).toBe(1)

    // Standard policy: keepLatestPerDoc = 3, no age cutoff
    const standard = planVersionRetention(
      rows,
      { keepLatestPerDoc: 3, maxAgeDays: null, pruneAutosaveSnapshots: true },
      nowMs,
    )
    // Keeps 108 (latest), 106, 105 (top 3 non-stale), PLUS 104 (newest published); prunes 107 (stale autosave) & 103
    expect(standard.protectedIds).toEqual([108, 106, 105, 104])
    expect(standard.prunableIds).toEqual([107, 103])
  })

  it('executes dry-run & live pruning via payload.db.deleteVersions, writes audit logs, and enforces RBAC on /api/admin-versions', async () => {
    const deleteVersionsMock = vi.fn().mockResolvedValue([])
    const createAuditMock = vi.fn().mockResolvedValue({ id: 999 })

    let storedArticleVersions = [
      {
        id: 14,
        parent: 1,
        latest: true,
        autosave: false,
        updatedAt: '2026-10-30T10:00:00.000Z',
        createdAt: '2026-10-30T10:00:00.000Z',
        version: { _status: 'draft' },
      },
      {
        id: 13,
        parent: 1,
        latest: false,
        autosave: true,
        updatedAt: '2026-10-29T10:00:00.000Z',
        createdAt: '2026-10-29T10:00:00.000Z',
        version: { _status: 'draft' },
      },
      {
        id: 12,
        parent: 1,
        latest: false,
        autosave: false,
        updatedAt: '2026-10-25T10:00:00.000Z',
        createdAt: '2026-10-25T10:00:00.000Z',
        version: { _status: 'published' },
      },
      {
        id: 11,
        parent: 1,
        latest: false,
        autosave: false,
        updatedAt: '2026-10-20T10:00:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
        version: { _status: 'published' },
      },
    ]

    const mockPayload = {
      collections: {
        articles: { config: { versions: { maxPerDoc: 10 } } },
        projects: { config: { versions: { maxPerDoc: 10 } } },
      },
      findVersions: vi.fn(async ({ collection }: { collection: string }) => ({
        docs: collection === 'articles' ? storedArticleVersions : [],
        totalDocs: collection === 'articles' ? storedArticleVersions.length : 0,
      })),
      db: {
        deleteVersions: vi.fn(async (args: { collection: string; where?: { id?: { in?: number[] } } }) => {
          deleteVersionsMock(args)
          const idsToRemove = new Set(args.where?.id?.in ?? [])
          if (args.collection === 'articles') {
            storedArticleVersions = storedArticleVersions.filter((v) => !idsToRemove.has(v.id))
          }
          return []
        }),
      },
      create: createAuditMock,
      logger: { error: vi.fn(), info: vi.fn() },
    }

    const overviewBefore = await inspectVersionRetention({
      payload: mockPayload as never,
      policy: { keepLatestPerDoc: 1, pruneAutosaveSnapshots: true },
    })
    expect(overviewBefore.totals.totalVersions).toBe(4)
    expect(overviewBefore.totals.protectedVersions).toBe(2) // 14 (latest) + 12 (newest published)
    expect(overviewBefore.totals.prunableVersions).toBe(2) // 13 + 11

    const docStatsBefore = await inspectDocumentVersionRetention({
      payload: mockPayload as never,
      collection: 'articles',
      parentId: 1,
      policy: { keepLatestPerDoc: 1 },
    })
    expect(docStatsBefore.prunableVersions).toBe(2)

    // Dry-run does NOT call payload.db.deleteVersions or audit-logs
    const dryReport = await pruneContentVersions({
      payload: mockPayload as never,
      collections: ['articles'],
      policy: { keepLatestPerDoc: 1 },
      dryRun: true,
    })
    expect(dryReport.dryRun).toBe(true)
    expect(dryReport.totalDeleted).toBe(2)
    expect(deleteVersionsMock).not.toHaveBeenCalled()

    // Endpoint RBAC checks
    const getEndpoint = adminVersionsEndpoints.find((e) => e.method === 'get')!
    const postEndpoint = adminVersionsEndpoints.find((e) => e.method === 'post')!

    // 1. Unauthenticated -> 403
    const unauthRes = await getEndpoint.handler({
      url: 'http://localhost:3000/api/admin-versions',
      user: null,
      payload: mockPayload,
    } as never)
    expect(unauthRes.status).toBe(403)

    // 2. Edit-only user on articles -> 403 for both per-doc and bulk prune
    const editOnlyUser = {
      id: 2,
      email: 'editor@example.com',
      permissions: {
        fullAccess: false,
        roles: ['Editor'],
        levels: { articles: 'edit' },
        capabilities: [],
      },
    }
    const editDeniedPerDoc = await postEndpoint.handler({
      user: editOnlyUser,
      payload: mockPayload,
      json: async () => ({ collection: 'articles', parentId: 1, keepLatestPerDoc: 1 }),
    } as never)
    expect(editDeniedPerDoc.status).toBe(403)

    // 3. Full-access user on `articles` (without `manageDatabase`) -> ALLOWED for per-document prune, DENIED for bulk prune!
    const articlesLeadUser = {
      id: 3,
      name: 'Articles Lead',
      email: 'lead@example.com',
      permissions: {
        fullAccess: false,
        roles: ['Lead'],
        levels: { articles: 'full' },
        capabilities: [],
      },
    }
    const bulkDeniedForLead = await postEndpoint.handler({
      user: articlesLeadUser,
      payload: mockPayload,
      json: async () => ({ collection: 'all', keepLatestPerDoc: 1 }),
    } as never)
    expect(bulkDeniedForLead.status).toBe(403)

    const perDocAllowedRes = await postEndpoint.handler({
      user: articlesLeadUser,
      payload: mockPayload,
      headers: new Headers(),
      json: async () => ({
        collection: 'articles',
        parentId: 1,
        keepLatestPerDoc: 1,
        dryRun: false,
      }),
    } as never)
    expect(perDocAllowedRes.status).toBe(200)
    const perDocJson = (await perDocAllowedRes.json()) as {
      report: { totalDeleted: number }
      document: { totalVersions: number; prunableVersions: number }
    }
    expect(perDocJson.report.totalDeleted).toBe(2)
    expect(perDocJson.document.totalVersions).toBe(2)
    expect(perDocJson.document.prunableVersions).toBe(0)
    expect(deleteVersionsMock).toHaveBeenCalledTimes(1)
    expect(createAuditMock).toHaveBeenCalledTimes(1)

    // 4. Database manager capability -> ALLOWED for bulk overview
    const dbManagerUser = {
      id: 4,
      email: 'dba@example.com',
      permissions: {
        fullAccess: false,
        roles: ['DBA'],
        levels: {},
        capabilities: ['manageDatabase'],
      },
    }
    const bulkOverviewRes = await getEndpoint.handler({
      url: 'http://localhost:3000/api/admin-versions?collection=all&keepLatestPerDoc=5',
      user: dbManagerUser,
      payload: mockPayload,
    } as never)
    expect(bulkOverviewRes.status).toBe(200)
  })
})
