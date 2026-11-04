import Link from 'next/link'

import { ARTICLES_HUB_PATH } from '@/app/(frontend)/lib/article-page'
import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'

export type ArticleFooterNavLabels = {
  backToArticlesLabel: string
  externalPublicationLabel: string
}

type ArticleFooterNavProps = {
  externalLink: string | null
  labels?: ArticleFooterNavLabels
}

const DEFAULT_FOOTER_NAV_LABELS: ArticleFooterNavLabels = {
  backToArticlesLabel: DEFAULT_SITE_SETTINGS.articlesSection.backToArticlesLabel,
  externalPublicationLabel: DEFAULT_SITE_SETTINGS.articlesSection.externalPublicationLabel,
}

export function ArticleFooterNav({
  externalLink,
  labels = DEFAULT_FOOTER_NAV_LABELS,
}: ArticleFooterNavProps) {
  return (
    <div className="article-footer-nav">
      <Link href={ARTICLES_HUB_PATH}>{labels.backToArticlesLabel}</Link>
      {externalLink ? (
        <a href={externalLink} target="_blank" rel="noopener noreferrer">
          {labels.externalPublicationLabel}
        </a>
      ) : null}
    </div>
  )
}
