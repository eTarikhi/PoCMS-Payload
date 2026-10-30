// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { ArticleLayout } from '@/app/(frontend)/components/article/ArticleLayout'
import { ArticlesArchive } from '@/app/(frontend)/components/article/ArticlesArchive'
import { ProjectLayout } from '@/app/(frontend)/components/project/ProjectLayout'
import { ProjectsArchive } from '@/app/(frontend)/components/project/ProjectsArchive'
import { MediaBlockView } from '@/app/(frontend)/components/richtext/MediaBlockView'
import { RichTextContent } from '@/app/(frontend)/components/richtext/RichTextContent'
import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import {
  DEFAULT_SITE_SETTINGS,
  mapArticles,
  mapProjects,
  resolveArticleLeadMedia,
  resolveProjectLeadMedia,
} from '@/app/(frontend)/lib/mappers'
import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import { MediaBlock } from '@/blocks/MediaBlock'
import { Articles } from '@/collections/Articles'
import { Media } from '@/collections/Media'
import { Projects } from '@/collections/Projects'
import {
  clampResponsiveFrameWidth,
  mediaFrameEndpoint,
  publicImagesEndpoint,
} from '@/endpoints/publicImages'
import { collectReferencedMediaIds } from '@/lib/contentHealth'
import {
  enrichArticleStaticImageMetaBeforeChange,
  enrichProjectStaticImageMetaBeforeChange,
  extractStaticImageMeta,
  listPublicImages,
  resolveSafePublicImagePath,
} from '@/lib/staticImageMeta'
import type { Article, Media as MediaDoc, Project } from '@/payload-types'

const sampleLexicalBody: Article['content'] = {
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
            text: 'Detailed engineering guide body paragraph.',
            version: 1,
          },
        ],
      },
    ],
  },
}

