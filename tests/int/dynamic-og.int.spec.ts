// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { mapArticleDetail } from '@/app/(frontend)/lib/article-mappers'
import { buildRobotsRules } from '@/app/(frontend)/lib/feeds'
import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import { mapProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import {
  buildArticleMetadata,
  buildArticlesHubMetadata,
  buildBlogPostingJsonLd,
  buildDynamicOgImageUrl,
  buildProjectJsonLd,
  buildProjectMetadata,
  buildProjectsHubMetadata,
  OG_IMAGE_ROUTE_PATH,
} from '@/app/(frontend)/lib/seo'
import { GET as getOgImage } from '@/app/og/route'
import type { Article, Project } from '@/payload-types'

const richBody = () => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        children: [{ type: 'text', text: 'Architecture notes.', version: 1 }],
      },
    ],
  },
})

describe('SEO Milestone 2.D: Dynamic 1200x630 Open Graph Image Generation (/og)', () => {
  it('builds deterministic /og URLs and falls back to 1200x630 PNG OG cards when custom meta.image or coverUrl is absent', () => {
    const dynamicUrl = buildDynamicOgImageUrl(
      {
        kind: 'article',
        title: 'Event-Driven Systems in TypeScript',
        subtitle: 'Designing idempotent webhook & queue pipelines.',
        eyebrow: 'Engineering Essay',
        meta: '8 min read',
        tags: ['TypeScript', 'PostgreSQL', 'Payload CMS', 'Resend', 'ExtraIgnored'],
      },
      'https://vtarikhi.com',
    )

    expect(dynamicUrl.startsWith(`https://vtarikhi.com${OG_IMAGE_ROUTE_PATH}?`)).toBe(true)
    const parsed = new URL(dynamicUrl)
    expect(parsed.pathname).toBe('/og')
    expect(parsed.searchParams.get('kind')).toBe('article')
    expect(parsed.searchParams.get('title')).toBe('Event-Driven Systems in TypeScript')
    expect(parsed.searchParams.get('tags')).toBe('TypeScript,PostgreSQL,Payload CMS,Resend')

    // Article without cover image or custom meta.image -> uses dynamic 1200x630 /og PNG card
    const imagelessArticleDoc: Article = {
      id: 101,
      title: 'Zero-Cover Technical Deep Dive',
      slug: 'zero-cover-deep-dive',
      excerpt: 'Exploring transactional guarantees without a custom cover upload.',
      content: richBody() as Article['content'],
      readTime: 6,
      category: 'articles',
      publishedAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
      createdAt: '2026-10-28T10:00:00.000Z',
    }
    const mappedArticle = mapArticleDetail(imagelessArticleDoc)!
    const articleMeta = buildArticleMetadata(
      mappedArticle,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    const articleOgImages = articleMeta.openGraph?.images as Array<{
      url: string
      width?: number
      height?: number
      type?: string
    }>
    expect(articleOgImages).toHaveLength(1)
    expect(articleOgImages[0]?.url).toContain('https://vtarikhi.com/og?kind=article')
    expect(articleOgImages[0]?.width).toBe(1200)
    expect(articleOgImages[0]?.height).toBe(630)
    expect(articleOgImages[0]?.type).toBe('image/png')
    expect(articleMeta.twitter).toMatchObject({
      card: 'summary_large_image',
    })

    const articleJsonLd = buildBlogPostingJsonLd(
      mappedArticle,
      null,
      null,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(String(articleJsonLd.image)).toContain('https://vtarikhi.com/og?kind=article')

    // Project without cover image or custom meta.image -> uses dynamic 1200x630 /og PNG card
    const imagelessProjectDoc: Project = {
      id: 202,
      title: 'Distributed Telemetry Engine',
      slug: 'distributed-telemetry-engine',
      categories: ['back-end'],
      excerpt: 'High-throughput metrics ingestion pipeline.',
      content: richBody() as Project['content'],
      techStack: ['Go', 'ClickHouse'],
      role: 'Staff Engineer',
      year: '2026',
      updatedAt: '2026-10-28T10:00:00.000Z',
      createdAt: '2026-10-28T10:00:00.000Z',
    }
    const mappedProject = mapProjectDetail(imagelessProjectDoc)!
    const projectMeta = buildProjectMetadata(
      mappedProject,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    const projectOgImages = projectMeta.openGraph?.images as Array<{
      url: string
      width?: number
      height?: number
      type?: string
    }>
    expect(projectOgImages[0]?.url).toContain('https://vtarikhi.com/og?kind=project')
    expect(projectOgImages[0]?.width).toBe(1200)
    expect(projectOgImages[0]?.height).toBe(630)
    expect(projectOgImages[0]?.type).toBe('image/png')

    const projectJsonLd = buildProjectJsonLd(
      mappedProject,
      null,
      null,
      DEFAULT_SITE_SETTINGS,
      'https://vtarikhi.com',
    )
    expect(String(projectJsonLd.image)).toContain('https://vtarikhi.com/og?kind=project')

    // Archive Hubs without hubSeo.ogImage -> auto-generate 1200x630 /og?kind=hub cards
    const articlesHubMeta = buildArticlesHubMetadata(DEFAULT_SITE_SETTINGS, 'https://vtarikhi.com')
    const projectsHubMeta = buildProjectsHubMetadata(DEFAULT_SITE_SETTINGS, 'https://vtarikhi.com')
    const articlesHubOg = (
      articlesHubMeta.openGraph?.images as Array<{ url: string; width: number; height: number }>
    )[0]
    const projectsHubOg = (
      projectsHubMeta.openGraph?.images as Array<{ url: string; width: number; height: number }>
    )[0]
    expect(articlesHubOg?.url).toContain('https://vtarikhi.com/og?kind=hub')
    expect(articlesHubOg?.width).toBe(1200)
    expect(articlesHubOg?.height).toBe(630)
    expect(projectsHubOg?.url).toContain('https://vtarikhi.com/og?kind=hub')

    // Crawler check: robots.txt disallows /api/ and /admin/ without blocking /og
    const robots = buildRobotsRules('https://vtarikhi.com', {
      allowIndexing: DEFAULT_SITE_SETTINGS.allowIndexing,
    })
    const ruleSet = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules
    expect(ruleSet?.disallow).not.toContain('/og')
    expect(ruleSet?.disallow).not.toContain('/og/')
  })

  it('renders valid 1200x630 PNG bytes from GET /og across article, project, and hub variants', async () => {
    for (const kind of ['article', 'project', 'hub'] as const) {
      const req = new Request(
        `https://vtarikhi.com/og?kind=${kind}&title=${encodeURIComponent(`Sample ${kind} card`)}&subtitle=${encodeURIComponent('Branded PoCMS social preview')}&tags=TypeScript,Next.js,Payload`,
      )
      const res = await getOgImage(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('image/png')
      expect(res.headers.get('Cache-Control')).toContain('max-age=86400')

      const bytes = new Uint8Array(await res.arrayBuffer())
      expect(bytes.byteLength).toBeGreaterThan(1024)
      // PNG file signature: 89 50 4E 47 0D 0A 1A 0A
      expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    }
  })
})
