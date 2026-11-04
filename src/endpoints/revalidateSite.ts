import { revalidateTag } from 'next/cache'
import type { Endpoint } from 'payload'

import { CACHE_TAGS, PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

/**
 * POST /api/revalidate-site: expires the public site's cached content right away.
 *
 * Saves already mark scoped cache tags stale through hooks (stale-while-revalidate). This is the
 * manual immediate refresh for signed-in editors and admins after seeds, imports, or direct
 * database edits; `expire: 0` means the next request renders fresh data across all cache domains.
 */
export const revalidateSiteEndpoint: Endpoint = {
  path: '/revalidate-site',
  method: 'post',
  handler: async (req) => {
    if (!req.user)
      return Response.json({ error: 'Sign in to refresh the site cache.' }, { status: 401 })
    const tags = Object.values(CACHE_TAGS)
    for (const tag of tags) {
      revalidateTag(tag, { expire: 0 })
    }
    req.payload.logger.info({ msg: 'Site cache refreshed', user: req.user.email, tags })
    return Response.json({ revalidated: true, tag: PORTFOLIO_CACHE_TAG, tags })
  },
}
