import Link from 'next/link'
import type { ArticleDetail } from '../../lib/article-mappers'
import type { ArticleItem } from '../../lib/types'
import { selectMoreWriting } from '../../lib/more-writing'

export function MoreWriting({
  articles,
  current,
}: {
  articles: ArticleItem[]
  current: ArticleDetail
}) {
  const suggestions = selectMoreWriting(articles, current)
  if (!suggestions.length) return null
  return (
    <section className="studio-more-writing" aria-labelledby="more-writing-heading">
      <p className="studio-eyebrow">Keep exploring</p>
      <h2 id="more-writing-heading">More field notes.</h2>
      <div>
        {suggestions.map((article) => (
          <article key={article.id}>
            <p className="studio-eyebrow">
              {article.author} · {article.readTime}
            </p>
            <h3>
              <Link href={article.pagePath || article.link}>{article.title} ↗</Link>
            </h3>
            <p>{article.excerpt}</p>
            <Link className="studio-text-link" href={article.pagePath || article.link}>
              {article.pagePath ? 'Read on this site' : 'Read original publication'} ↗
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
