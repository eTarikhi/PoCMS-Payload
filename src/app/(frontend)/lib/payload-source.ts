/**
 * Payload data source for the portfolio site.
 *
 * This is the only module in `src/app/(frontend)/lib` that talks to Payload at runtime.
 * It uses the Local API from React Server Components, as recommended by the Payload 3
 * docs (`getPayload({ config })` with `@payload-config`).
 */

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

import { PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import type { Article, Project, Redirect, SiteSetting } from '@/payload-types'

import { hasArticlePage } from './article-page'
import {
  mapArticles,
  mapFooter,
  mapHeader,
  mapHeaderStudio,
  mapNavigation,
  mapPortfolioContent,
  mapProjects,
  mapSiteSettings,
  type RawPortfolioDocs,
} from './mappers'
import { hasProjectPage } from './project-page'
import type {
  ArticleItem,
  FooterContent,
  HeaderContent,
  HeaderStudioConfig,
  NavigationContent,
  PortfolioContent,
  ProjectsContent,
  SiteSettingsContent,
} from './types'

export type SiteChromeContent = {
  siteSettings: SiteSettingsContent
  navigation: NavigationContent
  header: HeaderContent | null
  headerStudio: HeaderStudioConfig
  footer: FooterContent | null
}

/**
 * Fetches only the site-wide chrome (`site-settings`, `navigation`, `header`, `footer`) — 4
 * lightweight singleton/global queries instead of loading all 12 home-page collections.
 */
export const getSiteChromeContent = async (): Promise<SiteChromeContent> => {
  const payload = await getPayload({ config: configPromise })
  const [siteSettingsDoc, navigationDoc, headerDoc, footerDoc] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 1 }),
    payload.findGlobal({ slug: 'navigation', depth: 0 }),
    payload.find({ collection: 'header', limit: 1, depth: 1 }).then((res) => res.docs[0] ?? null),
    payload.findGlobal({ slug: 'footer', depth: 1 }),
  ])

  return {
    siteSettings: mapSiteSettings(siteSettingsDoc),
    navigation: mapNavigation(navigationDoc),
    header: mapHeader(headerDoc),
    headerStudio: mapHeaderStudio(headerDoc),
    footer: mapFooter(footerDoc),
  }
}

/** Fetches only published articles mapped to `ArticleItem[]`. */
export const getPublishedArticlesList = async (): Promise<ArticleItem[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    sort: '-publishedAt',
    depth: 1,
  })
  return mapArticles(res.docs)
}

/** Fetches only published projects mapped to `ProjectsContent`. */
export const getPublishedProjectsList = async (): Promise<ProjectsContent> => {
  const payload = await getPayload({ config: configPromise })
  const [projectsRes, siteSettingsDoc] = await Promise.all([
    payload.find({
      collection: 'projects',
      where: PUBLISHED_OR_LEGACY_WHERE,
      pagination: false,
      sort: '_order',
      depth: 1,
    }),
    payload.findGlobal({ slug: 'site-settings', depth: 0 }).catch(() => null),
  ])
  const siteSettings = mapSiteSettings(siteSettingsDoc)
  return mapProjects(projectsRes.docs, siteSettings.projectsSection)
}

/** Fetches the raw Payload documents needed by the home page and site chrome. */
export const fetchRawPortfolioDocs = async (): Promise<RawPortfolioDocs> => {
  const payload = await getPayload({ config: configPromise })

  const [
    siteSettings,
    navigation,
    header,
    about,
    skills,
    experiences,
    educations,
    certificates,
    articles,
    services,
    projects,
    footer,
  ] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 1 }),
    payload.findGlobal({ slug: 'navigation', depth: 0 }),
    payload.find({ collection: 'header', limit: 1, depth: 1 }).then((res) => res.docs[0] ?? null),
    payload.find({ collection: 'about', limit: 1, depth: 1 }).then((res) => res.docs[0] ?? null),
    payload
      .find({ collection: 'skills', pagination: false, sort: '_order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'experiences', pagination: false, sort: '_order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'educations', pagination: false, sort: '_order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'certificates', pagination: false, sort: 'issuedAt', depth: 1 })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'articles',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '-publishedAt',
        depth: 1,
      })
      .then((res) => res.docs),
    payload
      .find({ collection: 'services', pagination: false, sort: '_order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'projects',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '_order',
        depth: 1,
      })
      .then((res) => res.docs),
    payload.findGlobal({ slug: 'footer', depth: 1 }),
  ])

  return {
    siteSettings,
    navigation,
    header,
    about,
    skills,
    experiences,
    educations,
    certificates,
    articles,
    services,
    projects,
    footer,
  }
}

