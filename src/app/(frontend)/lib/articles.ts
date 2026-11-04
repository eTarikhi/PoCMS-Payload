import { unstable_cache } from 'next/cache'

import { mapArticleDetail, type ArticleDetail } from './article-mappers'
import { fetchArticleBySlug, fetchPublishedArticleSlugs } from './payload-source'
import { articleCacheTag, CACHE_TAGS, PORTFOLIO_CACHE_TAG } from './revalidate'

/**
 * Published article page data cached under granular tags (`portfolio`, `portfolio:articles`, `article:{slug}`).
 */
export const getCachedArticleBySlug = (slug: string): Promise<ArticleDetail | null> =>
  unstable_cache(
    async () => {
      const doc = await fetchArticleBySlug(slug, { draft: false })
      return doc ? mapArticleDetail(doc) : null
    },
    ['portfolio-article-v4', slug],
    { tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.articles, articleCacheTag(slug)] },
  )()

/**
 * Uncached draft-aware reader used exclusively when Next.js `draftMode()` is enabled.
 */
export const getDraftArticleBySlug = async (slug: string): Promise<ArticleDetail | null> => {
  const doc = await fetchArticleBySlug(slug, { draft: true })
  return doc ? mapArticleDetail(doc) : null
}

/** The slugs of every published article that has an on-site page. Used by `generateStaticParams`. */
export const getCachedArticleSlugs = (): Promise<string[]> =>
  unstable_cache(() => fetchPublishedArticleSlugs(), ['portfolio-article-slugs-v2'], {
    tags: [PORTFOLIO_CACHE_TAG, CACHE_TAGS.articles],
  })()
