'use client'

import { useState } from 'react'
import { Highlight, themes } from 'prism-react-renderer'

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  jsx: 'JSX',
  php: 'PHP',
  sql: 'SQL',
  bash: 'Bash',
  json: 'JSON',
  yaml: 'YAML',
  markup: 'HTML',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  docker: 'Dockerfile',
  plain: 'Text',
  plaintext: 'Text',
}

export type CodeBlockProps = {
  code: string
  language?: string | null
  filename?: string | null
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const normalizedLang = (language ?? 'typescript').trim().toLowerCase() || 'plain'
  const label = LANGUAGE_LABELS[normalizedLang] ?? normalizedLang.toUpperCase()
  const trimmedCode = code.replace(/\n$/, '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trimmedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API unavailable in non-secure / headless contexts.
    }
  }

  return (
    <div className="rich-code" data-language={normalizedLang}>
      <div className="rich-code-header">
        <div className="rich-code-meta">
          <span className="rich-code-lang">{label}</span>
          {filename ? <span className="rich-code-filename">{filename}</span> : null}
        </div>
        <button
          type="button"
          className="rich-code-copy"
          onClick={handleCopy}
          aria-label={copied ? 'Copied code to clipboard' : 'Copy code to clipboard'}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <Highlight theme={themes.vsDark} code={trimmedCode} language={normalizedLang}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} rich-code-pre`} style={style}>
            <code>
              {tokens.map((line, lineIndex) => (
                <div key={lineIndex} {...getLineProps({ line })} className="rich-code-line">
                  <span className="rich-code-line-no" aria-hidden="true">
                    {lineIndex + 1}
                  </span>
                  <span className="rich-code-line-text">
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  )
}
