import { unstable_cache } from 'next/cache'

import { mapArticleDetail, type ArticleDetail } from './article-mappers'
import { fetchArticleBySlug, fetchPublishedArticleSlugs } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'

/**
 * One article's page data, cached under its own key and the shared `portfolio` tag (article page spec §5.1, §6).
 * Saving any content in /admin marks the tag stale, which refreshes these entries too (D-A8).
 * Returns null when there is no article with that slug, or it has no page (no body).
 */
export const getCachedArticleBySlug = (slug: string): Promise<ArticleDetail | null> =>
  unstable_cache(
    async () => {
      const doc = await fetchArticleBySlug(slug)
      return doc ? mapArticleDetail(doc) : null
    },
    ['portfolio-article', slug],
    { tags: [PORTFOLIO_CACHE_TAG] },
  )()

/** The slugs of every article that has a page. Used by `generateStaticParams`. */
export const getCachedArticleSlugs = (): Promise<string[]> =>
  unstable_cache(() => fetchPublishedArticleSlugs(), ['portfolio-article-slugs'], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()
