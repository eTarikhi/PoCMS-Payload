/**
 * Payload data source for the portfolio site.
 *
 * This is the only module in `src/app/(frontend)/lib` that talks to Payload at runtime. It uses
 * the Local API from React Server Components. Every public query is explicit about its locale, so
 * a Persian response cannot accidentally populate an English cache entry.
 */

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Article } from '@/payload-types'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

import { mapPortfolioContent, type RawPortfolioDocs } from './mappers'
import type { PortfolioContent } from './types'

const localeQuery = (locale: Locale) => ({
  fallbackLocale: locale === DEFAULT_LOCALE ? (false as const) : DEFAULT_LOCALE,
  locale,
})

/** Fetches the raw Payload documents needed by the home page in one requested locale. */
export const fetchRawPortfolioDocs = async (
  locale: Locale = DEFAULT_LOCALE,
): Promise<RawPortfolioDocs> => {
  const payload = await getPayload({ config: configPromise })
  const localization = localeQuery(locale)

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
    payload
      .find({ collection: 'header', limit: 1, depth: 1, ...localization })
      .then((res) => res.docs[0] ?? null),
    payload
      .find({ collection: 'about', limit: 1, depth: 1, ...localization })
      .then((res) => res.docs[0] ?? null),
    payload
      .find({ collection: 'skills', pagination: false, sort: 'order', depth: 0, ...localization })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'experiences',
        pagination: false,
        sort: 'order',
        depth: 0,
        ...localization,
      })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'educations',
        pagination: false,
        sort: 'order',
        depth: 0,
        ...localization,
      })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'certificates',
        pagination: false,
        sort: 'issuedAt',
        depth: 1,
        ...localization,
      })
      .then((res) => res.docs),
    payload
      .find({
        collection: 'articles',
        pagination: false,
        sort: '-publishedAt',
        depth: 1,
        ...localization,
      })
      .then((res) => res.docs),
    payload
      .find({ collection: 'services', pagination: false, sort: 'order', depth: 0, ...localization })
      .then((res) => res.docs),
    payload
      .find({ collection: 'projects', pagination: false, sort: 'order', depth: 1, ...localization })
      .then((res) => res.docs),
    // Errors propagate on purpose. A database failure must not render an empty footer silently.
    payload.findGlobal({ slug: 'footer', depth: 1, ...localization }),
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

/** Returns the home-page view model for the requested public locale. */
export const getPortfolioContent = async (
  locale: Locale = DEFAULT_LOCALE,
): Promise<PortfolioContent> => mapPortfolioContent(await fetchRawPortfolioDocs(locale), locale)

/** Fetches one article by stable slug in the requested locale. */
export const fetchArticleBySlug = async (
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Article | null> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    ...localeQuery(locale),
  })
  return res.docs[0] ?? null
}

/**
 * Returns the slugs of articles that have a page in the requested locale. Articles without a body
 * only link out, so they get no page.
 */
export const fetchPublishedArticleSlugs = async (
  locale: Locale = DEFAULT_LOCALE,
): Promise<string[]> => {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'articles',
    pagination: false,
    depth: 0,
    sort: 'publishedAt',
    ...localeQuery(locale),
  })
  return res.docs
    .filter((doc) => Boolean(doc.slug) && (doc.description ?? '').trim().length > 0)
    .map((doc) => doc.slug as string)
}
