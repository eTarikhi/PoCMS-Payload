import { ArticleMeta } from './ArticleMeta'

// Category badge, title, excerpt, and meta row (article page spec §5.2). Server component.
const CATEGORY_LABELS: Record<'articles' | 'others', string> = {
  articles: 'Articles',
  others: 'Others',
}

type ArticleHeaderProps = {
  title: string
  excerpt: string
  category: 'articles' | 'others' | null
  publishedAt: string | null
  publishedDisplay: string
  readTimeDisplay: string
}

export function ArticleHeader({
  title,
  excerpt,
  category,
  publishedAt,
  publishedDisplay,
  readTimeDisplay,
}: ArticleHeaderProps) {
  return (
    <header className="article-header">
      {category ? <p className="article-category">{CATEGORY_LABELS[category]}</p> : null}
      <h1 className="article-title">{title}</h1>
      {excerpt ? <p className="article-excerpt">{excerpt}</p> : null}
      <ArticleMeta
        publishedAt={publishedAt}
        publishedDisplay={publishedDisplay}
        readTimeDisplay={readTimeDisplay}
      />
    </header>
  )
}
