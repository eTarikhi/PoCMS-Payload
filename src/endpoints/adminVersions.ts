import type { Endpoint } from 'payload'

import { can, hasCapability } from '@/access/permissions'
import {
  inspectDocumentVersionRetention,
  inspectVersionRetention,
  pruneContentVersions,
} from '@/lib/versionRetention'
import {
  isVersionedContentCollection,
  VERSIONED_CONTENT_COLLECTIONS,
  type VersionedContentCollection,
  type VersionRetentionPolicy,
} from '@/lib/versionRetentionShared'

function parseQueryPolicy(urlStr: string): {
  collectionParam: string
  parentId: string | null
  policy: VersionRetentionPolicy
} {
  const parsed = new URL(urlStr, 'http://localhost')
  const collectionParam = parsed.searchParams.get('collection')?.trim() || 'all'
  const parentId = parsed.searchParams.get('parentId')?.trim() || null

  const keepRaw = parsed.searchParams.get('keepLatestPerDoc')
  const ageRaw = parsed.searchParams.get('maxAgeDays')
  const autosaveRaw = parsed.searchParams.get('pruneAutosaveSnapshots')

  return {
    collectionParam,
    parentId,
    policy: {
      keepLatestPerDoc: keepRaw !== null && keepRaw !== '' ? Number(keepRaw) : undefined,
      maxAgeDays: ageRaw !== null && ageRaw !== '' ? Number(ageRaw) : null,
      pruneAutosaveSnapshots:
        autosaveRaw === 'false' ? false : autosaveRaw === 'true' ? true : undefined,
    },
  }
}

/**
 * GET /api/admin-versions — inspects version history counts and prunable snapshots (per-doc or bulk).
 * POST /api/admin-versions — dry-runs or executes version pruning via `payload.db.deleteVersions`.
 *
 * RBAC:
 * - Single-document (`parentId` + `collection`): requires `full` (`delete`) access on that collection or `manageDatabase`.
 * - Bulk multi-document / cross-collection: requires `manageDatabase`.
 */
export const adminVersionsEndpoints: Endpoint[] = [
  {
    path: '/admin-versions',
    method: 'get',
    handler: async (req) => {
      if (!req.user) {
        return Response.json({ error: 'Authentication required.' }, { status: 403 })
      }

      const { collectionParam, parentId, policy } = parseQueryPolicy(req.url ?? 'http://localhost')

      if (parentId) {
        if (!isVersionedContentCollection(collectionParam)) {
          return Response.json(
            { error: 'Valid collection ("articles" or "projects") is required with parentId.' },
            { status: 400 },
          )
        }
        if (
          !can(req.user, collectionParam, 'delete') &&
          !hasCapability(req.user, 'manageDatabase')
        ) {
          return Response.json(
            { error: `Needs Full access on ${collectionParam} or Database management.` },
            { status: 403 },
          )
        }

        const stats = await inspectDocumentVersionRetention({
          payload: req.payload,
          collection: collectionParam,
          parentId,
          policy,
          req,
        })
        return Response.json({ ok: true, mode: 'document', document: stats })
      }

      if (!hasCapability(req.user, 'manageDatabase')) {
        return Response.json(
          { error: 'Needs the Database management permission.' },
          { status: 403 },
        )
      }

      const collections: readonly VersionedContentCollection[] =
        collectionParam === 'all'
          ? VERSIONED_CONTENT_COLLECTIONS
          : isVersionedContentCollection(collectionParam)
            ? [collectionParam]
            : []

      if (collections.length === 0) {
        return Response.json(
          { error: `Unknown versioned collection "${collectionParam}".` },
          { status: 400 },
        )
      }

      const overview = await inspectVersionRetention({
        payload: req.payload,
        collections,
        policy,
        req,
      })
      return Response.json({ ok: true, mode: 'overview', overview })
    },
  },
  {
    path: '/admin-versions',
    method: 'post',
    handler: async (req) => {
      if (!req.user) {
        return Response.json({ error: 'Authentication required.' }, { status: 403 })
      }

      const body = (await req.json?.().catch(() => ({}))) as {
        collection?: string
        parentId?: number | string | null
        keepLatestPerDoc?: number
        maxAgeDays?: number | null
        pruneAutosaveSnapshots?: boolean
        dryRun?: boolean
      }

      const collectionParam = body?.collection?.trim() || 'all'
      const hasParentId =
        body?.parentId !== undefined &&
        body?.parentId !== null &&
        String(body.parentId).trim() !== ''

      if (hasParentId) {
        if (!isVersionedContentCollection(collectionParam)) {
          return Response.json(
            { error: 'Valid collection ("articles" or "projects") is required with parentId.' },
            { status: 400 },
          )
        }
        if (
          !can(req.user, collectionParam, 'delete') &&
          !hasCapability(req.user, 'manageDatabase')
        ) {
          return Response.json(
            { error: `Needs Full access on ${collectionParam} or Database management.` },
            { status: 403 },
          )
        }

        const report = await pruneContentVersions({
          payload: req.payload,
          collections: [collectionParam],
          parentId: body.parentId,
          policy: {
            keepLatestPerDoc: body.keepLatestPerDoc,
            maxAgeDays: body.maxAgeDays,
            pruneAutosaveSnapshots: body.pruneAutosaveSnapshots,
          },
          dryRun: Boolean(body.dryRun),
          req,
        })
        const document = await inspectDocumentVersionRetention({
          payload: req.payload,
          collection: collectionParam,
          parentId: body.parentId!,
          policy: report.policy,
          req,
        })
        return Response.json({ ok: true, report, document })
      }

      if (!hasCapability(req.user, 'manageDatabase')) {
        return Response.json(
          { error: 'Needs the Database management permission.' },
          { status: 403 },
        )
      }

      const collections: readonly VersionedContentCollection[] =
        collectionParam === 'all'
          ? VERSIONED_CONTENT_COLLECTIONS
          : isVersionedContentCollection(collectionParam)
            ? [collectionParam]
            : []

      if (collections.length === 0) {
        return Response.json(
          { error: `Unknown versioned collection "${collectionParam}".` },
          { status: 400 },
        )
      }

      try {
        const report = await pruneContentVersions({
          payload: req.payload,
          collections,
          policy: {
            keepLatestPerDoc: body.keepLatestPerDoc,
            maxAgeDays: body.maxAgeDays,
            pruneAutosaveSnapshots: body.pruneAutosaveSnapshots,
          },
          dryRun: Boolean(body.dryRun),
          req,
        })
        const overview = await inspectVersionRetention({
          payload: req.payload,
          collections: VERSIONED_CONTENT_COLLECTIONS,
          policy: report.policy,
          req,
        })
        return Response.json({ ok: true, report, overview })
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : 'Version retention operation failed.',
          },
          { status: 500 },
        )
      }
    },
  },
]
