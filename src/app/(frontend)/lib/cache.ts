import { unstable_cache } from 'next/cache'

import { mapCustomCode } from './custom-code'
import {
  mapFooter,
  mapHeader,
  mapHeaderStudio,
  mapNavigation,
  mapPortfolioContent,
  mapSiteSettings,
} from './mappers'
import {
  fetchCustomCodeGlobal,
  fetchFooterGlobal,
  fetchHeaderGlobal,
  fetchHomeProfileRawDocs,
  fetchNavigationGlobal,
  fetchPublishedArticleCardDocs,
  fetchPublishedProjectCardDocs,
  fetchSiteSettingsGlobal,
  getPublishedArticlesList,
  getPublishedProjectsList,
  type SiteChromeContent,
} from './payload-source'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from './revalidate'
import type { ArticleItem, PortfolioContent, ProjectsContent } from './types'

export type { SiteChromeContent }

/**
 * Per-global & per-section cached loaders so updating a single Global (e.g. `footer`) or a single
 * section (`projects` / `articles` / `header`) only re-queries that slice from PostgreSQL.
 */
export const getCachedSiteSettingsDoc = unstable_cache(
  () => fetchSiteSettingsGlobal(),
  ['portfolio-global-site-settings-v2'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.chrome, CACHE_TAGS.globalSiteSettings] },
)

export const getCachedNavigationDoc = unstable_cache(
  () => fetchNavigationGlobal(),
  ['portfolio-global-navigation-v2'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.chrome, CACHE_TAGS.globalNavigation] },
)

export const getCachedHeaderDoc = unstable_cache(
  () => fetchHeaderGlobal(),
  ['portfolio-global-header-v2'],
  {
    tags: [
      PORTFOLIO_CACHE_TAG,
      CACHE_TAGS.chrome,
      CACHE_TAGS.globalHeader,
      CACHE_TAGS.homeHeader,
    ],
  },
)

export const getCachedFooterDoc = unstable_cache(
  () => fetchFooterGlobal(),
  ['portfolio-global-footer-v2'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.chrome, CACHE_TAGS.globalFooter] },
)

export const getCachedCustomCodeDoc = unstable_cache(
  () => fetchCustomCodeGlobal(),
  ['portfolio-global-custom-code-v1'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.chrome, CACHE_TAGS.globalCustomCode] },
)

export const getCachedHomeProfileDocs = unstable_cache(
  () => fetchHomeProfileRawDocs(),
  ['portfolio-home-profile-v2'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.home, CACHE_TAGS.homeProfile] },
)

export const getCachedRawArticleCards = unstable_cache(
  () => fetchPublishedArticleCardDocs(),
  ['portfolio-raw-article-cards-v2'],
  {
    tags: [
      PORTFOLIO_CACHE_TAG,
      CACHE_TAGS.articles,
      CACHE_TAGS.homeArticles,
    ],
  },
)

export const getCachedRawProjectCards = unstable_cache(
  () => fetchPublishedProjectCardDocs(),
  ['portfolio-raw-project-cards-v2'],
  {
    tags: [
      PORTFOLIO_CACHE_TAG,
      CACHE_TAGS.projects,
      CACHE_TAGS.homeProjects,
    ],
  },
)

/**
 * Composes the 5 independently cached globals (`global:site-settings`, `global:navigation`,
 * `global:header`, `global:footer`, `global:custom-code`).
 */
export const getCachedSiteChrome = async (): Promise<SiteChromeContent> => {
  const [siteSettingsDoc, navigationDoc, headerDoc, footerDoc, customCodeDoc] = await Promise.all([
    getCachedSiteSettingsDoc(),
    getCachedNavigationDoc(),
    getCachedHeaderDoc(),
    getCachedFooterDoc(),
    getCachedCustomCodeDoc(),
  ])

  return {
    siteSettings: mapSiteSettings(siteSettingsDoc),
    navigation: mapNavigation(navigationDoc),
    header: mapHeader(headerDoc),
    headerStudio: mapHeaderStudio(headerDoc),
    footer: mapFooter(footerDoc),
    customCode: mapCustomCode(customCodeDoc),
  }
}

/**
 * Cached published articles list (`ArticleItem[]`), invalidated under `articles:list`.
 */
export const getCachedArticlesList: () => Promise<ArticleItem[]> = unstable_cache(
  () => getPublishedArticlesList(),
  ['portfolio-articles-list-v2'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.articles, CACHE_TAGS.homeArticles] },
)

/**
 * Cached published projects hub (`ProjectsContent`), invalidated under `projects:list` or `global:site-settings`.
 */
export const getCachedProjectsList: () => Promise<ProjectsContent> = unstable_cache(
  () => getPublishedProjectsList(),
  ['portfolio-projects-list-v2'],
  {
    tags: [
      PORTFOLIO_CACHE_TAG,
      CACHE_TAGS.projects,
      CACHE_TAGS.homeProjects,
      CACHE_TAGS.globalSiteSettings,
    ],
  },
)

/**
 * Full home-page aggregate view model (`/`), composed from independently cached slices
 * (`home:header`, `home:profile`, `home:articles`, `home:projects`, `global:footer`, etc.) so
 * editing one slice never forces PostgreSQL to re-query the remaining 11 collections/globals.
 */
export const getCachedPortfolioContent = async (): Promise<PortfolioContent> => {
  const [siteSettings, navigation, header, profile, articles, projects, footer, customCode] =
    await Promise.all([
      getCachedSiteSettingsDoc(),
      getCachedNavigationDoc(),
      getCachedHeaderDoc(),
      getCachedHomeProfileDocs(),
      getCachedRawArticleCards(),
      getCachedRawProjectCards(),
      getCachedFooterDoc(),
      getCachedCustomCodeDoc(),
    ])

  return mapPortfolioContent({
    siteSettings,
    navigation,
    header,
    about: profile.about,
    skills: profile.skills,
    experiences: profile.experiences,
    educations: profile.educations,
    certificates: profile.certificates,
    articles,
    services: profile.services,
    projects,
    footer,
    customCode,
  })
}
