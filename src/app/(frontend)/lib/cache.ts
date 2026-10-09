import { unstable_cache } from 'next/cache'

import { getPortfolioContent } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'
import type { PortfolioContent } from './types'

/**
 * The home-page content, cached until `revalidatePortfolio()` marks the `portfolio` tag stale.
 *
 * The key parts are fixed, so the cache entry is shared by every request. Editors trigger a refresh
 * by saving a document in /admin (see `hooks.ts`), not by a time-based expiry.
 */
export const getCachedPortfolioContent: () => Promise<PortfolioContent> = unstable_cache(
  () => getPortfolioContent(),
  ['portfolio-content'],
  { tags: [PORTFOLIO_CACHE_TAG] },
)
