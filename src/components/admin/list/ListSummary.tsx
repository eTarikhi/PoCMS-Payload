import type { BeforeListTableServerProps, CollectionSlug } from 'payload'
import React from 'react'

import { daysAgoISO, relativeTime } from '../dashboard/lib'
import { cn } from '../lib/utils'
import { countWithAccess, SUMMARY_FACTS } from './summaryFacts'

const RECENT_DAYS = 30

/**
 * `beforeListTable` on every collection (adminUIPlugin): a one-line summary above the table, with
 * the total, recent edits, the last edit and collection-specific facts (summaryFacts.ts). Server
 * rendered, no client JavaScript. Counts ignore the current search and filters.
 */
export async function ListSummary({
  collectionSlug,
  payload,
  user,
  i18n,
}: BeforeListTableServerProps) {
  const slug = collectionSlug as CollectionSlug
  const req = { payload, user }
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
    </section>
  )
}

export default ListSummary