const sampleUploadedMedia = (id: number, label: string): MediaDoc => ({
  id,
  alt: `${label} alt`,
  url: `/api/media/file/${label}.webp`,
  width: 1600,
  height: 900,
  focalX: 35,
  focalY: 65,
  blurDataURL: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
  sizes: {
    thumbnail: { url: `/api/media/file/${label}-400x300.webp`, width: 400, height: 300 },
    card: { url: `/api/media/file/${label}-800x520.webp`, width: 800, height: 520 },
    content: { url: `/api/media/file/${label}-1080.webp`, width: 1080, height: 608 },
    hero: { url: `/api/media/file/${label}-1600.webp`, width: 1600, height: 900 },
    og: { url: `/api/media/file/${label}-1200x630.webp`, width: 1200, height: 630 },
  },
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('Article Media Management: Schema, Static Metadata, ImageResponse & Modes', () => {
  it('configures Media WebP breakpoints including 1080w content and 1600w hero variants', () => {
    const sizeNames = (Media.upload && typeof Media.upload === 'object'
      ? Media.upload.imageSizes ?? []
      : []
    ).map((s) => s.name)
    expect(sizeNames).toEqual(['thumbnail', 'card', 'content', 'hero', 'og'])
  })

  it('registers mediaMode, mediaSource, imageUrl picker, and gallery fields on Articles', () => {
    const tabsField = Articles.fields.find((f) => f.type === 'tabs')
    expect(tabsField && tabsField.type === 'tabs').toBe(true)
    if (!tabsField || tabsField.type !== 'tabs') return

    const contentTab = tabsField.tabs.find((t) => 'label' in t && t.label === 'Content')
    expect(contentTab).toBeDefined()
    const collapsible = contentTab?.fields.find(
      (f) => f.type === 'collapsible' && f.label === 'Article Media & Preview',
    )
    expect(collapsible && collapsible.type === 'collapsible').toBe(true)
    if (!collapsible || collapsible.type !== 'collapsible') return

    const fieldNames = collapsible.fields
      .filter((f): f is Extract<typeof f, { name: string }> => 'name' in f)
      .map((f) => f.name)

    expect(fieldNames).toEqual(
      expect.arrayContaining([
        'mediaMode',
        'mediaSource',
        'image',
        'imageUrl',
        'imageAlt',
        'imageUrlMeta',
        'galleryLayout',
        'gallery',
      ]),
    )
  })

  it('extracts width, height, and sharp WebP blurDataURL for /images/articles/* while blocking traversal', async () => {
    expect(resolveSafePublicImagePath('/images/articles/1735708966846.webp')).toBeTruthy()
    expect(resolveSafePublicImagePath('/images/../../etc/passwd')).toBeNull()
    expect(resolveSafePublicImagePath('https://evil.example/a.webp')).toBeNull()

    const meta = await extractStaticImageMeta('/images/articles/1735708966846.webp')
    expect(meta).not.toBeNull()
    expect(meta?.width).toBeGreaterThan(0)
    expect(meta?.height).toBeGreaterThan(0)
    expect(meta?.blurDataURL?.startsWith('data:image/webp;base64,')).toBe(true)

    const catalog = await listPublicImages('1735708966846')
    expect(catalog.some((item) => item.path === '/images/articles/1735708966846.webp')).toBe(true)
  })

  it('enriches single imageUrlMeta, gallery urlMeta, and Lexical mediaBlock urlMeta in beforeChange', async () => {
    const draftData: Record<string, unknown> = {
      title: 'Static Meta Hook Test',
      mediaMode: 'gallery',
      imageUrl: '/images/articles/1735708966846.webp',
      gallery: [
        {
          source: 'url',
          imageUrl: '/images/articles/1733263816314.webp',
          caption: 'Architecture overview',
        },
      ],
      content: {
        root: {
          type: 'root',
          children: [
            {
              type: 'block',
              fields: {
                blockType: 'mediaBlock',
                source: 'url',
                imageUrl: '/images/articles/1735708966846.webp',
                size: 'custom',
                customWidth: 520,
              },
            },
          ],
        },
      },
    }

    const enriched = await enrichArticleStaticImageMetaBeforeChange({
      data: draftData,
    } as never)

    expect((enriched.imageUrlMeta as { blurDataURL?: string })?.blurDataURL).toMatch(
      /^data:image\/webp;base64,/,
    )
    const galleryArr = enriched.gallery as Array<{ urlMeta?: { width?: number } }>
    expect(galleryArr[0]?.urlMeta?.width).toBeGreaterThan(0)

    const blockNode = (
      enriched.content as {
        root: { children: Array<{ fields?: { urlMeta?: { width?: number } } }> }
      }
    ).root.children[0]
    expect(blockNode?.fields?.urlMeta?.width).toBeGreaterThan(0)
  })

  it('resolves all three lead media modes (none, single upload/url, hybrid gallery) accurately', () => {
    const uploadDoc = sampleUploadedMedia(10, 'cover')

    // 1. Legacy article without mediaMode defaults to 'single'
    const legacyResolved = resolveArticleLeadMedia({
      title: 'Legacy Post',
      imageUrl: '/images/articles/1735708966846.webp',
    })
    expect(legacyResolved.mediaMode).toBe('single')
    expect(legacyResolved.cardUrl).toBe('/images/articles/1735708966846.webp')

    // 2. 'none' hides stored media non-destructively
    const noneArticle: Article = {
      id: 1,
      title: 'No Picture Essay',
      slug: 'no-picture-essay',
      excerpt: 'Pure typography mode.',
      mediaMode: 'none',
      image: uploadDoc,
      imageUrl: '/images/articles/1735708966846.webp',
      content: sampleLexicalBody,
      publishedAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
    }
    const mappedNoneCard = mapArticles([noneArticle])[0]!
    expect(mappedNoneCard.mediaMode).toBe('none')
    expect(mappedNoneCard.imageUrl).toBe('')
    const mappedNoneDetail = mapArticleDetail(noneArticle)!
    expect(mappedNoneDetail.mediaMode).toBe('none')
    expect(mappedNoneDetail.coverUrl).toBeNull()

    // 3. 'gallery' mode combining a direct upload slide + a pre-uploaded /images/articles URL slide
    const galleryArticle: Article = {
      id: 2,
      title: 'Multi-Slide Release Notes',
      slug: 'multi-slide-release-notes',
      excerpt: 'Walkthrough of new architecture screens.',
      mediaMode: 'gallery',
      galleryLayout: 'grid',
      gallery: [
        {
          id: 's1',
          source: 'upload',
          media: uploadDoc,
          caption: 'Uploaded dashboard slide',
        },
        {
          id: 's2',
          source: 'url',
          imageUrl: '/images/articles/1735708966846.webp',
          caption: 'Existing static asset slide',
          urlMeta: {
            width: 800,
            height: 450,
            blurDataURL: 'data:image/webp;base64,AAAA',
          },
        },
      ],
      content: sampleLexicalBody,
      publishedAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      createdAt: '2026-03-02T00:00:00.000Z',
    }

    const mappedGalleryCard = mapArticles([galleryArticle])[0]!
    expect(mappedGalleryCard.mediaMode).toBe('gallery')
    expect(mappedGalleryCard.galleryCount).toBe(2)
    expect(mappedGalleryCard.imageUrl).toBe('/api/media/file/cover-800x520.webp')

    const mappedGalleryDetail = mapArticleDetail(galleryArticle)!
    expect(mappedGalleryDetail.mediaMode).toBe('gallery')
    expect(mappedGalleryDetail.galleryLayout).toBe('grid')
    expect(mappedGalleryDetail.gallery).toHaveLength(2)
    expect(mappedGalleryDetail.gallery?.[0]?.objectPosition).toBe('35% 65%')
    expect(mappedGalleryDetail.gallery?.[1]?.src).toBe('/images/articles/1735708966846.webp')

    // Render ArticleLayout & ArticlesArchive for both 'none' and 'gallery' modes
    const noneHtml = renderToStaticMarkup(
      React.createElement(ArticleLayout, {
        article: mappedNoneDetail,
        labels: {
          backToArticlesLabel: 'Back',
          externalPublicationLabel: 'Originally at',
        },
      }),
    )
    expect(noneHtml).not.toContain('article-cover')
    expect(noneHtml).not.toContain('article-gallery')

    const galleryHtml = renderToStaticMarkup(
      React.createElement(ArticleLayout, {
        article: mappedGalleryDetail,
        labels: {
          backToArticlesLabel: 'Back',
          externalPublicationLabel: 'Originally at',
        },
      }),
    )
    expect(galleryHtml).toContain('article-gallery-grid')
    expect(galleryHtml).toContain('Uploaded dashboard slide')
    expect(galleryHtml).toContain('Existing static asset slide')

    const archiveHtml = renderToStaticMarkup(
      React.createElement(ArticlesArchive, {
        articles: [mappedGalleryCard, mappedNoneCard],
        labels: DEFAULT_SITE_SETTINGS.articlesSection,
      }),
    )
    expect(archiveHtml).toContain('2 photos')
    expect(archiveHtml).toContain('No Picture Essay')
  })

  it('serves RBAC-guarded /api/public-images and ImageResponse + sharp WebP /api/media-frame', async () => {
    expect(clampResponsiveFrameWidth('790')).toBe(800)
    expect(clampResponsiveFrameWidth('invalid')).toBe(1200)

    const forbiddenRes = await publicImagesEndpoint.handler({
      url: 'http://localhost:3000/api/public-images',
      user: null,
    } as never)
    expect(forbiddenRes.status).toBe(403)

    const adminRes = await publicImagesEndpoint.handler({
      url: 'http://localhost:3000/api/public-images?q=1735708966846',
      user: {
        id: 1,
        permissions: { fullAccess: true, roles: ['Administrator'], levels: {}, capabilities: [] },
      },
    } as never)
    expect(adminRes.status).toBe(200)
    const body = (await adminRes.json()) as { items: Array<{ path: string }> }
    expect(body.items.some((i) => i.path === '/images/articles/1735708966846.webp')).toBe(true)

    // Traversal / external host blocked on /api/media-frame
    const blockedFrame = await mediaFrameEndpoint.handler({
      url: 'http://localhost:3000/api/media-frame?src=https://evil.example/x.png&w=800',
    } as never)
    expect(blockedFrame.status).toBe(404)

    // Valid pre-uploaded /images/articles/*.webp rendered via ImageResponse (`next/og`) + sharp WebP
    const validFrame = await mediaFrameEndpoint.handler({
      url: 'http://localhost:3000/api/media-frame?src=%2Fimages%2Farticles%2F1735708966846.webp&w=800&mode=card',
    } as never)
    expect(
      validFrame.status,
      validFrame.status !== 200 ? await validFrame.clone().text() : undefined,
    ).toBe(200)
    expect(validFrame.headers.get('Content-Type')).toBe('image/webp')

    const webpBuffer = Buffer.from(await validFrame.arrayBuffer())
    const decoded = await sharp(webpBuffer).metadata()
    expect(decoded.format).toBe('webp')
    expect(decoded.width).toBe(800)
    expect(decoded.height).toBe(450)
  })

  it('renders custom in-editor MediaBlock and UploadFeature dimensions, alignments, and ratios', () => {
    expect(MediaBlock.admin?.components?.Block).toBe(
      '/components/admin/lexical/MediaBlockEditor#MediaBlockEditor',
    )

    const customHtml = renderToStaticMarkup(
      React.createElement(MediaBlockView, {
        source: 'url',
        imageUrl: '/images/articles/1735708966846.webp',
        size: 'custom',
        customWidth: 480,
        alignment: 'right',
        aspectRatio: '16:9',
        caption: 'Custom 480px right-aligned 16:9 figure',
        urlMeta: { width: 960, height: 540 },
      }),
    )
    expect(customHtml).toContain('article-media-block--size-custom')
    expect(customHtml).toContain('article-media-block--align-right')
    expect(customHtml).toContain('article-media-block--ratio-16-9')
    expect(customHtml).toContain('--media-custom-w:480px')
    expect(customHtml).toContain('Custom 480px right-aligned 16:9 figure')

    const uploadDoc = sampleUploadedMedia(22, 'diagram')
    const lexicalWithBlocks = {
      root: {
        type: 'root',
        children: [
          {
            type: 'upload',
            relationTo: 'media',
            value: uploadDoc,
            fields: {
              size: 'small',
              alignment: 'left',
              aspectRatio: '1:1',
              caption: 'Inline drag-and-drop upload figure',
            },
          },
          {
            type: 'block',
            fields: {
              blockType: 'mediaBlock',
              source: 'upload',
              media: uploadDoc,
              size: 'medium',
              alignment: 'center',
              caption: 'Medium 65% MediaBlock figure',
            },
          },
        ],
      },
    }

    const richHtml = renderToStaticMarkup(
      React.createElement(RichTextContent, { data: lexicalWithBlocks }),
    )
    expect(richHtml).toContain('article-media-block--size-small')
    expect(richHtml).toContain('article-media-block--align-left')
    expect(richHtml).toContain('article-media-block--ratio-1-1')
    expect(richHtml).toContain('Inline drag-and-drop upload figure')
    expect(richHtml).toContain('article-media-block--size-medium')
    expect(richHtml).toContain('Medium 65% MediaBlock figure')
  })

  it('applies mediaMode (none, single upload/src, hybrid gallery), static meta enrichment, and orphan protection on Projects & /projects/[slug]', async () => {
    const tabsField = Projects.fields.find((f) => f.type === 'tabs')
    expect(tabsField && tabsField.type === 'tabs').toBe(true)
    if (!tabsField || tabsField.type !== 'tabs') return

    const contentTab = tabsField.tabs.find((t) => 'label' in t && t.label === 'Content')
    const collapsible = contentTab?.fields.find(
      (f) => f.type === 'collapsible' && f.label === 'Case Study Media & Card Preview',
    )
    expect(collapsible && collapsible.type === 'collapsible').toBe(true)
    if (!collapsible || collapsible.type !== 'collapsible') return

    const fieldNames = collapsible.fields
      .filter((f): f is Extract<typeof f, { name: string }> => 'name' in f)
      .map((f) => f.name)
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        'mediaMode',
        'mediaSource',
        'image',
        'src',
        'imageAlt',
        'srcMeta',
        'galleryLayout',
        'gallery',
        'placeHolder',
      ]),
    )

    // Enrich Project src (/api/media-frame wrapper) + gallery + Lexical mediaBlock via beforeChange
    const projectDraft: Record<string, unknown> = {
      title: 'Project Meta Hook',
      mediaMode: 'gallery',
      src: '/api/media-frame?src=%2Fimages%2Farticles%2F1735708966846.webp&w=1200&mode=card',
      gallery: [
        {
          source: 'url',
          imageUrl: '/images/articles/1733263816314.webp',
          caption: 'System blueprint',
        },
      ],
    }
    const enrichedProject = await enrichProjectStaticImageMetaBeforeChange({
      data: projectDraft,
    } as never)
    expect((enrichedProject.srcMeta as { width?: number; blurDataURL?: string })?.width).toBe(1600)
    expect((enrichedProject.srcMeta as { blurDataURL?: string })?.blurDataURL).toMatch(
      /^data:image\/webp;base64,/,
    )

    const uploadDoc = sampleUploadedMedia(44, 'project-slide')

    // Legacy Project without mediaMode defaults to 'single'
    expect(
      resolveProjectLeadMedia({
        title: 'Legacy Project',
        src: '/images/articles/1735708966846.webp',
      }).mediaMode,
    ).toBe('single')

    // 'none' hides /projects/[slug] cover while preserving home-page portfolio card thumbnail
    const noneProject: Project = {
      id: 11,
      title: 'Text-Only Case Study',
      slug: 'text-only-case-study',
      excerpt: 'Deep backend architecture postmortem.',
      categories: ['back-end'],
      mediaMode: 'none',
      placeHolder: '/images/articles/1733263816314.webp',
      src: '/images/articles/1735708966846.webp',
      content: sampleLexicalBody,
      updatedAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
    }

    const galleryProject: Project = {
      id: 12,
      title: 'Gallery Case Study',
      slug: 'gallery-case-study',
      excerpt: 'Full-stack platform showcase.',
      categories: ['front-end', 'cms-crm'],
      mediaMode: 'gallery',
      galleryLayout: 'carousel',
      gallery: [
        {
          id: 'p1',
          source: 'upload',
          media: uploadDoc,
          caption: 'Admin control plane',
        },
        {
          id: 'p2',
          source: 'url',
          imageUrl: '/images/articles/1735708966846.webp',
          caption: 'Edge delivery pipeline',
        },
      ],
      content: sampleLexicalBody,
      updatedAt: '2026-03-02T00:00:00.000Z',
      createdAt: '2026-03-02T00:00:00.000Z',
    }

    const mappedProjects = mapProjects([noneProject, galleryProject])
    // Home-page card thumbnail & image remain intact on 'none' project!
    expect(mappedProjects.items[0]?.thumbnailUrl).toBe('/images/articles/1733263816314.webp')
    expect(mappedProjects.items[0]?.imageUrl).toBe('/images/articles/1735708966846.webp')
    expect(mappedProjects.items[0]?.mediaMode).toBe('none')

    // Gallery project falls back card thumbnail to Slide #1 and exposes galleryCount
    expect(mappedProjects.items[1]?.mediaMode).toBe('gallery')
    expect(mappedProjects.items[1]?.galleryCount).toBe(2)
    expect(mappedProjects.items[1]?.thumbnailUrl).toBe(
      '/api/media/file/project-slide-400x300.webp',
    )

    const noneProjectDetail = mapProjectDetail(noneProject)!
    expect(noneProjectDetail.mediaMode).toBe('none')
    expect(noneProjectDetail.coverUrl).toBeNull()
    const noneProjectHtml = renderToStaticMarkup(
      React.createElement(ProjectLayout, { project: noneProjectDetail }),
    )
    expect(noneProjectHtml).not.toContain('article-cover')
    expect(noneProjectHtml).not.toContain('article-gallery')

    const galleryProjectDetail = mapProjectDetail(galleryProject)!
    expect(galleryProjectDetail.mediaMode).toBe('gallery')
    expect(galleryProjectDetail.gallery).toHaveLength(2)
    const galleryProjectHtml = renderToStaticMarkup(
      React.createElement(ProjectLayout, { project: galleryProjectDetail }),
    )
    expect(galleryProjectHtml).toContain('article-gallery-carousel')
    expect(galleryProjectHtml).toContain('Admin control plane')

    const projectsArchiveHtml = renderToStaticMarkup(
      React.createElement(ProjectsArchive, {
        projects: mappedProjects.items,
        labels: DEFAULT_SITE_SETTINGS.projectsSection,
      }),
    )
    expect(projectsArchiveHtml).toContain('2 photos')

    // Content Health orphan protection counts gallery[].media on both articles & projects
    const referencedIds = collectReferencedMediaIds({
      projects: [{ gallery: [{ media: 44 }] }],
      articles: [{ gallery: [{ media: 88 }] }],
    })
    expect(referencedIds.has('44')).toBe(true)
    expect(referencedIds.has('88')).toBe(true)
  })
})
