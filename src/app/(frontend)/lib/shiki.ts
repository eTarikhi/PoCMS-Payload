import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import bash from 'shiki/langs/bash.mjs'
import css from 'shiki/langs/css.mjs'
import diff from 'shiki/langs/diff.mjs'
import dockerfile from 'shiki/langs/dockerfile.mjs'
import go from 'shiki/langs/go.mjs'
import html from 'shiki/langs/html.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import json from 'shiki/langs/json.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import php from 'shiki/langs/php.mjs'
import python from 'shiki/langs/python.mjs'
import rust from 'shiki/langs/rust.mjs'
import sql from 'shiki/langs/sql.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import darkPlus from 'shiki/themes/dark-plus.mjs'

export type ShikiTokenSpan = {
  content: string
  color?: string
  fontStyle?: number
}

export type HighlightedCodeLine = {
  lineNumber: number
  isHighlighted: boolean
  diffKind: 'add' | 'del' | null
  tokens: ShikiTokenSpan[]
}

const LANGUAGE_MAP: Record<string, string> = {
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'jsx',
  php: 'php',
  sql: 'sql',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  markup: 'html',
  html: 'html',
  xml: 'html',
  css: 'css',
  python: 'python',
  py: 'python',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
  diff: 'diff',
}

export const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  jsx: 'JSX',
  php: 'PHP',
  sql: 'SQL',
  bash: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  markup: 'HTML',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  docker: 'Dockerfile',
  diff: 'Diff',
  plain: 'Text',
}

let highlighterSingleton: HighlighterCore | null = null

function getShikiHighlighter(): HighlighterCore {
  if (!highlighterSingleton) {
    highlighterSingleton = createHighlighterCoreSync({
      themes: [darkPlus],
      langs: [
        typescript,
        tsx,
        javascript,
        jsx,
        php,
        sql,
        bash,
        json,
        yaml,
        html,
        css,
        python,
        go,
        rust,
        dockerfile,
        diff,
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterSingleton
}

/**
 * Parses a human-friendly line range string such as `"1, 4-6, 12"` into 1-based line numbers.
 */
export function parseHighlightLineRange(spec?: string | null): Set<number> {
  const result = new Set<number>()
  if (!spec || typeof spec !== 'string') return result

  for (const part of spec.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed)
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10)
      const end = Number.parseInt(rangeMatch[2], 10)
      const lo = Math.max(1, Math.min(start, end))
      const hi = Math.min(lo + 500, Math.max(start, end))
      for (let line = lo; line <= hi; line++) {
        result.add(line)
      }
      continue
    }
    if (/^\d+$/.test(trimmed)) {
      const num = Number.parseInt(trimmed, 10)
      if (num >= 1) result.add(num)
    }
  }
  return result
}

function detectDiffKind(rawLine: string, normalizedLang: string | null): 'add' | 'del' | null {
  if (normalizedLang !== 'diff') return null
  if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) return 'add'
  if (rawLine.startsWith('-') && !rawLine.startsWith('---')) return 'del'
  return null
}

/**
 * Synchronously tokenizes source code with Shiki's JS RegExp engine (zero WASM, SSR + client safe).
 * Falls back cleanly to plain uncolored lines when `language` is `'plain'` or unrecognized.
 */
export function tokenizeCodeLines(
  code: string,
  language?: string | null,
  highlightLinesSpec?: string | null,
): HighlightedCodeLine[] {
  const normalizedInput = code.replace(/\r\n/g, '\n').replace(/\n$/, '')
  const rawLines = normalizedInput.split('\n')
  const highlightedSet = parseHighlightLineRange(highlightLinesSpec)
  const key = (language ?? 'plain').trim().toLowerCase()
  const shikiLang = LANGUAGE_MAP[key] ?? null

  if (!shikiLang || normalizedInput.length === 0) {
    return rawLines.map((line, idx) => ({
      lineNumber: idx + 1,
      isHighlighted: highlightedSet.has(idx + 1),
      diffKind: detectDiffKind(line, shikiLang),
      tokens: [{ content: line || ' ' }],
    }))
  }

  try {
    const highlighter = getShikiHighlighter()
    const { tokens } = highlighter.codeToTokens(normalizedInput, {
      lang: shikiLang,
      theme: 'dark-plus',
    })

    return tokens.map((lineTokens, idx) => {
      const rawLine = rawLines[idx] ?? ''
      return {
        lineNumber: idx + 1,
        isHighlighted: highlightedSet.has(idx + 1),
        diffKind: detectDiffKind(rawLine, shikiLang),
        tokens:
          lineTokens.length > 0
            ? lineTokens.map((tok) => ({
                content: tok.content,
                color: tok.color,
                fontStyle: tok.fontStyle,
              }))
            : [{ content: ' ' }],
      }
    })
  } catch {
    return rawLines.map((line, idx) => ({
      lineNumber: idx + 1,
      isHighlighted: highlightedSet.has(idx + 1),
      diffKind: detectDiffKind(line, shikiLang),
      tokens: [{ content: line || ' ' }],
    }))
  }
}
