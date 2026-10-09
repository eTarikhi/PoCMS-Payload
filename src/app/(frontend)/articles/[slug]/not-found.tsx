import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'

// Shown when an article slug does not exist, or the article has no page (article page spec §5.1).
// It uses the same shared shell and the article styles, so navigation and footer stay the same.
export default async function ArticleNotFound() {
  const content = await getCachedPortfolioContent()

  return (
    <SiteChrome footer={content.footer}>
      <main id="main-content" className="article-page article-not-found">
        <h1 className="article-title">Article not found</h1>
        <p className="article-excerpt">This article does not exist, or it has no page on this site.</p>
        <Link href="/#article" className="article-cta">
          Back to articles
        </Link>
      </main>
    </SiteChrome>
  )
}
