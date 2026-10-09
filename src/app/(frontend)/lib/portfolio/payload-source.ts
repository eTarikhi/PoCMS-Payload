/**
 * Payload data source for the portfolio site.
 *
 * This is the only module in `src/app/(frontend)/lib/portfolio` that talks to Payload at runtime.
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
