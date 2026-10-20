import { unstable_cache } from 'next/cache'

import { mapSiteSettings } from './mappers'
import { fetchSiteSettings, getPortfolioContent } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'
import type { PortfolioContent, SiteSettingsContent } from './types'

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

/**
 * Site settings (maintenance switch, support address), cached under the same `portfolio` tag: saving
 * the global in /admin expires it through `portfolioAfterChange`, so switching maintenance on or off
 * takes effect on the next request.
 */
export const getCachedSiteSettings: () => Promise<SiteSettingsContent> = unstable_cache(
  async () => mapSiteSettings(await fetchSiteSettings()),
  ['site-settings'],
  { tags: [PORTFOLIO_CACHE_TAG] },
)
