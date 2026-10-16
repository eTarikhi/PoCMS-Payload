import Link from 'next/link'

import type { ArticleItem } from '@/app/(frontend)/lib/types'
import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

import { CoverImage } from '../ui/CoverImage'

export type ArticlesSectionProps = {
  articles: ArticleItem[]
  locale: Locale
}

export function ArticlesSection({ articles, locale }: ArticlesSectionProps) {
  const messages = getMessages(locale)

  return (
    <section id="article">
      <div className="container-xxl py-5">
        <div className="row g-5">
          <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
            <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
              <div className="col-lg-6">
                <h2 className="display-6 mb-0">{messages.articles.latestArticles}</h2>
              </div>
              <div className="col-lg-6 text-lg-end">
                <Link
                  className="btn btn-primary py-3 px-5"
                  target="_blank"
                  href="https://www.linkedin.com/in/etarikhi/recent-activity/articles/"
                >
                  {messages.articles.allArticles}
                </Link>
              </div>
            </div>
            <div className="row gy-1 gx-4 align-items-center">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} locale={locale} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ArticleCard({ article, locale }: { article: ArticleItem; locale: Locale }) {
  const messages = getMessages(locale)

  return (
    <article className="col-lg-4 col-md-6">
      <div className="service-item rounded h-100 p-1 my-2 wow fadeInUp">
        <Link href={article.link} target="_blank" rel="noopener noreferrer" className="">
          <div className="rounded overflow-hidden">
            <CoverImage
              src={article.imageUrl}
              alt={article.title}
              fallbackSrc="/placeholder.svg"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              width={400}
              height={255}
              className="img-fluid"
            />
          </div>
          <div className="p-2">
            <h3 className="h5 my-2 article-title">{article.title}</h3>
            <p className="article-text">{article.excerpt}</p>
          </div>
        </Link>
        <div className="px-4 pb-4 mt-auto">
          <p className="text-xs text-muted-foreground">
            {messages.articles.issued}: {article.author} • {article.readTime}{' '}
            {messages.article.read}
          </p>
          {article.pagePath ? (
            <Link href={article.pagePath} className="small">
              {messages.articles.readOnSite}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
