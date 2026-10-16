import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

type ArticleMetaProps = {
  locale: Locale
  publishedAt: string | null
  publishedDisplay: string
  readTimeDisplay: string
}

export function ArticleMeta({
  locale,
  publishedAt,
  publishedDisplay,
  readTimeDisplay,
}: ArticleMetaProps) {
  const messages = getMessages(locale)

  if (!publishedDisplay && !readTimeDisplay) return null

  return (
    <p className="article-meta">
      {publishedDisplay ? (
        <time dateTime={publishedAt ?? undefined}>{publishedDisplay}</time>
      ) : null}
      {publishedDisplay && readTimeDisplay ? <span aria-hidden="true"> • </span> : null}
      {readTimeDisplay ? (
        <span>
          {readTimeDisplay} {messages.article.read}
        </span>
      ) : null}
    </p>
  )
}
