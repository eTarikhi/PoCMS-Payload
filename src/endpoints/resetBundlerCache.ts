import type { Endpoint } from 'payload'
import fs from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'

import { isAdmin } from '@/access/roles'

/**
 * Persistent caches that are safe to drop while the dev server runs (it keeps its in-memory state
 * and rebuilds them): Turbopack's dev cache and data cache under `.next/dev/cache`, and the build
 * caches under `.next/cache` (images, fetched data, compilers).
 */
const CACHE_DIRS = [
  '.next/dev/cache/turbopack',
  '.next/dev/cache/fetch-cache',
  '.next/cache/images',
  '.next/cache/fetch-cache',
  '.next/cache/webpack',
  '.next/cache/swc',
  '.next/cache/eslint',
]

/**
 * POST /api/reset-bundler-cache (admins, development only): drops the bundler's persistent cache
 * (Turbopack) and Next.js's other on-disk caches, and purges every cached page, for when the dev
 * server keeps serving stale output. The running server keeps what it holds in memory; the next
 * start compiles from scratch. `?dryRun=1` only reports whether the action is available.
 */
export const resetBundlerCacheEndpoint: Endpoint = {
  path: '/reset-bundler-cache',
  method: 'post',
  handler: async (req) => {
    if (!isAdmin(req.user)) return Response.json({ error: 'Admins only.' }, { status: 403 })
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'Only available in development.' }, { status: 404 })
    }
    if (req.searchParams.get('dryRun')) return Response.json({ available: true })

    const cleared: string[] = []
    for (const dir of CACHE_DIRS) {
      const target = path.join(process.cwd(), dir)
      const exists = await fs.stat(target).then(
        () => true,
        () => false,
      )
      if (!exists) continue
      await fs.rm(target, { recursive: true, force: true })
      cleared.push(dir)
    }
    revalidatePath('/', 'layout')
    req.payload.logger.info({ msg: 'Bundler cache reset', cleared, user: req.user?.email })
    return Response.json({ cleared, revalidated: true })
  },
}
