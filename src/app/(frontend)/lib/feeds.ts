import type { MetadataRoute } from 'next'

import type { Article, Project } from '@/payload-types'

import { articlePagePath, ARTICLES_HUB_PATH, hasArticlePage } from './article-page'
import { extractLexicalText } from './lexical'
import { DEFAULT_SITE_SETTINGS } from './mappers'
import { hasProjectPage, projectPagePath, PROJECTS_HUB_PATH } from './project-page'
import {
  CONTACT_HUB_PATH,
  htmlLangFromLocale,
  RSS_FEED_PATH,
  siteUrl,
} from './seo'
import type { SiteSettingsContent } from './types'

/**
 * Pure builders for `/sitemap.xml`, `/robots.txt`, and `/feed.xml` (RSS 2.0 + Atom self-link).
 * Zero Payload or React runtime imports so they remain 100% unit-testable without a database.
 */

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const toValidDate = (...candidates: Array<string | null | undefined>): Date | undefined => {
  for (const raw of candidates) {
    if (!raw) continue
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return undefined
}

const latestDateOf = (dates: Array<Date | undefined>): Date | undefined => {
  let latest: Date | undefined
  for (const candidate of dates) {
    if (!candidate) continue
    if (!latest || candidate.getTime() > latest.getTime()) {
      latest = candidate
    }
  }
  return latest
}

const summarizeText = (raw: string, maxLength = 280): string => {
  const clean = raw.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`
}

export const buildRobotsRules = (
  site: string = siteUrl(),
  options?: { allowIndexing?: boolean },
): MetadataRoute.Robots => {
  if (options?.allowIndexing === false) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: '/',
        },
      ],
      host: site,
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api', '/api/'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}

const isDocumentNoIndex = (doc: { meta?: { noIndex?: boolean | null } | null }): boolean =>
  Boolean(doc.meta?.noIndex)

export const buildSitemapEntries = ({
  articles,
  projects,
  site = siteUrl(),
}: {
  articles: readonly Partial<Article>[]
  projects: readonly Partial<Project>[]
  site?: string
}): MetadataRoute.Sitemap => {
  const publishedArticles = articles.filter(
    (doc): doc is Partial<Article> & { slug: string } =>
      Boolean(doc.slug) && !doc.deletedAt && !isDocumentNoIndex(doc) && hasArticlePage(doc),
  )
  const publishedProjects = projects.filter(
    (doc): doc is Partial<Project> & { slug: string } =>
      Boolean(doc.slug) && !doc.deletedAt && !isDocumentNoIndex(doc) && hasProjectPage(doc),
  )

  const articleDates = publishedArticles.map((doc) =>
    toValidDate(doc.updatedAt, doc.publishedAt, doc.createdAt),
  )
  const projectDates = publishedProjects.map((doc) => toValidDate(doc.updatedAt, doc.createdAt))

  const latestArticleDate = latestDateOf(articleDates)
  const latestProjectDate = latestDateOf(projectDates)
  const latestSiteDate = latestDateOf([latestArticleDate, latestProjectDate])

  const entries: MetadataRoute.Sitemap = [
    {
      url: site,
      ...(latestSiteDate ? { lastModified: latestSiteDate } : {}),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${site}${ARTICLES_HUB_PATH}`,
      ...(latestArticleDate ? { lastModified: latestArticleDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${site}${PROJECTS_HUB_PATH}`,
      ...(latestProjectDate ? { lastModified: latestProjectDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${site}${CONTACT_HUB_PATH}`,
      ...(latestSiteDate ? { lastModified: latestSiteDate } : {}),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    ...publishedArticles.map((doc, index): MetadataRoute.Sitemap[number] => {
      const lastModified = articleDates[index]
      return {
        url: `${site}${articlePagePath(doc.slug)}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly',
        priority: 0.7,
      }
    }),
    ...publishedProjects.map((doc, index): MetadataRoute.Sitemap[number] => {
      const lastModified = projectDates[index]
      return {
        url: `${site}${projectPagePath(doc.slug)}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly',
        priority: 0.7,
      }
    }),
  ]

  return entries
}

type RssEntry = {
  title: string
  url: string
  guid: string
  description: string
  pubDate: Date | undefined
  categories: string[]
}

export const buildRssFeedXml = ({
  articles,
  projects,
  settings = DEFAULT_SITE_SETTINGS,
  site = siteUrl(),
}: {
  articles: readonly Partial<Article>[]
  projects: readonly Partial<Project>[]
  settings?: SiteSettingsContent
  site?: string
}): string => {
  const feedUrl = `${site}${RSS_FEED_PATH}`
  const language = htmlLangFromLocale(settings.locale)

  const articleEntries: RssEntry[] = articles
    .filter((doc) => !doc.deletedAt && !isDocumentNoIndex(doc) && Boolean(doc.title?.trim()))
    .flatMap((doc): RssEntry[] => {
      const onSiteUrl =
        doc.slug && hasArticlePage(doc) ? `${site}${articlePagePath(doc.slug)}` : null
      const externalUrl = doc.link?.trim() || null
      const itemUrl = onSiteUrl ?? externalUrl
      if (!itemUrl) return []

      const descriptionSource =
        doc.meta?.description?.trim() ||
        doc.excerpt?.trim() ||
        extractLexicalText(doc.content) ||
        doc.description?.trim() ||
        ''

      const categories = ['Article']
      if (doc.category === 'others') categories.push('Notes')

      return [
        {
          title: doc.title!.trim(),
          url: itemUrl,
          guid: itemUrl,
          description: summarizeText(descriptionSource),
          pubDate: toValidDate(doc.publishedAt, doc.createdAt, doc.updatedAt),
          categories,
        },
      ]
    })

  const projectEntries: RssEntry[] = projects
    .filter(
      (doc): doc is Partial<Project> & { slug: string; title: string } =>
        !doc.deletedAt &&
        !isDocumentNoIndex(doc) &&
        Boolean(doc.slug) &&
        Boolean(doc.title?.trim()) &&
        hasProjectPage(doc),
    )
    .map((doc): RssEntry => {
      const itemUrl = `${site}${projectPagePath(doc.slug)}`
      const descriptionSource =
        doc.meta?.description?.trim() ||
        doc.excerpt?.trim() ||
        extractLexicalText(doc.content) ||
        ''

      const categories = [
        'Case Study',
        ...(doc.techStack ?? []).map((item) => item.trim()).filter(Boolean),
      ]

      return {
        title: `${doc.title.trim()} — ${settings.projectsSection.caseStudyLabel}`,
        url: itemUrl,
        guid: itemUrl,
        description: summarizeText(descriptionSource),
        pubDate: toValidDate(doc.updatedAt, doc.createdAt),
        categories,
      }
    })

  const allEntries = [...articleEntries, ...projectEntries].sort((a, b) => {
    const timeA = a.pubDate?.getTime() ?? 0
    const timeB = b.pubDate?.getTime() ?? 0
    return timeB - timeA
  })

  const lastBuildDate = latestDateOf(allEntries.map((entry) => entry.pubDate))

  const itemsXml = allEntries
    .map((entry) => {
      const lines = [
        '    <item>',
        `      <title>${escapeXml(entry.title)}</title>`,
        `      <link>${escapeXml(entry.url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(entry.guid)}</guid>`,
        `      <dc:creator>${escapeXml(settings.ownerName)}</dc:creator>`,
      ]
      if (entry.description) {
        lines.push(`      <description>${escapeXml(entry.description)}</description>`)
      }
      if (entry.pubDate) {
        lines.push(`      <pubDate>${entry.pubDate.toUTCString()}</pubDate>`)
      }
      for (const category of entry.categories) {
        lines.push(`      <category>${escapeXml(category)}</category>`)
      }
      lines.push('    </item>')
      return lines.join('\n')
    })
    .join('\n')

  const channelLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(settings.siteName)}</title>`,
    `    <link>${escapeXml(site)}</link>`,
    `    <description>${escapeXml(settings.metaDescription)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ...(lastBuildDate ? [`    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`] : []),
    ...(itemsXml ? [itemsXml] : []),
    '  </channel>',
    '</rss>',
    '',
  ]

  return channelLines.join('\n')
}
