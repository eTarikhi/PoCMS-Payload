// Plain-text body (D-A2 revised, §5.3). Paragraphs arrive already split by lib/article-page.ts.
// They are rendered as React text, so any markup in the source is escaped and shown as text.
type ArticleBodyProps = {
  paragraphs: string[]
}

export function ArticleBody({ paragraphs }: ArticleBodyProps) {
  const visible = paragraphs.filter((paragraph) => paragraph.trim().length > 0)

  return (
    <div className="article-body">
      {visible.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}
