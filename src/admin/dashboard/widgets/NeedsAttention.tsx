import type { WidgetServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import { ATTENTION_CHECKS, attentionListUrl } from '../../lib/content-attention'
import { canReadCollection } from '../../lib/permissions'
import '../dashboard-widgets.scss'

/**
 * Dashboard widget: content gaps worth fixing, with counts and links to
 * pre-filtered list views. All queries run server-side through the Local API
 * and respect the current user's access.
 */
export default async function NeedsAttention({ permissions, req, user }: WidgetServerProps) {
  const checks = ATTENTION_CHECKS.filter((check) =>
    canReadCollection(permissions, check.collection),
  )

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
                <Link href={attentionListUrl(item.collection, item.where)}>{item.label}</Link>
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
