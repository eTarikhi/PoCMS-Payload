import type { CollectionSlug, Where, WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { adminURL, collectionLabel } from '@/components/admin/utilities/collections'
import { relativeTime } from '@/components/admin/utilities/dates'

const COLLECTIONS: CollectionSlug[] = [
  'articles',
  'projects',
  'services',
  'media',
  'header',
  'about',
  'experiences',
  'educations',
  'skills',
  'certificates',
]
const LIMIT = 8

type Row = {
  id: number | string
  slug: CollectionSlug
  title: string
  updatedAt: string
  actor?: string | null
  actionVerb?: string | null
}

const ACTION_VERBS: Record<string, string> = {
  create: 'created by',
  update: 'edited by',
  trash: 'trashed by',
  restore: 'restored by',
}

/**
 * Looks up the latest audit-log attribution for a bounded list of `(slug, id)` pairs in a single query.
 * Only the display actor name/email and action verb are returned so editors see teammate attribution
 * on documents they already have read access to.
 */
export async function lookupRecentChangeActors(
  req: WidgetServerProps['req'],
  rows: Array<{ slug: CollectionSlug; id: number | string }>,
): Promise<Map<string, { actor: string; actionVerb: string }>> {
  const attribution = new Map<string, { actor: string; actionVerb: string }>()
  if (rows.length === 0 || !req.payload.collections['audit-logs']) {
    return attribution
  }

  try {
    const clauses: Where[] = rows.map<Where>((row) => ({
      and: [
        { entityType: { equals: row.slug } } as Where,
        { documentId: { equals: String(row.id) } } as Where,
      ],
    }))

    const { docs } = await req.payload.find({
      collection: 'audit-logs',
      req,
      overrideAccess: true,
      depth: 0,
      limit: rows.length * 4,
      sort: '-createdAt',
      where: clauses.length === 1 ? clauses[0] : { or: clauses },
      select: {
        action: true,
        entityType: true,
        documentId: true,
        actorName: true,
        actorEmail: true,
        actorLabel: true,
      } as never,
    })

    for (const raw of docs) {
      const entry = raw as unknown as {
        action?: string
        entityType?: string
        documentId?: string | null
        actorName?: string | null
        actorEmail?: string | null
        actorLabel?: string | null
      }
      if (!entry.entityType || !entry.documentId) continue
      const key = `${entry.entityType}:${entry.documentId}`
      if (attribution.has(key)) continue

      const actor =
        entry.actorName?.trim() ||
        entry.actorEmail?.trim() ||
        (entry.actorLabel && entry.actorLabel !== 'System' ? entry.actorLabel : '')
      if (!actor) continue

      attribution.set(key, {
        actor,
        actionVerb: ACTION_VERBS[entry.action ?? 'update'] ?? 'edited by',
      })
    }
  } catch {
    // Attribution is additive; never fail the dashboard widget if audit lookup fails.
  }

  return attribution
}

/** The most recently edited documents across the content collections, with actor attribution. */
export async function RecentChangesWidget({ req }: WidgetServerProps) {
  const results = await Promise.all(
    COLLECTIONS.map(async (slug): Promise<Row[]> => {
      const config = req.payload.collections[slug]?.config
      if (!config) return []
      const titleField = config.admin?.useAsTitle ?? 'id'
      const { docs } = await req.payload.find({
        collection: slug,
        req,
        overrideAccess: false,
        depth: 0,
        limit: LIMIT,
        sort: '-updatedAt',
        // Include-only select (mixing true and false switches Payload to exclude mode).
        select: {
          [titleField]: true,
          updatedAt: true,
          ...(config.upload ? { filename: true } : {}),
        } as never,
      })
      return docs.map((doc) => {
        const record = doc as unknown as Record<string, unknown> & {
          id: number | string
          updatedAt: string
        }
        const title = record[titleField] ?? record.filename ?? `#${record.id}`
        return { id: record.id, slug, title: String(title), updatedAt: record.updatedAt }
      })
    }),
  )

  const baseRows = results
    .flat()
    .filter((row) => typeof row.updatedAt === 'string')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LIMIT)

  const actorsByKey = await lookupRecentChangeActors(req, baseRows)
  const rows: Row[] = baseRows.map((row) => {
    const match = actorsByKey.get(`${row.slug}:${String(row.id)}`)
    return match ? { ...row, actor: match.actor, actionVerb: match.actionVerb } : row
  })

  const language = req.i18n.language || 'en'
  const canViewAuditLog = hasCapability(req.user, 'viewAuditLog')

  return (
    <WidgetCard
      title="Recent changes"
      description="The last documents edited by anyone on the team."
      action={
        canViewAuditLog ? (
          <Link
            href={adminURL(req, 'audit-logs')}
            className="acn:text-xs acn:font-medium acn:text-muted-foreground acn:no-underline acn:hover:text-foreground acn:hover:underline"
          >
            Audit log →
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="acn:text-sm acn:text-muted-foreground">Nothing has been edited yet.</p>
      ) : (
        <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:divide-y acn:divide-border acn:p-0">
          {rows.map((row) => (
            <li
              key={`${row.slug}-${row.id}`}
              className="acn:flex acn:items-center acn:gap-3 acn:py-2"
            >
              <div className="acn:min-w-0 acn:flex-1">
                <Link
                  href={adminURL(req, row.slug, row.id)}
                  className="acn:block acn:truncate acn:text-sm acn:font-medium acn:text-foreground acn:no-underline acn:hover:underline acn:pointer-coarse:-my-2 acn:pointer-coarse:py-2"
                >
                  {row.title}
                </Link>
                {row.actor ? (
                  <span className="acn:block acn:truncate acn:text-xs acn:text-muted-foreground">
                    {row.actionVerb ?? 'edited by'}{' '}
                    <span className="acn:font-medium acn:text-foreground/80">{row.actor}</span>
                  </span>
                ) : null}
              </div>
              <Badge variant="outline" className="acn:shrink-0">
                {collectionLabel(req, row.slug)}
              </Badge>
              <time
                dateTime={row.updatedAt}
                title={new Date(row.updatedAt).toLocaleString(language)}
                className="acn:w-24 acn:shrink-0 acn:text-right acn:text-xs acn:text-muted-foreground acn:tabular-nums"
              >
                {relativeTime(row.updatedAt, language)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export default RecentChangesWidget
