import { stringify } from 'qs-esm'
import type { SanitizedPermissions, Where, WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import '../dashboard-widgets.scss'

type AttentionCheck = {
  collection: 'articles' | 'projects'
  collectionLabel: string
  label: string
  note: string
  where: Where
}

const CHECKS: AttentionCheck[] = [
  {
    collection: 'articles',
    collectionLabel: 'Articles',
    label: 'Articles without a cover image',
    note: 'Neither the image upload nor the image URL is set, so cards fall back to a placeholder.',
    where: { and: [{ image: { exists: false } }, { imageUrl: { exists: false } }] },
  },
  {
    collection: 'articles',
    collectionLabel: 'Articles',
    label: 'Articles without a reading time',
    note: 'The article meta line shows "min" only when this is filled in.',
    where: { or: [{ readTime: { exists: false } }, { readTime: { equals: null } }] },
  },
  {
    collection: 'projects',
    collectionLabel: 'Projects',
    label: 'Projects without any image',
    note: 'None of the image upload, image URL, or placeholder URL is set.',
    where: {
      and: [{ image: { exists: false } }, { src: { exists: false } }, { placeHolder: { exists: false } }],
    },
  },
  {
    collection: 'projects',
    collectionLabel: 'Projects',
    label: 'Projects without a live URL',
    note: 'The project card cannot link out to a live site or case study.',
    where: { or: [{ url: { exists: false } }, { url: { equals: null } }] },
  },
]

function canRead(permissions: SanitizedPermissions | undefined, collection: string): boolean {
  return Boolean(permissions?.collections?.[collection]?.read)
}

function listUrl(collection: string, where: Where): string {
  return `/admin/collections/${collection}?${stringify(
    { where },
    { encodeValuesOnly: true },
  )}`
}

/**
 * Dashboard widget: content gaps worth fixing, with counts and links to
 * pre-filtered list views. All queries run server-side through the Local API
 * and respect the current user's access.
 */
export default async function NeedsAttention({ permissions, req, user }: WidgetServerProps) {
  const checks = CHECKS.filter((check) => canRead(permissions, check.collection))

  const results = await Promise.all(
    checks.map(async (check) => {
      const { totalDocs } = await req.payload.count({
        collection: check.collection,
        overrideAccess: false,
        req,
        user,
        where: check.where,
      })
      return { ...check, totalDocs }
    }),
  )

  const pending = results.filter((result) => result.totalDocs > 0)

  return (
    <div className="pocms-widget">
      <div className="pocms-widget__header">
        <h3 className="pocms-widget__title">Needs attention</h3>
        <span className="pocms-widget__hint">Content gaps</span>
      </div>
      {checks.length === 0 ? (
        <p className="pocms-empty">Nothing to review for your account.</p>
      ) : pending.length === 0 ? (
        <p className="pocms-empty">All clear — no content gaps detected.</p>
      ) : (
        <ul className="pocms-links">
          {pending.map((item) => (
            <li key={item.label} className="pocms-links__item">
              <span>
                <Link href={listUrl(item.collection, item.where)}>{item.label}</Link>
                <br />
                <small style={{ opacity: 0.7 }}>{item.note}</small>
              </span>
              <span className="pocms-links__meta">
                <strong>{item.totalDocs}</strong>
                <span>{item.collectionLabel}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