/** Returns the home-page view model. Cached by `cache.ts`. */
export const getPortfolioContent = async (): Promise<PortfolioContent> => {
  return mapPortfolioContent(await fetchRawPortfolioDocs())
}

/**
 * Fetches one article by slug (`depth: 2` populates cover image, Media blocks, and internal doc links).
 * When `options.draft` is `true`, returns the latest draft version; otherwise enforces `PUBLISHED_OR_LEGACY_WHERE`.
 */
export const fetchArticleBySlug = async (
  slug: string,
  options?: { draft?: boolean },
): Promise<Article | null> => {
  const payload = await getPayload({ config: configPromise })
  const isDraft = Boolean(options?.draft)
  const where: Where = isDraft
    ? { slug: { equals: slug } }
    : { and: [{ slug: { equals: slug } }, PUBLISHED_OR_LEGACY_WHERE] }

  const res = await payload.find({
    collection: 'articles',
    where,
    draft: isDraft,
    limit: 1,
    depth: 2,
  })
  return res.docs[0] ?? null
}

/**
 * Returns the slugs of published articles that have an on-site page (`hasArticlePage`).
 */
export const fetchPublishedArticleSlugs = async (): Promise<string[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    depth: 0,
    sort: '-publishedAt',
  })
  return res.docs.filter((doc) => hasArticlePage(doc)).map((doc) => doc.slug as string)
}

/**
 * Fetches one project by slug (`depth: 2` populates cover image, Media blocks, and internal doc links).
 * When `options.draft` is `true`, returns the latest draft version; otherwise enforces `PUBLISHED_OR_LEGACY_WHERE`.
 */
export const fetchProjectBySlug = async (
  slug: string,
  options?: { draft?: boolean },
): Promise<Project | null> => {
  const payload = await getPayload({ config: configPromise })
  const isDraft = Boolean(options?.draft)
  const where: Where = isDraft
    ? { slug: { equals: slug } }
    : { and: [{ slug: { equals: slug } }, PUBLISHED_OR_LEGACY_WHERE] }

  const res = await payload.find({
    collection: 'projects',
    where,
    draft: isDraft,
    limit: 1,
    depth: 2,
  })
  return res.docs[0] ?? null
}

/**
 * Returns the slugs of published projects that have an on-site case-study page (`hasProjectPage`).
 */
export const fetchPublishedProjectSlugs = async (): Promise<string[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'projects',
    where: PUBLISHED_OR_LEGACY_WHERE,
    pagination: false,
    depth: 0,
    sort: '_order',
  })
  return res.docs.filter((doc) => hasProjectPage(doc)).map((doc) => doc.slug as string)
}

/**
 * Fetches all CMS-configured URL redirects (`depth: 1` populates internal `articles`/`projects` references).
 */
export const fetchRedirects = async (): Promise<Redirect[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'redirects',
    pagination: false,
    depth: 1,
  })
  return res.docs
}

/**
 * Fetches raw published articles, published projects, and site settings for `/sitemap.xml` and `/feed.xml`.
 */
export const fetchFeedSourceDocs = async (): Promise<{
  articles: Article[]
  projects: Project[]
  siteSettings: SiteSetting | null
}> => {
  const payload = await getPayload({ config: configPromise })
  const [articles, projects, siteSettings] = await Promise.all([
    payload
      .find({
        collection: 'articles',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '-publishedAt',
        depth: 0,
      })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'projects',
        where: PUBLISHED_OR_LEGACY_WHERE,
        pagination: false,
        sort: '_order',
        depth: 0,
      })
      .then((res) => res.docs),
    payload.findGlobal({ slug: 'site-settings', depth: 1 }).catch(() => null),
  ])
  return { articles, projects, siteSettings }
}
