import { draftMode } from 'next/headers'
import type { Endpoint } from 'payload'

import { can } from '@/access/permissions'
import { articlePagePath } from '@/app/(frontend)/lib/article-page'
import { projectPagePath } from '@/app/(frontend)/lib/project-page'

const PREVIEWABLE_COLLECTIONS = new Set(['articles', 'projects'] as const)
type PreviewableCollection = 'articles' | 'projects'

export function sanitizeInternalRedirect(raw: string | null | undefined, fallback = '/'): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return fallback
  }
  return trimmed
}

function buildTargetUrl(reqUrl: string | undefined, internalPath: string): URL {
  const base = reqUrl && /^https?:\/\//i.test(reqUrl) ? reqUrl : 'http://localhost:3000'
  return new URL(internalPath, base)
}

/**
 * GET /api/draft?collection=articles|projects&slug=<slug>
 *
 * Verifies the caller has RBAC `read` permission on the target collection (or presents a valid
 * `secret` matching `PAYLOAD_SECRET`), checks that the draft document exists, enables Next.js
 * `draftMode()`, and redirects to the canonical internal preview route.
 */
export const draftPreviewEndpoint: Endpoint = {
  path: '/draft',
  method: 'get',
  handler: async (req) => {
    const requestUrl = buildTargetUrl(req.url, req.url ?? '/api/draft')
    const collectionParam = requestUrl.searchParams.get('collection')?.trim() ?? ''
    const slug = requestUrl.searchParams.get('slug')?.trim() ?? ''
    const secret = requestUrl.searchParams.get('secret')?.trim() ?? ''

    if (!PREVIEWABLE_COLLECTIONS.has(collectionParam as PreviewableCollection) || !slug) {
      return Response.json(
        { error: 'Valid "collection" (articles | projects) and "slug" query parameters are required.' },
        { status: 400 },
      )
    }

    const collection = collectionParam as PreviewableCollection
    const expectedSecret = process.env.PAYLOAD_SECRET?.trim()
    const hasSecretAuth = Boolean(expectedSecret && secret && secret === expectedSecret)
    const hasUserAuth = can(req.user, collection, 'read')

    if (!hasUserAuth && !hasSecretAuth) {
      return Response.json(
        { error: 'Sign in with preview permission to view unpublished drafts.' },
        { status: 401 },
      )
    }

    const found = await req.payload.find({
      collection,
      where: { slug: { equals: slug } },
      draft: true,
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const doc = found.docs[0]
    if (!doc?.slug) {
      return Response.json({ error: 'Draft document not found.' }, { status: 404 })
    }

    const targetPath =
      collection === 'articles'
        ? articlePagePath(String(doc.slug))
        : projectPagePath(String(doc.slug))

    try {
      const dm = await draftMode()
      dm.enable()
    } catch {
      // Safe fallback when invoked in unit tests outside Next.js request storage.
    }

    return Response.redirect(buildTargetUrl(req.url, targetPath), 307)
  },
}

/**
 * GET /api/exit-draft?redirect=/articles/<slug>
 *
 * Disables Next.js `draftMode()` and redirects back to the sanitized internal route.
 */
export const exitDraftPreviewEndpoint: Endpoint = {
  path: '/exit-draft',
  method: 'get',
  handler: async (req) => {
    const requestUrl = buildTargetUrl(req.url, req.url ?? '/api/exit-draft')
    const redirectPath = sanitizeInternalRedirect(requestUrl.searchParams.get('redirect'), '/')

    try {
      const dm = await draftMode()
      dm.disable()
    } catch {
      // Safe fallback in unit tests outside Next.js request storage.
    }

    return Response.redirect(buildTargetUrl(req.url, redirectPath), 307)
  },
}
