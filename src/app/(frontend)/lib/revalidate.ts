import { revalidateTag } from 'next/cache'

/** Umbrella cache tag attached to all portfolio queries for full-site manual purge. */
export const PORTFOLIO_CACHE_TAG = 'portfolio'

/**
 * Fine-grained Next.js `unstable_cache` tags so saving one document or global only invalidates
 * the exact slices that depend on it rather than rebuilding all 12+ portfolio queries.
 */
export const CACHE_TAGS = {
  all: PORTFOLIO_CACHE_TAG,
  chrome: 'portfolio:chrome',
  home: 'portfolio:home',
  homeHeader: 'home:header',
  homeProfile: 'home:profile',
  homeArticles: 'home:articles',
  homeProjects: 'home:projects',
  articles: 'articles:list',
  projects: 'projects:list',
  globalHeader: 'global:header',
  globalSiteSettings: 'global:site-settings',
  globalNavigation: 'global:navigation',
  globalFooter: 'global:footer',
  redirects: 'portfolio:redirects',
  feeds: 'portfolio:feeds',
} as const

export const articleCacheTag = (slug: string): string => `article:${slug.trim()}`
export const projectCacheTag = (slug: string): string => `project:${slug.trim()}`
export const globalCacheTag = (slug: string): string => `global:${slug.trim()}`

/**
 * Safely invalidates a deduplicated list of cache tags. Errors (e.g. outside a Next.js
 * request/server context during CLI scripts or Vitest runs) are caught so saves never fail.
 */
export const revalidateTags = (tags: readonly string[]): string[] => {
  const unique = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)))
  for (const tag of unique) {
    try {
      revalidateTag(tag, 'max')
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          `[portfolio] Could not revalidate cache tag "${tag}":`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  }
  return unique
}

/** Marks the umbrella `portfolio` cache tag stale (full site refresh). */
export const revalidatePortfolio = (): void => {
  revalidateTags([PORTFOLIO_CACHE_TAG])
}

/** Invalidates all site chrome (`SiteSettings`, `Navigation`, `Footer`, `Header`) + Home + Feeds. */
export const revalidateChrome = (): string[] =>
  revalidateTags([
    CACHE_TAGS.chrome,
    CACHE_TAGS.globalHeader,
    CACHE_TAGS.globalSiteSettings,
    CACHE_TAGS.globalNavigation,
    CACHE_TAGS.globalFooter,
    CACHE_TAGS.homeHeader,
    CACHE_TAGS.home,
    CACHE_TAGS.feeds,
  ])

/** Surgical invalidation when a single Global (`header`, `site-settings`, `navigation`, `footer`) changes. */
export const revalidateGlobalBySlug = (slug?: string | null): string[] => {
  switch (slug) {
    case 'header':
      return revalidateTags([
        CACHE_TAGS.globalHeader,
        CACHE_TAGS.homeHeader,
        CACHE_TAGS.chrome,
        CACHE_TAGS.home,
      ])
    case 'footer':
      return revalidateTags([
        CACHE_TAGS.globalFooter,
        CACHE_TAGS.chrome,
        CACHE_TAGS.home,
      ])
    case 'navigation':
      return revalidateTags([
        CACHE_TAGS.globalNavigation,
        CACHE_TAGS.chrome,
        CACHE_TAGS.home,
      ])
    case 'site-settings':
      return revalidateTags([
        CACHE_TAGS.globalSiteSettings,
        CACHE_TAGS.chrome,
        CACHE_TAGS.home,
        CACHE_TAGS.projects,
        CACHE_TAGS.feeds,
      ])
    default:
      return revalidateChrome()
  }
}

/** Invalidates Home-only profile sections (`About`, `Skills`, `Experiences`, `Educations`, `Certificates`, `Services`). */
export const revalidateHomeOnly = (): string[] =>
  revalidateTags([CACHE_TAGS.homeProfile, CACHE_TAGS.home])

/** Invalidates article hub (`articles:list`), home spotlight (`home:articles`), feeds, and specific `article:${slug}`. */
export const revalidateArticleTags = (
  slug?: string | null,
  previousSlug?: string | null,
): string[] => {
  const tags: string[] = [
    CACHE_TAGS.articles,
    CACHE_TAGS.homeArticles,
    CACHE_TAGS.home,
    CACHE_TAGS.feeds,
  ]
  if (slug?.trim()) tags.push(articleCacheTag(slug))
  if (previousSlug?.trim() && previousSlug.trim() !== slug?.trim()) {
    tags.push(articleCacheTag(previousSlug))
  }
  return revalidateTags(tags)
}

/** Invalidates project hub (`projects:list`), home grid (`home:projects`), feeds/sitemap, and specific `project:${slug}`. */
export const revalidateProjectTags = (
  slug?: string | null,
  previousSlug?: string | null,
): string[] => {
  const tags: string[] = [
    CACHE_TAGS.projects,
    CACHE_TAGS.homeProjects,
    CACHE_TAGS.home,
    CACHE_TAGS.feeds,
  ]
  if (slug?.trim()) tags.push(projectCacheTag(slug))
  if (previousSlug?.trim() && previousSlug.trim() !== slug?.trim()) {
    tags.push(projectCacheTag(previousSlug))
  }
  return revalidateTags(tags)
}

/** Invalidates only the CMS URL redirects cache. */
export const revalidateRedirectsTags = (): string[] => revalidateTags([CACHE_TAGS.redirects])
