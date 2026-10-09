#!/usr/bin/env node
/**
 * One-time backfill for `articles.slug` (article page spec §3).
 *
 * Articles created before the slug field existed have no slug. This script gives each of them one,
 * made from its title by the same `slugify` and `withUniqueSuffix` the collection hook uses. Articles that
 * already have a slug are left alone, so the script is safe to re-run.
 *
 * Usage: pnpm backfill:article-slugs
 */

import 'dotenv/config.js'
import { getPayload } from 'payload'
import config from '../payload.config.js'
import { slugify, withUniqueSuffix } from '../app/(frontend)/lib/slug.js'

const run = async () => {
  if (!process.env.PAYLOAD_SECRET) {
    console.error('PAYLOAD_SECRET is not set. See README.md.')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    pagination: false,
    depth: 0,
    sort: 'publishedAt',
  })

  const missing = docs.filter((doc) => !doc.slug)
  console.log(`Articles: ${docs.length}. Without a slug: ${missing.length}.`)

  for (const doc of missing) {
    const base = slugify(doc.title)
    const slug = await withUniqueSuffix(base, async (candidate) => {
      const { docs: taken } = await payload.find({
        collection: 'articles',
        depth: 0,
        limit: 1,
        pagination: false,
        where: { and: [{ slug: { equals: candidate } }, { id: { not_equals: doc.id } }] },
      })
      return taken.length > 0
    })

    await payload.update({ collection: 'articles', id: doc.id, data: { slug } })
    console.log(`  ${doc.id}: ${slug}`)
  }

  console.log('Done.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
