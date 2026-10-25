import { unstable_cache } from 'next/cache'

import { mapProjectDetail, type ProjectDetail } from './project-mappers'
import { fetchProjectBySlug, fetchPublishedProjectSlugs } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'

/**
 * One project's case-study page data, cached under its own key and the shared `portfolio` tag.
 */
export const getCachedProjectBySlug = (slug: string): Promise<ProjectDetail | null> =>
  unstable_cache(
    async () => {
      const doc = await fetchProjectBySlug(slug)
      return doc ? mapProjectDetail(doc) : null
    },
    ['portfolio-project-v2', slug],
    { tags: [PORTFOLIO_CACHE_TAG] },
  )()

/** The slugs of every project that has an on-site case-study page. */
export const getCachedProjectSlugs = (): Promise<string[]> =>
  unstable_cache(() => fetchPublishedProjectSlugs(), ['portfolio-project-slugs'], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()
