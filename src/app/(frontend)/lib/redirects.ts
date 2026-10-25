import { unstable_cache } from 'next/cache'

import type { Redirect } from '@/payload-types'

import { fetchRedirects } from './payload-source'
import { matchRedirect, type ResolvedRedirect } from './redirects-utils'
import { PORTFOLIO_CACHE_TAG } from './revalidate'
import { siteUrl } from './seo'

/**
 * Cached list of CMS redirects (`@payloadcms/plugin-redirects`), invalidated automatically
 * whenever content or redirects change (`PORTFOLIO_CACHE_TAG`).
 */
export const getCachedRedirects = (): Promise<Redirect[]> =>
  unstable_cache(() => fetchRedirects(), ['portfolio-redirects-v1'], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()

/**
 * Resolves a redirect match for `url` against the cached `redirects` collection.
 */
export const findCachedRedirect = async (url: string): Promise<ResolvedRedirect | null> => {
  const redirects = await getCachedRedirects()
  return matchRedirect(url, redirects, siteUrl())
}
