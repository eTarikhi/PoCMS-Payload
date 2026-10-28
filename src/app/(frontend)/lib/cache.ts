import { unstable_cache } from 'next/cache'

import {
  getPortfolioContent,
  getPublishedArticlesList,
  getPublishedProjectsList,
  getSiteChromeContent,
  type SiteChromeContent,
} from './payload-source'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from './revalidate'
import type { ArticleItem, PortfolioContent, ProjectsContent } from './types'

export type { SiteChromeContent }

/**
 * Lightweight cached loader for site-wide chrome (`SiteSettings`, `Navigation`, `Header`, `Footer`).
 * Used by `layout.tsx`, `not-found.tsx`, `/articles`, `/projects`, and detail pages so non-home
 * routes never pay the cost of querying all 12 home-page collections.
 */
export const getCachedSiteChrome: () => Promise<SiteChromeContent> = unstable_cache(
  () => getSiteChromeContent(),
  ['portfolio-site-chrome-v1'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.chrome] },
)

/**
 * Cached published articles list (`ArticleItem[]`), invalidated only when `articles` (or umbrella `portfolio`) changes.
 */
export const getCachedArticlesList: () => Promise<ArticleItem[]> = unstable_cache(
  () => getPublishedArticlesList(),
  ['portfolio-articles-list-v1'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.articles] },
)

/**
 * Cached published projects hub (`ProjectsContent`), invalidated only when `projects` or `chrome` changes.
 */
export const getCachedProjectsList: () => Promise<ProjectsContent> = unstable_cache(
  () => getPublishedProjectsList(),
  ['portfolio-projects-list-v1'],
  { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.projects, CACHE_TAGS.chrome] },
)

/**
 * Full home-page aggregate view model (`/`), tagged across home, chrome, articles, and projects.
 */
export const getCachedPortfolioContent: () => Promise<PortfolioContent> = unstable_cache(
  () => getPortfolioContent(),
  ['portfolio-content-v2'],
  {
    tags: [
      PORTFOLIO_CACHE_TAG,
      CACHE_TAGS.home,
      CACHE_TAGS.chrome,
      CACHE_TAGS.articles,
      CACHE_TAGS.projects,
    ],
  },
)
