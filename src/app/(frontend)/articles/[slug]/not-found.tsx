import '../../styles/article.css'
import { ArticleNotFoundContent } from '../../components/article/ArticleNotFoundContent'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'

// Shown when an article slug does not exist, or the article has no page (article page spec §5.1).
// It uses the same shared shell and the article styles, so navigation and footer stay the same.
export default async function ArticleNotFound() {
  const content = await getCachedPortfolioContent()

  return (
    <SiteChrome footer={content.footer} name={content.header?.sureName}>
      <ArticleNotFoundContent />
    </SiteChrome>
  )
}
