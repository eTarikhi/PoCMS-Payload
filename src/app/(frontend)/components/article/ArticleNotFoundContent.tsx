import Link from 'next/link'

export function ArticleNotFoundContent() {
  return (
    <main tabIndex={-1} id="main-content" className="article-page article-not-found">
      <p className="studio-eyebrow">404 / Missing field note</p>
      <h1 className="article-title">Article not found</h1>
      <p className="article-excerpt">
        This article does not exist, or it has no page on this site.
      </p>
      <Link href="/articles" className="article-cta">
        Back to articles
      </Link>
    </main>
  )
}
