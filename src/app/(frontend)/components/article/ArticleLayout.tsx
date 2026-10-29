import Link from 'next/link'

import { ARTICLES_HUB_PATH } from '@/app/(frontend)/lib/article-page'
import { DEFAULT_HEADER_STUDIO } from '@/app/(frontend)/lib/mappers'
import type { ArticleDetailHeaderConfig, ArticleItem } from '@/app/(frontend)/lib/types'
import type { ArticleDetail } from '../../lib/article-mappers'
import { DetailPageHeader } from '../headers/DetailPageHeader'
import { MobileTocDrawer, StickyTocRail } from '../headers/StickyTocRail'
import { TableOfContents } from '../richtext/TableOfContents'
import { ArticleBody } from './ArticleBody'
import { ArticleCover } from './ArticleCover'
import { ArticleFooterNav, type ArticleFooterNavLabels } from './ArticleFooterNav'
import { ArticleGallery } from './ArticleGallery'
import { ReadingProgress } from './ReadingProgress'

const CATEGORY_BADGES: Record<NonNullable<ArticleDetail['category']>, string> = {
  articles: 'Article',
  others: 'Engineering Note',
}

export type ArticleLayoutProps = {
  article: ArticleDetail
  labels?: ArticleFooterNavLabels
  headerConfig?: ArticleDetailHeaderConfig
  ownerName?: string
  featuredBadgeLabel?: string
  relatedArticles?: ArticleItem[]
}

export function ArticleLayout({
  article,
  labels,
  headerConfig,
  ownerName,
  featuredBadgeLabel = 'Featured',
  relatedArticles = [],
}: ArticleLayoutProps) {
  const effectiveHeader = headerConfig ?? DEFAULT_HEADER_STUDIO.articleDetail
  const tocItems = article.toc ?? []
  const hasStickyRail = effectiveHeader.showStickyToc && tocItems.length > 0

  const badges: string[] = []
  if (article.featured) badges.push(featuredBadgeLabel)
  if (article.category) badges.push(CATEGORY_BADGES[article.category])

  const showContinuation = effectiveHeader.showRelatedArticles && relatedArticles.length > 0

  return (
    <div className="pocms-subpage-shell">
      <ReadingProgress />

      <DetailPageHeader
        variant="article"
        eyebrow={effectiveHeader.eyebrow}
        badges={badges}
        title={article.title}
        excerpt={article.excerpt}
        coverUrl={article.coverUrl}
        backgroundPreset={effectiveHeader.backgroundPreset}
        accentTone={effectiveHeader.accentTone}
        showBreadcrumbs={effectiveHeader.showBreadcrumbs}
        showShareActions={effectiveHeader.showShareActions}
        hubLabel="Articles"
        hubHref={ARTICLES_HUB_PATH}
        backLabel="← All articles"
        ownerName={ownerName}
        publishedAt={article.publishedAt}
        publishedDisplay={article.publishedDisplay}
        readTimeDisplay={article.readTimeDisplay}
        externalUrl={article.externalLink}
        externalLabel={labels?.externalPublicationLabel ?? 'External post'}
        showSectionJumpDock={effectiveHeader.showSectionJumpDock}
        toc={tocItems}
      />

      <div className="pocms-inner-main">
        <div className="container-xxl px-4 px-lg-5">
          <div
            className={`pocms-reading-grid ${
              hasStickyRail ? 'pocms-reading-grid--with-rail' : 'pocms-reading-grid--single'
            }`}
          >
            <div className="pocms-reading-main">
              <article className="article-layout">
                {article.mediaMode === 'gallery' && (article.gallery?.length ?? 0) > 0 ? (
                  <ArticleGallery
                    slides={article.gallery ?? []}
                    layout={article.galleryLayout ?? 'carousel'}
                  />
                ) : article.mediaMode !== 'none' && article.coverUrl ? (
                  <ArticleCover
                    src={article.coverUrl}
                    alt={article.coverAlt}
                    blurDataURL={article.coverBlurDataURL}
                    objectPosition={article.coverObjectPosition}
                  />
                ) : null}

                {hasStickyRail ? (
                  <MobileTocDrawer items={tocItems} />
                ) : (
                  <TableOfContents items={tocItems} />
                )}

                <ArticleBody content={article.content} paragraphs={article.paragraphs} />
                <ArticleFooterNav externalLink={article.externalLink} labels={labels} />
              </article>
            </div>

            {hasStickyRail && (
              <aside className="pocms-reading-rail" aria-label="Reading navigation">
                <StickyTocRail items={tocItems} />
                <div className="pocms-sticky-toc-card">
                  <p className="pocms-sticky-toc-card__title">Quick Actions</p>
                  <div className="d-flex flex-column gap-2">
                    <a href="#main-content" className="pocms-utility-btn justify-content-between">
                      <span>Back to top</span>
                      <span aria-hidden="true">↑</span>
                    </a>
                    <Link
                      href={ARTICLES_HUB_PATH}
                      className="pocms-utility-btn justify-content-between"
                    >
                      <span>Explore archive</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </aside>
            )}
          </div>

          {showContinuation && (
            <section
              className="pocms-continuation mx-auto"
              style={{ maxWidth: '1140px' }}
              aria-label="Continue reading"
            >
              <div className="pocms-section-kicker">
                <h2 className="pocms-section-kicker__title">Continue Reading</h2>
                <Link href={ARTICLES_HUB_PATH} className="pocms-utility-btn">
                  View all articles →
                </Link>
              </div>
              <div className="row g-4">
                {relatedArticles.slice(0, 3).map((item) => {
                  const href = item.pagePath ?? (item.link || '#')
                  const internal = href.startsWith('/')
                  return (
                    <div key={item.id} className="col-md-4">
                      <Link
                        href={href}
                        {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="pocms-continuation-card"
                      >
                        <span className="small" style={{ color: 'var(--pocms-sand)' }}>
                          {item.author} • {item.readTime} read
                        </span>
                        <h3 className="pocms-continuation-card__title">{item.title}</h3>
                        <p className="small text-white-50 mb-0 mt-auto">{item.excerpt}</p>
                      </Link>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
