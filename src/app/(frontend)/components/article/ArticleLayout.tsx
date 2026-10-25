import type { ArticleDetail } from '../../lib/article-mappers'
import { TableOfContents } from '../richtext/TableOfContents'
import { ArticleBody } from './ArticleBody'
import { ArticleCover } from './ArticleCover'
import { ArticleFooterNav, type ArticleFooterNavLabels } from './ArticleFooterNav'
import { ArticleHeader } from './ArticleHeader'
import { ReadingProgress } from './ReadingProgress'

export function ArticleLayout({
  article,
  labels,
}: {
  article: ArticleDetail
  labels?: ArticleFooterNavLabels
}) {
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
        <TableOfContents items={article.toc ?? []} />
        <ArticleBody content={article.content} paragraphs={article.paragraphs} />
        <ArticleFooterNav externalLink={article.externalLink} labels={labels} />
      </article>
    </>
  )
}
