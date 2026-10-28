import { unstable_cache } from 'next/cache'

import { fetchFeedSourceDocs } from './payload-source'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from './revalidate'

/**
 * Cached source documents (`articles`, `projects`, `siteSettings`) shared by `/sitemap.xml`
 * and `/feed.xml`, invalidated via granular `portfolio:feeds`, `portfolio:articles`, `portfolio:projects`, and `portfolio:chrome` tags.
 */
export const getCachedFeedSourceDocs = () =>
  unstable_cache(() => fetchFeedSourceDocs(), ['portfolio-feed-source-v2'], {
    tags: [
      PORTFOLIO_CACHE_TAG,
      CACHE_TAGS.feeds,
      CACHE_TAGS.articles,
      CACHE_TAGS.projects,
      CACHE_TAGS.chrome,
    ],
  })()
