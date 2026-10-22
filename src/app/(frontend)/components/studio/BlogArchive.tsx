import Link from 'next/link'
import type { PortfolioContent } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'
import { StudioChrome } from './StudioChrome'

export function BlogArchive({ content }: { content: PortfolioContent }) {
  const articles = [...content.articles].sort(
    (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  )
  const [featured, ...recent] = articles
  return (
    <StudioChrome active="blog" footer={content.footer} name={content.header?.sureName}>
      <main id="main-content" tabIndex={-1} className="studio-container journal-blog">
        <header className="journal-page-heading">
          <p className="studio-eyebrow">The blog / Ideas in progress</p>
          <h1>
            Behind the code.
            <br />
            <em>Beyond the screen.</em>
          </h1>
          <p className="studio-lead">
            A journal of software, systems, and the things learned along the way.
          </p>
        </header>
        {featured ? (
          <section className="journal-feature" aria-labelledby="featured-note-heading">
            <Link className="journal-feature-image" href={featured.pagePath || featured.link}>
              <CoverImage
                src={featured.imageUrl}
                fallbackSrc="/placeholder.svg"
                alt={featured.title}
                width={1000}
                height={700}
                sizes="(max-width: 760px) 100vw, 60vw"
                priority
              />
            </Link>
            <div>
              <p className="studio-eyebrow">In focus / Featured reading</p>
              <p className="journal-note-meta">
                {featured.author} · {featured.readTime}
              </p>
              <h2 id="featured-note-heading">
                <Link href={featured.pagePath || featured.link}>{featured.title}</Link>
              </h2>
              <p>{featured.excerpt}</p>
              <Link className="studio-text-link" href={featured.pagePath || featured.link}>
                Read the story ↗
              </Link>
            </div>
          </section>
        ) : (
          <p className="studio-empty">New stories will appear here when published.</p>
        )}
        <section className="journal-latest" aria-labelledby="latest-heading">
          <div className="journal-section-top">
            <h2 id="latest-heading">From the journal</h2>
            <Link className="studio-text-link" href="/articles">
              Explore all articles ↗
            </Link>
          </div>
          <div className="journal-note-list">
            {recent.slice(0, 6).map((article, index) => (
              <article key={article.id}>
                <span className="journal-note-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className="studio-eyebrow">
                    {article.author} · {article.readTime}
                  </p>
                  <h3>
                    <Link href={article.pagePath || article.link}>{article.title} ↗</Link>
                  </h3>
                  <p>{article.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
          {!recent.length ? (
            <p className="studio-empty">
              More notes are on their way. Browse the archive for all published writing.
            </p>
          ) : null}
        </section>
      </main>
    </StudioChrome>
  )
}
