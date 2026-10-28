'use client'

import { useId, useState } from 'react'

import type { HighlightedCodeLine } from '@/app/(frontend)/lib/shiki'

import { CopyCodeButton } from './CopyCodeButton'

export type PreparedCodeTab = {
  id: string
  label: string
  langLabel: string
  rawCode: string
  lines: HighlightedCodeLine[]
}

type CodeTabsClientProps = {
  title?: string | null
  tabs: PreparedCodeTab[]
}

export function CodeTabsClient({ title, tabs }: CodeTabsClientProps) {
  const baseId = useId()
  const [activeIndex, setActiveIndex] = useState(0)
  const safeIndex = activeIndex < tabs.length ? activeIndex : 0
  const activeTab = tabs[safeIndex]

  if (!activeTab) return null

  return (
    <figure className="rich-code-block rich-code-tabs">
      <div className="rich-code-header rich-code-tabs-header">
        <div className="rich-code-tabs-bar" role="tablist" aria-label={title || 'Code files'}>
          {tabs.map((tab, idx) => {
            const selected = idx === safeIndex
            return (
              <button
                key={tab.id}
                id={`${baseId}-tab-${idx}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${idx}`}
                className={`rich-code-tab-btn${selected ? ' is-active' : ''}`}
                onClick={() => setActiveIndex(idx)}
              >
                <span>{tab.label}</span>
                <span className="rich-code-tab-lang">{tab.langLabel}</span>
              </button>
            )
          })}
        </div>
        <div className="rich-code-tabs-actions">
          {title ? <span className="rich-code-group-title">{title}</span> : null}
          <CopyCodeButton code={activeTab.rawCode} />
        </div>
      </div>

      <div
        id={`${baseId}-panel-${safeIndex}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${safeIndex}`}
      >
        <pre className="rich-code-pre">
          <code className="rich-code-lines">
            {activeTab.lines.map((line) => {
              const classes = ['rich-code-line']
              if (line.isHighlighted) classes.push('rich-code-line--highlighted')
              if (line.diffKind === 'add') classes.push('rich-code-line--diff-add')
              if (line.diffKind === 'del') classes.push('rich-code-line--diff-del')

              return (
                <span key={line.lineNumber} className={classes.join(' ')}>
                  <span className="rich-code-line-num" aria-hidden="true">
                    {line.lineNumber}
                  </span>
                  <span className="rich-code-line-content">
                    {line.tokens.map((tok, tokIdx) => (
                      <span
                        key={tokIdx}
                        style={
                          tok.color || tok.fontStyle
                            ? {
                                ...(tok.color ? { color: tok.color } : {}),
                                ...(tok.fontStyle && tok.fontStyle & 1
                                  ? { fontStyle: 'italic' }
                                  : {}),
                                ...(tok.fontStyle && tok.fontStyle & 2 ? { fontWeight: 600 } : {}),
                              }
                            : undefined
                        }
                      >
                        {tok.content}
                      </span>
                    ))}
                  </span>
                </span>
              )
            })}
          </code>
        </pre>
      </div>
    </figure>
  )
}
