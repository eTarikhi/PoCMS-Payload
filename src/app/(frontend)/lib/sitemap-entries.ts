import { articlePagePath } from './article-page'
import { siteUrl } from './seo'

/**
 * The public sitemap and robots policy.
 *
 * Only pages that actually exist are listed: the home page and the articles that have a slug and a
 * body (the same rule as the route — see `hasArticlePage`). Drafts, trashed documents and articles
 * that only link out are not pages, so they are not in the sitemap either.
 *
 * Pure and dependency-free, so the rules can be tested without a database or a running server.
 */

export type SitemapEntry = {
  url: string
  lastModified?: Date
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

export type SitemapArticle = {
  slug: string
  updatedAt?: string | null
}

export const buildSitemap = (
  articles: SitemapArticle[],
  site: string = siteUrl(),
  now: Date = new Date(),
): SitemapEntry[] => {
  const entries: SitemapEntry[] = [
    // The home page carries the profile, projects and services; it changes whenever content does.
    { url: `${site}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
  ]

  for (const article of articles) {
    const lastModified = article.updatedAt ? new Date(article.updatedAt) : undefined
    entries.push({
      url: `${site}${articlePagePath(article.slug)}`,
      changeFrequency: 'monthly',
      priority: 0.7,
      // An unparsable date would render as "Invalid Date" in the XML.
      ...(lastModified && !Number.isNaN(lastModified.getTime()) ? { lastModified } : {}),
    })
  }

  return entries
}

/**
 * Paths that are not content: the admin, the REST/GraphQL API, the draft preview and Next's
 * internals. Everything else is crawlable, including the article pages.
 */
export const ROBOTS_DISALLOW = ['/admin', '/api', '/preview'] as const

export const buildRobots = (site: string = siteUrl()): { rules: { userAgent: string; allow: string; disallow: string[] }; sitemap: string } => ({
  rules: {
    userAgent: '*',
    allow: '/',
    disallow: [...ROBOTS_DISALLOW],
  },
  sitemap: `${site}/sitemap.xml`,
})
