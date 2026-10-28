import { revalidateTag } from 'next/cache'

/** Umbrella cache tag attached to all portfolio queries for full-site manual purge. */
export const PORTFOLIO_CACHE_TAG = 'portfolio'

/**
 * Granular Next.js `unstable_cache` tags so saving one document only invalidates the slices
 * that actually depend on it rather than rebuilding all 12+ portfolio queries.
 */
export const CACHE_TAGS = {
  all: PORTFOLIO_CACHE_TAG,
  chrome: 'portfolio:chrome',
  home: 'portfolio:home',
  articles: 'portfolio:articles',
  projects: 'portfolio:projects',
  redirects: 'portfolio:redirects',
  feeds: 'portfolio:feeds',
} as const

export const articleCacheTag = (slug: string): string => `article:${slug.trim()}`
export const projectCacheTag = (slug: string): string => `project:${slug.trim()}`

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

/** Invalidates site chrome (`SiteSettings`, `Navigation`, `Footer`, `Header`) + Home + Feeds. */
export const revalidateChrome = (): string[] =>
  revalidateTags([CACHE_TAGS.chrome, CACHE_TAGS.home, CACHE_TAGS.feeds])

/** Invalidates Home-only profile sections (`About`, `Skills`, `Experiences`, `Educations`, `Certificates`, `Services`). */
export const revalidateHomeOnly = (): string[] => revalidateTags([CACHE_TAGS.home])

/** Invalidates article hub, feeds, home spotlight, and specific article slug(s). */
export const revalidateArticleTags = (
  slug?: string | null,
  previousSlug?: string | null,
): string[] => {
  const tags: string[] = [CACHE_TAGS.articles, CACHE_TAGS.home, CACHE_TAGS.feeds]
  if (slug?.trim()) tags.push(articleCacheTag(slug))
  if (previousSlug?.trim() && previousSlug.trim() !== slug?.trim()) {
    tags.push(articleCacheTag(previousSlug))
  }
  return revalidateTags(tags)
}

/** Invalidates project hub, feeds/sitemap, home grid, and specific project slug(s). */
export const revalidateProjectTags = (
  slug?: string | null,
  previousSlug?: string | null,
): string[] => {
  const tags: string[] = [CACHE_TAGS.projects, CACHE_TAGS.home, CACHE_TAGS.feeds]
  if (slug?.trim()) tags.push(projectCacheTag(slug))
  if (previousSlug?.trim() && previousSlug.trim() !== slug?.trim()) {
    tags.push(projectCacheTag(previousSlug))
  }
  return revalidateTags(tags)
}

/** Invalidates only the CMS URL redirects cache. */
export const revalidateRedirectsTags = (): string[] => revalidateTags([CACHE_TAGS.redirects])
