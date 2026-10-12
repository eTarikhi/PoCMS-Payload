import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { PORTFOLIO_CACHE_TAG } from '@/app/(frontend)/lib/revalidate'

/**
 * Marks the live-site portfolio cache stale (same tag the admin save hooks use).
 *
 * POST /api/revalidate — authenticated admin users only. This is the manual escape
 * hatch for out-of-band content changes (seeds, imports, direct DB edits) where the
 * `portfolioAfterChange` hooks could not run to refresh the cache themselves.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: req.headers })

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    revalidateTag(PORTFOLIO_CACHE_TAG, 'max')
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'revalidateTag failed',
        revalidated: false,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ revalidated: true, tag: PORTFOLIO_CACHE_TAG })
}
