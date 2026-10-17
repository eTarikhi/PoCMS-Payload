import type { Endpoint } from 'payload'
import { revalidatePath } from 'next/cache'

import { isAdmin } from '@/access/roles'

/**
 * POST /api/purge-pages (admins, every environment): marks every cached page and data entry of
 * the site as stale (`revalidatePath('/', 'layout')`), beyond the content tag that "Refresh site
 * cache" expires. Safe in production: nothing on disk changes, pages re-render on their next visit.
 */
export const purgePagesEndpoint: Endpoint = {
  path: '/purge-pages',
  method: 'post',
  handler: async (req) => {
    if (!isAdmin(req.user)) return Response.json({ error: 'Admins only.' }, { status: 403 })
    revalidatePath('/', 'layout')
    req.payload.logger.info({ msg: 'All cached pages purged', user: req.user?.email })
    return Response.json({ purged: true })
  },
}
