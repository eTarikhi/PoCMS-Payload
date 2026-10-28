import { slugify } from './slug'

/**
 * Pure, framework-free helpers for Payload's serialized Lexical state:
 * - detecting whether a rich-text field actually has visible content (`hasLexicalContent`),
 * - extracting plain text across paragraphs, headings, lists, tables, and custom blocks (`extractLexicalText`),
 * - computing reading time in minutes (`calculateReadTimeMinutes`),
 * - building a deduplicated Table of Contents (`extractTableOfContents`) with deterministic heading IDs,
 * - building Lexical JSON from structured blocks/sections (`buildLexicalDocument`, `plainTextToLexical`).
 *
 * No Payload or React runtime imports, so mappers, hooks, seeds, and unit tests can share this module.
 */

export type TocItem = {
  id: string
  text: string
  level: 2 | 3 | 4
}

export type LexicalNodeLike = {
  type?: string
  tag?: string
  text?: string
  format?: number | string
  fields?: Record<string, unknown>
  value?: unknown
  children?: LexicalNodeLike[]
  [key: string]: unknown
}

export type LexicalStateLike = {
  root?: {
    type?: string
    children?: LexicalNodeLike[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

const DEFAULT_WORDS_PER_MINUTE = 200

/** Extracts plain text from a single Lexical node (excluding block wrapper Chrome, including readable text). */
export const extractNodePlainText = (node: LexicalNodeLike | null | undefined): string => {
  if (!node || typeof node !== 'object') return ''

  if (typeof node.text === 'string') {
    return node.text
  }

  if (node.type === 'linebreak') {
    return '\n'
  }

  if (node.type === 'block' || node.type === 'inlineBlock') {
    const fields = node.fields ?? {}
    const blockType = typeof fields.blockType === 'string' ? fields.blockType : ''

    if (blockType === 'code' || blockType === 'Code') {
      const filename = typeof fields.filename === 'string' ? fields.filename : ''
      const code = typeof fields.code === 'string' ? fields.code : ''
      return [filename, code].filter(Boolean).join('\n')
    }

    if (blockType === 'callout') {
      const title = typeof fields.title === 'string' ? fields.title : ''
      const content = typeof fields.content === 'string' ? fields.content : ''
      return [title, content].filter(Boolean).join('\n')
    }

    if (blockType === 'mediaBlock') {
      return typeof fields.caption === 'string' ? fields.caption : ''
    }

    if (blockType === 'metrics') {
      const heading = typeof fields.heading === 'string' ? fields.heading : ''
      const items = Array.isArray(fields.items)
        ? fields.items.flatMap((raw) => {
            if (!raw || typeof raw !== 'object') return []
            const item = raw as Record<string, unknown>
            return [item.value, item.label, item.context].filter(
              (v): v is string => typeof v === 'string' && v.trim() !== '',
            )
          })
        : []
      return [heading, ...items].filter(Boolean).join(' ')
    }

    if (blockType === 'diagram') {
      const title = typeof fields.title === 'string' ? fields.title : ''
      const caption = typeof fields.caption === 'string' ? fields.caption : ''
      const code = typeof fields.code === 'string' ? fields.code : ''
      return [title, caption, code].filter(Boolean).join('\n')
    }

    if (blockType === 'codeTabs') {
      const title = typeof fields.title === 'string' ? fields.title : ''
      const tabs = Array.isArray(fields.tabs)
        ? fields.tabs.flatMap((raw) => {
            if (!raw || typeof raw !== 'object') return []
            const tab = raw as Record<string, unknown>
            return [tab.label, tab.code].filter(
              (v): v is string => typeof v === 'string' && v.trim() !== '',
            )
          })
        : []
      return [title, ...tabs].filter(Boolean).join('\n')
    }

    return Object.values(fields)
      .filter((v): v is string => typeof v === 'string' && v !== blockType)
      .join(' ')
  }

  if (Array.isArray(node.children) && node.children.length > 0) {
    const separator =
      node.type === 'root' ||
      node.type === 'list' ||
      node.type === 'table' ||
      node.type === 'tablerow'
        ? '\n'
        : ''
    return node.children.map((child) => extractNodePlainText(child)).join(separator)
  }

  return ''
}

/** Extracts plain text from an entire serialized Lexical editor state. */
export const extractLexicalText = (state: unknown): string => {
  if (!state || typeof state !== 'object') return ''
  const root = (state as LexicalStateLike).root
  if (!root || !Array.isArray(root.children)) return ''
  return root.children
    .map((child) => extractNodePlainText(child).trim())
    .filter((chunk) => chunk.length > 0)
    .join('\n\n')
}

const nodeHasVisibleContent = (node: LexicalNodeLike | null | undefined): boolean => {
  if (!node || typeof node !== 'object') return false
  if (typeof node.text === 'string' && node.text.trim().length > 0) return true
  if (node.type === 'upload') return true
  if (node.type === 'block' || node.type === 'inlineBlock') {
    const fields = node.fields ?? {}
    const blockType = typeof fields.blockType === 'string' ? fields.blockType : ''
    if (blockType === 'mediaBlock') {
      return Boolean(fields.media) || (typeof fields.imageUrl === 'string' && fields.imageUrl.trim().length > 0)
    }
    if (blockType === 'code' || blockType === 'Code') {
      return typeof fields.code === 'string' && fields.code.trim().length > 0
    }
    if (blockType === 'callout') {
      return (
        (typeof fields.content === 'string' && fields.content.trim().length > 0) ||
        (typeof fields.title === 'string' && fields.title.trim().length > 0)
      )
    }
    return true
  }
  if (Array.isArray(node.children)) {
    return node.children.some((child) => nodeHasVisibleContent(child))
  }
  return false
}

/**
 * Returns `true` when a Lexical editor state contains actual readable text, media, or custom blocks.
 * Empty editor scaffolds (e.g. `{ root: { children: [{ type: 'paragraph', children: [] }] } }`) return `false`.
 */
export const hasLexicalContent = (state: unknown): boolean => {
  if (!state || typeof state !== 'object') return false
  const root = (state as LexicalStateLike).root
  if (!root || !Array.isArray(root.children)) return false
  return root.children.some((child) => nodeHasVisibleContent(child))
}

/** Counts words across prose and code tokens. */
export const countWords = (text: string): number => {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

/**
 * Calculates reading time in minutes (minimum 1 minute when body text exists).
 * Returns `fallbackReadTime ?? null` when neither `content` nor `description` has body text.
 */
export const calculateReadTimeMinutes = (
  input: {
    content?: unknown
    description?: string | null
    fallbackReadTime?: number | null
  },
  wordsPerMinute: number = DEFAULT_WORDS_PER_MINUTE,
): number | null => {
  const lexicalText = extractLexicalText(input.content)
  const plainDescription = (input.description ?? '').trim()
  const combined = lexicalText.length > 0 ? lexicalText : plainDescription

  const words = countWords(combined)
  if (words === 0) {
    return typeof input.fallbackReadTime === 'number' && input.fallbackReadTime >= 1
      ? Math.round(input.fallbackReadTime)
      : null
  }

  return Math.max(1, Math.ceil(words / Math.max(1, wordsPerMinute)))
}

/**
 * Stateful tracker that turns heading text into unique anchor IDs (`architecture`, `architecture-2`, ...).
 * Used identically by `extractTableOfContents` and `<RichTextContent />` so ToC links match DOM `id`s.
 */
export const createHeadingIdTracker = (): ((text: string) => string) => {
  const counts = new Map<string, number>()
  return (text: string): string => {
    const base = slugify(text)
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen + 1}`
  }
}

const headingLevel = (tag: string | undefined): 2 | 3 | 4 | null => {
  if (tag === 'h2') return 2
  if (tag === 'h3') return 3
  if (tag === 'h4') return 4
  return null
}

/**
 * Walks top-level (and nested) Lexical heading nodes (`h2`, `h3`, `h4`) in document order
 * and builds the Table of Contents.
 */
export const extractTableOfContents = (state: unknown): TocItem[] => {
  if (!state || typeof state !== 'object') return []
  const root = (state as LexicalStateLike).root
  if (!root || !Array.isArray(root.children)) return []

  const nextId = createHeadingIdTracker()
  const items: TocItem[] = []

  const visit = (nodes: LexicalNodeLike[]) => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        const level = headingLevel(node.tag)
        const text = extractNodePlainText(node).replace(/\s+/g, ' ').trim()
        if (level && text.length > 0) {
          items.push({
            id: nextId(text),
            text,
            level,
          })
        }
      } else if (Array.isArray(node.children)) {
        visit(node.children)
      }
    }
  }

  visit(root.children)
  return items
}

/* -------------------------------------------------------------------------------------------- */
/* Lexical document builders (for seed data, tests, and plain-text fallback conversion)         */
/* -------------------------------------------------------------------------------------------- */

export const lexicalTextNode = (text: string, format: number = 0) => ({
  detail: 0,
  format,
  mode: 'normal' as const,
  style: '',
  text,
  type: 'text' as const,
  version: 1,
})

export const lexicalParagraphNode = (children: Array<Record<string, unknown>>) => ({
  children,
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  type: 'paragraph' as const,
  version: 1,
  textFormat: 0,
  textStyle: '',
})

export const lexicalHeadingNode = (tag: 'h2' | 'h3' | 'h4', text: string) => ({
  children: [lexicalTextNode(text)],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  tag,
  type: 'heading' as const,
  version: 1,
})

export const lexicalBulletListNode = (items: string[]) => ({
  children: items.map((item, index) => ({
    children: [lexicalTextNode(item)],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'listitem' as const,
    value: index + 1,
    version: 1,
  })),
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  listType: 'bullet' as const,
  start: 1,
  tag: 'ul' as const,
  type: 'list' as const,
  version: 1,
})

export const lexicalBlockNode = (fields: Record<string, unknown> & { blockType: string }) => ({
  format: '' as const,
  type: 'block' as const,
  version: 2,
  fields,
})

export const buildLexicalDocument = (children: Array<Record<string, unknown>>) => ({
  root: {
    children,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root' as const,
    version: 1,
  },
})

/** Converts a blank-line-separated plain-text string into a valid serialized Lexical document. */
export const plainTextToLexical = (text: string) => {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)

  return buildLexicalDocument(
    paragraphs.map((paragraph) => lexicalParagraphNode([lexicalTextNode(paragraph)])),
  )
}
