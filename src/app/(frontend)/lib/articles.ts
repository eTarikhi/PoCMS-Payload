import { unstable_cache } from 'next/cache'

import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

import { mapArticleDetail, type ArticleDetail } from './article-mappers'
import { fetchArticleBySlug, fetchPublishedArticleSlugs } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'

/** Returns an article page model cached under both its stable slug and requested locale. */
export const getCachedArticleBySlug = (
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<ArticleDetail | null> =>
  unstable_cache(
    async () => {
      const doc = await fetchArticleBySlug(slug, locale)
      return doc ? mapArticleDetail(doc, locale) : null
    },
    ['portfolio-article', locale, slug],
    { tags: [PORTFOLIO_CACHE_TAG] },
  )()

/** The slugs of every article with a body in the requested locale. */
export const getCachedArticleSlugs = (locale: Locale = DEFAULT_LOCALE): Promise<string[]> =>
  unstable_cache(() => fetchPublishedArticleSlugs(locale), ['portfolio-article-slugs', locale], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()
