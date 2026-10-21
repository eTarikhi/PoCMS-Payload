'use client'

import { useRef } from 'react'
import Link from 'next/link'
import type { ArticleItem } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'
import { useArchiveQuery } from './useArchiveQuery'

export function WritingIndex({ articles }: { articles: ArticleItem[] }) {
  const { query, setQuery } = useArchiveQuery()
  const searchRef = useRef<HTMLInputElement>(null)
  const search = query.trim().toLocaleLowerCase()
  const matches = articles.filter((article) =>
    `${article.title} ${article.excerpt}`.toLocaleLowerCase().includes(search),
  )
  return (
    <>
      <div className="studio-search">
        <label htmlFor="writing-search">Search writing</label>
        <div>
          <input
            id="writing-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and topics…"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
            >
              Clear search
            </button>
          ) : null}
        </div>
        <p role="status">
          {matches.length} {matches.length === 1 ? 'article' : 'articles'}
          {search ? ' found' : ''}
        </p>
      </div>
      <div className="studio-writing studio-writing-archive">
        {matches.map((article) => (
          <article key={article.id}>
            <Link href={article.pagePath || article.link}>
              <CoverImage
                src={article.imageUrl}
                fallbackSrc="/placeholder.svg"
                alt=""
                width={600}
                height={380}
                sizes="(max-width: 700px) 100vw, 33vw"
              />
              <p className="studio-eyebrow">
                {article.author} · {article.readTime}
              </p>
              <h2>
                {article.title} <span aria-hidden="true">↗</span>
              </h2>
              <p>{article.excerpt}</p>
              <span className="studio-text-link">
                {article.pagePath ? 'Read article' : 'Read original publication'} ↗
              </span>
            </Link>
          </article>
        ))}
      </div>
      {!matches.length ? (
        <div className="studio-empty">
          <h2>{search ? 'No matching articles.' : 'A little quiet here, for now.'}</h2>
          <p>
            {search
              ? 'Try another title or topic, or clear your search.'
              : 'New field notes will appear here when published.'}
          </p>
        </div>
      ) : null}
    </>
  )
}
