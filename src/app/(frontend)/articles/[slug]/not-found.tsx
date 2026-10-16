import Link from 'next/link'

import { SiteChrome } from '@/app/(frontend)/components/layout/SiteChrome'
import { getCachedPortfolioContent } from '@/app/(frontend)/lib/cache'
import { DEFAULT_LOCALE, localizePath } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

export default async function ArticleNotFound() {
  const locale = DEFAULT_LOCALE
  const [content] = await Promise.all([getCachedPortfolioContent(locale)])
  const messages = getMessages(locale)

  return (
    <SiteChrome currentPath="/articles" footer={content.footer} locale={locale}>
      <main id="main-content" className="article-page article-not-found">
        <h1 className="article-title">{messages.notFound.title}</h1>
        <p className="article-excerpt">{messages.notFound.body}</p>
        <Link href={`${localizePath(locale)}#article`} className="article-cta">
          {messages.article.backToArticles}
        </Link>
      </main>
    </SiteChrome>
  )
}
