import type { ArticleDetail } from '../../lib/article-mappers'
import { ArticleBody } from './ArticleBody'
import { ArticleCover } from './ArticleCover'
import { ArticleFooterNav } from './ArticleFooterNav'
import { ArticleHeader } from './ArticleHeader'
import { ReadingProgress } from './ReadingProgress'

// The article, in reading order (article page spec §5.2). The text column is 68ch wide (§8).
// The article page composes this inside SiteChrome, so navigation and footer are not repeated here.
export function ArticleLayout({ article }: { article: ArticleDetail }) {
  return (
    <>
      <ReadingProgress />
      <article className="article-layout">
        <ArticleHeader
          title={article.title}
          excerpt={article.excerpt}
          category={article.category}
          publishedAt={article.publishedAt}
          publishedDisplay={article.publishedDisplay}
          readTimeDisplay={article.readTimeDisplay}
        />
        {article.coverUrl ? <ArticleCover src={article.coverUrl} alt={article.coverAlt} /> : null}
        <ArticleBody paragraphs={article.paragraphs} />
        <ArticleFooterNav externalLink={article.externalLink} />
      </article>
    </>
  )
}
