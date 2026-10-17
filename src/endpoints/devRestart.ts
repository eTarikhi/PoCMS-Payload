import type { Endpoint } from 'payload'
import fs from 'node:fs/promises'
import path from 'node:path'

import { isAdmin } from '@/access/roles'

/**
 * POST /api/dev-restart (admins, development only): restarts the Next.js dev server the way Next
 * does itself when its config changes, by touching `next.config.ts`. The server is unavailable
 * for a few seconds; the client waits for it and reloads.
 */
export const devRestartEndpoint: Endpoint = {
  path: '/dev-restart',
  method: 'post',
  handler: async (req) => {
    if (!isAdmin(req.user)) return Response.json({ error: 'Admins only.' }, { status: 403 })
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Only available in development.' }, { status: 404 })
    }
    if (req.searchParams.get('dryRun')) return Response.json({ available: true })
    const now = new Date()
    await fs.utimes(path.join(process.cwd(), 'next.config.ts'), now, now)
    req.payload.logger.info({ msg: 'Dev server restart requested', user: req.user?.email })
    return Response.json({ restarting: true }, { status: 202 })
  },
}
