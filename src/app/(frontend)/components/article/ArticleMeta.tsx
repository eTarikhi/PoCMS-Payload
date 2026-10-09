// Date and read time row (article page spec §5.2). The text comes from lib/format.ts, so it matches the homepage.
type ArticleMetaProps = {
  publishedAt: string | null
  publishedDisplay: string
  readTimeDisplay: string
}

export function ArticleMeta({ publishedAt, publishedDisplay, readTimeDisplay }: ArticleMetaProps) {
  if (!publishedDisplay && !readTimeDisplay) return null

  return (
    <p className="article-meta">
      {publishedDisplay ? (
        <time dateTime={publishedAt ?? undefined}>{publishedDisplay}</time>
      ) : null}
      {publishedDisplay && readTimeDisplay ? <span aria-hidden="true"> • </span> : null}
      {readTimeDisplay ? <span>{readTimeDisplay} read</span> : null}
    </p>
  )
}
