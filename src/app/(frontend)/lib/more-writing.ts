import type { ArticleDetail } from './article-mappers'
import type { ArticleItem } from './types'

/** Prefer the same CMS category, preserve source order, and never recommend the current article. */
export function selectMoreWriting(
  articles: ArticleItem[],
  current: Pick<ArticleDetail, 'id' | 'slug' | 'category' | 'externalLink'>,
  limit = 2,
): ArticleItem[] {
  const seen = new Set<string>()
  return articles
    .filter((article) => {
      const destination = article.pagePath || article.link
      if (
        !destination ||
        destination === '#' ||
        article.id === String(current.id) ||
        article.pagePath === `/articles/${current.slug}` ||
        (current.externalLink && article.link === current.externalLink) ||
        seen.has(destination)
      )
        return false
      seen.add(destination)
      return true
    })
    .sort(
      (a, b) =>
        Number(Boolean(current.category && b.category === current.category)) -
        Number(Boolean(current.category && a.category === current.category)),
    )
    .slice(0, Math.max(0, limit))
}
