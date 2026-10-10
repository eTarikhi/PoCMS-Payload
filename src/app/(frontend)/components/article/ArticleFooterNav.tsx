import Link from 'next/link'

// Back link and the original publication link (article page spec §5.2). A div, not a nav,
// so the page keeps one navigation (the shared one in SiteChrome).
type ArticleFooterNavProps = {
  externalLink: string | null
}

export function ArticleFooterNav({ externalLink }: ArticleFooterNavProps) {
  return (
    <div className="article-footer-nav">
      <Link href="/#article">Back to articles</Link>
      {externalLink ? (
        <a href={externalLink} target="_blank" rel="noopener noreferrer">
          Originally published at
        </a>
      ) : null}
    </div>
  )
}
