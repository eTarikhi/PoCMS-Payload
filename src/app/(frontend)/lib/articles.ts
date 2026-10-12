import { unstable_cache } from 'next/cache'

import { fetchArticleBySlug, fetchPublishedArticleSlugs } from './payload-source'
import { PORTFOLIO_CACHE_TAG } from './revalidate'
import type { Article } from '@/payload-types'

/**
 * One article's raw Payload document, cached under its own key and the shared `portfolio` tag
 * (article page spec §5.1, §6). Saving any content in /admin marks the tag stale, which refreshes
 * these entries too (D-A8). `depth: 1` resolves the cover image (see `fetchArticleBySlug`).
 *
 * The raw document is the input for `mapArticleDetail` (page view model, metadata, JSON-LD) and
 * the `initialData` for Live Preview on the article page.
 */
export const getCachedArticleDoc = (slug: string): Promise<Article | null> =>
  unstable_cache(
    async () => fetchArticleBySlug(slug),
    ['portfolio-article-doc', slug],
    { tags: [PORTFOLIO_CACHE_TAG] },
  )()

/** The slugs of every article that has a page. Used by `generateStaticParams`. */
export const getCachedArticleSlugs = (): Promise<string[]> =>
  unstable_cache(() => fetchPublishedArticleSlugs(), ['portfolio-article-slugs'], {
    tags: [PORTFOLIO_CACHE_TAG],
  })()
