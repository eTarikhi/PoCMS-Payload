import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

import { ArticleMeta } from './ArticleMeta'

type ArticleHeaderProps = {
  category: 'articles' | 'others' | null
  excerpt: string
  locale: Locale
  publishedAt: string | null
  publishedDisplay: string
  readTimeDisplay: string
  title: string
}

export function ArticleHeader({
  title,
  excerpt,
  category,
  locale,
  publishedAt,
  publishedDisplay,
  readTimeDisplay,
}: ArticleHeaderProps) {
  const messages = getMessages(locale)
  const categoryLabel =
    category === 'articles'
      ? messages.article.categoryArticles
      : category === 'others'
        ? messages.article.categoryOther
        : null

  return (
    <header className="article-header">
      {categoryLabel ? <p className="article-category">{categoryLabel}</p> : null}
      <h1 className="article-title">{title}</h1>
      {excerpt ? <p className="article-excerpt">{excerpt}</p> : null}
      <ArticleMeta
        publishedAt={publishedAt}
        publishedDisplay={publishedDisplay}
        readTimeDisplay={readTimeDisplay}
        locale={locale}
      />
    </header>
  )
}
