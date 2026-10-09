import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'

// Shown when an article slug does not exist, or the article has no page (article page spec §5.1).
// It uses the same shared shell as every other page, so navigation and footer stay the same.
export default async function ArticleNotFound() {
  const content = await getCachedPortfolioContent()

  return (
    <SiteChrome footer={content.footer}>
      <main id="main-content" className="container-xxl py-5 text-center">
        <h1 className="display-5 mb-4">Article not found</h1>
        <p className="mb-5">This article does not exist, or it has no page on this site.</p>
        <Link href="/#article" className="btn btn-primary py-3 px-5">
          Back to articles
        </Link>
      </main>
    </SiteChrome>
  )
}
