import { unstable_cache } from 'next/cache'

import { fetchProjectBySlug, fetchPublishedProjectSlugs } from './payload-source'
import { mapProjectDetail, type ProjectDetail } from './project-mappers'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG, projectCacheTag } from './revalidate'

/**
 * Published project case-study page data cached under granular tags (`portfolio`, `portfolio:projects`, `project:{slug}`).
 */
export const getCachedProjectBySlug = (slug: string): Promise<ProjectDetail | null> =>
  unstable_cache(
    async () => {
      const doc = await fetchProjectBySlug(slug, { draft: false })
      return doc ? mapProjectDetail(doc) : null
    },
    ['portfolio-project-v3', slug],
    { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.projects, projectCacheTag(slug)] },
  )()

/**
 * Uncached draft-aware reader used exclusively when Next.js `draftMode()` is enabled.
 */
export const getDraftProjectBySlug = async (slug: string): Promise<ProjectDetail | null> => {
  const doc = await fetchProjectBySlug(slug, { draft: true })
  return doc ? mapProjectDetail(doc) : null
}

/** The slugs of every published project that has an on-site case-study page. */
export const getCachedProjectSlugs = (): Promise<string[]> =>
  unstable_cache(() => fetchPublishedProjectSlugs(), ['portfolio-project-slugs-v2'], {
    tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.projects],
  })()
