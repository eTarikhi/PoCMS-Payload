import Link from 'next/link'

import { localizePath, type Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

type ArticleFooterNavProps = {
  externalLink: string | null
  locale: Locale
}

export function ArticleFooterNav({ externalLink, locale }: ArticleFooterNavProps) {
  const messages = getMessages(locale)

  return (
    <div className="article-footer-nav">
      <Link href={`${localizePath(locale)}#article`}>{messages.article.backToArticles}</Link>
      {externalLink ? (
        <a href={externalLink} target="_blank" rel="noopener noreferrer">
          {messages.article.originallyPublishedAt}
        </a>
      ) : null}
    </div>
  )
}
