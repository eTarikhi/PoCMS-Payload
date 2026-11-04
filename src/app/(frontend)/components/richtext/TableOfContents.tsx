import type { TocItem } from '@/app/(frontend)/lib/lexical'

export type TableOfContentsProps = {
  items: TocItem[]
  title?: string
}

export function TableOfContents({ items, title = 'On this page' }: TableOfContentsProps) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Table of contents" className="article-toc">
      <p className="article-toc-title">{title}</p>
      <ol className="article-toc-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`article-toc-item article-toc-level-${item.level}`}
          >
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
