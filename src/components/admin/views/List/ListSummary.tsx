import type { BeforeListTableServerProps, CollectionSlug } from 'payload'
import React from 'react'

import { can } from '@/access/permissions'
import { cn } from '@/components/admin/utilities/cn'
import { daysAgoISO, relativeTime } from '@/components/admin/utilities/dates'

import { countWithAccess, SUMMARY_FACTS } from './summaryFacts'

const RECENT_DAYS = 30

/**
 * `beforeListTable` on every collection (adminUIPlugin): a one-line summary above the table, with
 * the total, recent edits, the last edit, collection-specific facts (./summaryFacts.ts) and a link to
 * the trash when it holds documents; on the trash view, what can be done there. Server rendered, no
 * client JavaScript. Counts ignore the current search and filters.
 */
export async function ListSummary({
  collectionSlug,
  payload,
  user,
  i18n,
  params,
  viewType,
}: BeforeListTableServerProps) {
  const slug = collectionSlug as CollectionSlug
  const req = { payload, user }
  const trashEnabled = Boolean(payload.collections[slug]?.config.trash)
  const trashURL = `${payload.config.routes.admin}/collections/${slug}/trash`
  const inTrash = trashEnabled
    ? await countWithAccess(req, slug, { deletedAt: { exists: true } }, true)
    : null

  // Trash view: what is there and what can be done with it.
  // Payload 3.90 doesn't pass `viewType` to list slots; the route ends in /trash there.
  const segments = (params as { segments?: string[] } | undefined)?.segments
  if (viewType === 'trash' || segments?.at(-1) === 'trash') {
    return (
      <section
        aria-label="Summary"
        data-testid="list-summary"
        className="acn:mb-4 acn:text-sm acn:text-muted-foreground"
      >
        <strong className="acn:font-semibold acn:text-foreground">{inTrash ?? 0}</strong> in the
        trash.{' '}
        {can(user, slug, 'delete')
          ? 'Restore documents, or delete them permanently.'
          : 'Restore documents here; deleting permanently needs the Full access level.'}
      </section>
    )
  }
  const extra = SUMMARY_FACTS[slug] ?? []

  const [total, recent, latest, ...extraCounts] = await Promise.all([
    countWithAccess(req, slug),
    countWithAccess(req, slug, { updatedAt: { greater_than_equal: daysAgoISO(RECENT_DAYS) } }),
    payload.find({
      collection: slug,
      user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
      sort: '-updatedAt',
      select: { updatedAt: true },
      pagination: false,
    }),
    ...extra.map((fact) => countWithAccess(req, slug, fact.where)),
  ])
  if (!total) return null

  const lastEdit = (latest.docs[0] as { updatedAt?: string } | undefined)?.updatedAt
  const facts: { key: string; value: number | null; label: string; attention?: boolean }[] = [
    { key: 'total', value: total, label: 'in total' },
    { key: 'recent', value: recent, label: `edited in the last ${RECENT_DAYS} days` },
    ...extra.map((fact, index) => ({
      key: fact.label,
      value: extraCounts[index],
      label: fact.label,
      attention: fact.attention && (extraCounts[index] ?? 0) > 0,
    })),
  ].filter((fact) => fact.value !== null)

  return (
    <section
      aria-label="Summary"
      data-testid="list-summary"
      className="acn:mb-4 acn:flex acn:flex-wrap acn:items-center acn:gap-x-5 acn:gap-y-1 acn:text-sm acn:text-muted-foreground"
    >
      {facts.map((fact) => (
        <span key={fact.key} className={cn(fact.attention && 'acn:text-warning')}>
          <strong
            className={cn(
              'acn:font-semibold acn:text-foreground',
              fact.attention && 'acn:text-warning',
            )}
          >
            {fact.value}
          </strong>{' '}
          {fact.label}
        </span>
      ))}
      {lastEdit ? <span>Last edit {relativeTime(lastEdit, i18n.language)}</span> : null}
      {inTrash ? (
        <a
          href={trashURL}
          className="acn:text-muted-foreground acn:underline-offset-2 acn:hover:text-foreground"
        >
          {inTrash} in the trash
        </a>
      ) : null}
    </section>
  )
}

export default ListSummary
