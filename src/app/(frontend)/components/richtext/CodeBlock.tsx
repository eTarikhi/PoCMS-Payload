import {
  type HighlightedCodeLine,
  LANGUAGE_LABELS,
  tokenizeCodeLines,
} from '@/app/(frontend)/lib/shiki'

import { CopyCodeButton } from './CopyCodeButton'

type CodeBlockProps = {
  code: string
  language?: string | null
  filename?: string | null
  highlightLines?: string | null
}

export function ShikiTokenLines({ lines }: { lines: HighlightedCodeLine[] }) {
  return (
    <pre className="rich-code-pre">
      <code className="rich-code-lines">
        {lines.map((line) => {
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
                            ...(tok.fontStyle && tok.fontStyle & 1 ? { fontStyle: 'italic' } : {}),
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
  )
}

export function CodeBlock({ code, language, filename, highlightLines }: CodeBlockProps) {
  const normalizedLang = (language || 'plain').toLowerCase()
  const langLabel = LANGUAGE_LABELS[normalizedLang] ?? normalizedLang
  const lines = tokenizeCodeLines(code, normalizedLang, highlightLines)

  return (
    <figure className="rich-code-block">
      <div className="rich-code-header">
        <div className="rich-code-meta">
          {filename ? <span className="rich-code-filename">{filename}</span> : null}
          <span className="rich-code-lang">{langLabel}</span>
        </div>
        <CopyCodeButton code={code} />
      </div>
      <ShikiTokenLines lines={lines} />
    </figure>
  )
}
