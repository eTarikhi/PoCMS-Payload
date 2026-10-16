import { unstable_cache } from 'next/cache'

import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

import { getPortfolioContent } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'
import type { PortfolioContent } from './types'

/**
 * Returns content cached per locale until an editor refreshes the shared portfolio tag. Locale is a
 * cache-key component: English and Persian can never serve each other's rendered content.
 */
export const getCachedPortfolioContent = (
  locale: Locale = DEFAULT_LOCALE,
): Promise<PortfolioContent> =>
  unstable_cache(() => getPortfolioContent(locale), ['portfolio-content', locale], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()
