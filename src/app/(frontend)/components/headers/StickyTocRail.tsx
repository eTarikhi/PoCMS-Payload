'use client'

import { useEffect, useState } from 'react'

import type { TocItem } from '@/app/(frontend)/lib/lexical'

type StickyTocRailProps = {
  items?: TocItem[]
  heading?: string
}

export function StickyTocRail({ items, heading = 'On this page' }: StickyTocRailProps) {
  const [activeId, setActiveId] = useState<string | null>(items?.[0]?.id ?? null)

  useEffect(() => {
    if (!items || items.length === 0 || typeof IntersectionObserver === 'undefined') return

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-96px 0px -68% 0px',
        threshold: [0, 1],
      },
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [items])

  if (!items || items.length === 0) return null

  return (
    <nav className="pocms-sticky-toc-card" aria-label="Table of contents">
      <p className="pocms-sticky-toc-card__title">{heading}</p>
      <ol className="pocms-toc-spy-list">
        {items.map((item) => {
          const active = activeId === item.id
          return (
            <li
              key={item.id}
              className={`pocms-toc-spy-item pocms-toc-spy-item--lvl${item.level}${
                active ? ' is-active' : ''
              }`}
            >
              <a href={`#${item.id}`} onClick={() => setActiveId(item.id)}>
                {item.text}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function MobileTocDrawer({ items, heading = 'Jump to section' }: StickyTocRailProps) {
  if (!items || items.length === 0) return null

  return (
    <div className="pocms-mobile-toc" role="region" aria-label="Mobile section outline">
      <details>
        <summary>
          {heading} ({items.length})
        </summary>
        <ol className="pocms-toc-spy-list mt-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`pocms-toc-spy-item pocms-toc-spy-item--lvl${item.level}`}
            >
              <a href={`#${item.id}`}>{item.text}</a>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
