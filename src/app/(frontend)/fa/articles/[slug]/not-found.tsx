import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { getMessages } from '@/i18n/messages'

const locale = 'fa' as const

export default async function PersianArticleNotFound() {
  const content = await getCachedPortfolioContent(locale)
  const messages = getMessages(locale)

  return (
    <SiteChrome currentPath="/articles" footer={content.footer} locale={locale}>
      <main id="main-content" className="article-page article-not-found">
        <h1 className="article-title">{messages.notFound.title}</h1>
        <p className="article-excerpt">{messages.notFound.body}</p>
        <Link href="/fa#article" className="article-cta">
          {messages.article.backToArticles}
        </Link>
      </main>
    </SiteChrome>
  )
}
