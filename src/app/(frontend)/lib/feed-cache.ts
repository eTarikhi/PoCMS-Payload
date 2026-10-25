import { unstable_cache } from 'next/cache'

import { fetchFeedSourceDocs } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'

/**
 * Cached source documents (`articles`, `projects`, `siteSettings`) shared by `/sitemap.xml`
 * and `/feed.xml`, invalidated via `PORTFOLIO_CACHE_TAG`.
 */
export const getCachedFeedSourceDocs = () =>
  unstable_cache(() => fetchFeedSourceDocs(), ['portfolio-feed-source-v1'], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()
