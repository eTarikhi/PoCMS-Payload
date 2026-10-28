import { unstable_cache } from 'next/cache'

import type { Redirect } from '@/payload-types'

import { fetchRedirects } from './payload-source'
import { matchRedirect, type ResolvedRedirect } from './redirects-utils'
import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from './revalidate'
import { siteUrl } from './seo'

export * from './redirects-utils'

/**
 * Cached list of CMS redirects (`@payloadcms/plugin-redirects`), invalidated via `portfolio:redirects`
 * (and umbrella `portfolio`).
 */
export const getCachedRedirects = (): Promise<Redirect[]> =>
  unstable_cache(() => fetchRedirects(), ['portfolio-redirects-v2'], {
    tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.redirects],
  })()

/**
 * Resolves a redirect match for `url` against the cached `redirects` collection.
 */
export const findCachedRedirect = async (url: string): Promise<ResolvedRedirect | null> => {
  const redirects = await getCachedRedirects()
  return matchRedirect(url, redirects, siteUrl())
}
