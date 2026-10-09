/**
 * Payload data source for the portfolio site.
 *
 * This is the only module in `src/app/(frontend)/lib` that talks to Payload at runtime.
 * It uses the Local API from React Server Components, as recommended by the Payload 3
 * docs (`getPayload({ config })` with `@payload-config`).
 *
 * Query contract (see docs/migration/02 §4):
 * - Lists use `pagination: false`. Otherwise Payload returns only 10 documents.
 * - Every query has an explicit `sort`. Collection `defaultSort` values are ascending.
 * - `depth` is explicit, so uploads resolve to Media objects and nothing else is populated.
 * - No request-scoped APIs (`headers()`, `cookies()`, `payload.auth()`) are used,
 *   so callers can cache the result.
 */

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Article } from '@/payload-types'

import { mapPortfolioContent, type RawPortfolioDocs } from './mappers'
import type { PortfolioContent } from './types'

/** Fetches the raw Payload documents needed by the home page. */
export const fetchRawPortfolioDocs = async (): Promise<RawPortfolioDocs> => {
  const payload = await getPayload({ config: configPromise })

  const [
    header,
    about,
    skills,
    experiences,
    educations,
    certificates,
    articles,
    services,
    projects,
    footer,
  ] = await Promise.all([
    payload.find({ collection: 'header', limit: 1, depth: 1 }).then((res) => res.docs[0] ?? null),
    payload.find({ collection: 'about', limit: 1, depth: 1 }).then((res) => res.docs[0] ?? null),
    payload
      .find({ collection: 'skills', pagination: false, sort: 'order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'experiences', pagination: false, sort: 'order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'educations', pagination: false, sort: 'order', depth: 0 })
      .then((res) => res.docs),
    // Ascending by issue date, which matches the original site.
    payload
      .find({ collection: 'certificates', pagination: false, sort: 'issuedAt', depth: 1 })
      .then((res) => res.docs),
    // Newest first, which matches the original site.
    payload
      .find({ collection: 'articles', pagination: false, sort: '-publishedAt', depth: 1 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'services', pagination: false, sort: 'order', depth: 0 })
      .then((res) => res.docs),
    payload
      .find({ collection: 'projects', pagination: false, sort: 'order', depth: 1 })
      .then((res) => res.docs),
    // Errors propagate on purpose. A database failure must not render an empty footer silently.
    payload.findGlobal({ slug: 'footer', depth: 1 }),
  ])

  return {
    header,
    about,
    skills,
    experiences,
    educations,
    certificates,
    articles,
    services,
    projects,
    footer,
  }
}

/** Returns the home-page view model. Not cached here; Set 6 adds the cache wrapper. */
export const getPortfolioContent = async (): Promise<PortfolioContent> => {
  return mapPortfolioContent(await fetchRawPortfolioDocs())
}

/**
 * Fetches one article by slug, for the article page (article page spec §5.1).
 * Returns null when no article has that slug. `depth: 1` resolves the cover image to a Media object.
 */
export const fetchArticleBySlug = async (slug: string): Promise<Article | null> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return res.docs[0] ?? null
}

/**
 * Returns the slugs of articles that have a page: a slug, and a non-empty body (`description`).
 * Used by `generateStaticParams`. Articles without a body only link out, so they get no page.
 */
export const fetchPublishedArticleSlugs = async (): Promise<string[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    pagination: false,
    depth: 0,
    sort: 'publishedAt',
  })
  return res.docs
    .filter((doc) => Boolean(doc.slug) && (doc.description ?? '').trim().length > 0)
    .map((doc) => doc.slug as string)
}
