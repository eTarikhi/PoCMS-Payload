import type { Endpoint } from 'payload'
import { revalidateTag } from 'next/cache'

import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

/**
 * POST /api/revalidate-site: expires the public site's cached content right away.
 *
 * Saves already mark the cache stale through hooks (stale-while-revalidate, so the next visitor can
 * still get the old page once). This is the manual way for signed-in editors and admins after
 * seeds, imports or direct database edits; `expire: 0` means the next request renders fresh data.
 */
export const revalidateSiteEndpoint: Endpoint = {
  path: '/revalidate-site',
  method: 'post',
  handler: async (req) => {
    if (!req.user)
      return Response.json({ error: 'Sign in to refresh the site cache.' }, { status: 401 })
    revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 })
    req.payload.logger.info({ msg: 'Site cache refreshed', user: req.user.email })
    return Response.json({ revalidated: true, tag: PORTFOLIO_CACHE_TAG })
  },
}
