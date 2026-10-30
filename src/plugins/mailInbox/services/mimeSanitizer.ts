/**
 * Zero-trust server-side email HTML sanitizer, remote-image/tracker shield, `cid:` inline image
 * rewriter, and plain-text reply / quoted-history splitter.
 *
 * Pure TypeScript with zero native or DOM dependencies so it executes identically inside Next.js
 * Server Components, Payload background workers, Vercel Serverless Functions, and Vitest.
 */

export type SanitizeEmailResult = {
  sanitizedHtml: string
  hasRemoteImages: boolean
  blockedRemoteImages: number
  resolvedCidCount: number
}

const DROP_WITH_CONTENT_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'style',
  'head',
  'title',
  'noscript',
  'template',
  'form',
  'textarea',
  'select',
  'button',
])

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'caption',
  'center',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'main',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col'])

const GLOBAL_ALLOWED_ATTRS = new Set(['title', 'dir', 'lang', 'align', 'valign'])

const TAG_ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'name']),
  img: new Set(['src', 'alt', 'width', 'height']),
  table: new Set(['width', 'border', 'cellpadding', 'cellspacing', 'role']),
  td: new Set(['width', 'height', 'colspan', 'rowspan', 'bgcolor']),
  th: new Set(['width', 'height', 'colspan', 'rowspan', 'bgcolor', 'scope']),
  tr: new Set(['bgcolor']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  ol: new Set(['start', 'type']),
  blockquote: new Set(['cite']),
}

const SAFE_CSS_PROPERTIES = new Set([
  'background',
  'background-color',
  'border',
  'border-bottom',
  'border-collapse',
  'border-color',
  'border-left',
  'border-radius',
  'border-right',
  'border-spacing',
  'border-style',
  'border-top',
  'border-width',
  'color',
  'display',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-type',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  ' table-layout',
  'table-layout',
  'text-align',
  'text-decoration',
  'text-indent',
  'text-transform',
  'vertical-align',
  'white-space',
  'width',
  'word-break',
  'word-wrap',
])

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeMinimalEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/&#(\d+);?/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&amp;/gi, '&')
}

function sanitizeHref(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('#')) return trimmed

  const normalizedProbe = decodeMinimalEntities(trimmed)
    .replace(/[\u0000-\u0020]+/g, '')
    .toLowerCase()

  if (
    normalizedProbe.startsWith('https://') ||
    normalizedProbe.startsWith('http://') ||
    normalizedProbe.startsWith('mailto:') ||
    normalizedProbe.startsWith('tel:')
  ) {
    return trimmed
  }
  return null
}

function sanitizeInlineStyle(rawStyle: string): string {
  const declarations = rawStyle.split(';')
  const kept: string[] = []

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx <= 0) continue
    const prop = decl.slice(0, colonIdx).trim().toLowerCase()
    const val = decl.slice(colonIdx + 1).trim()
    if (!SAFE_CSS_PROPERTIES.has(prop) || !val) continue

    const probe = decodeMinimalEntities(val).toLowerCase()
    if (
      probe.includes('url(') ||
      probe.includes('expression(') ||
      probe.includes('javascript:') ||
      probe.includes('vbscript:') ||
      probe.includes('data:') ||
      probe.includes('-moz-binding') ||
      probe.includes('behavior:') ||
      probe.includes('@import')
    ) {
      continue
    }

    if (prop === 'display') {
      const safeDisplay = new Set([
        'block',
        'inline',
        'inline-block',
        'flex',
        'inline-flex',
        'table',
        'table-row',
        'table-cell',
        'none',
      ])
      if (!safeDisplay.has(probe)) continue
    }

    kept.push(`${prop}: ${val.replace(/[<>"]/g, '')}`)
  }

  return kept.join('; ')
}

function parseAttributes(attrSource: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const attrRegex =
    /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(attrSource)) !== null) {
    const name = match[1].toLowerCase()
    const val = match[2] ?? match[3] ?? match[4] ?? ''
    if (!attrs.has(name)) {
      attrs.set(name, val)
    }
  }
  return attrs
}

function normalizeCidKey(raw: string): string {
  return raw
    .trim()
    .replace(/^cid:/i, '')
    .replace(/^<|>$/g, '')
    .trim()
}

function isLikelyTrackingPixel(attrs: Map<string, string>, cleanStyle: string): boolean {
  const w = attrs.get('width')?.trim()
  const h = attrs.get('height')?.trim()
  if ((w === '1' || w === '0') && (h === '1' || h === '0')) return true
  if (/width\s*:\s*[01](?:px)?\b/i.test(cleanStyle) && /height\s*:\s*[01](?:px)?\b/i.test(cleanStyle)) {
    return true
  }
  return false
}

/**
 * Sanitizes untrusted inbound/outbound email HTML:
 * 1. Strips `<script>`, `<iframe>`, `<svg>`, `<form>`, `<style>`, `<meta>`, `<base>`, comments, and `on*` handlers.
 * 2. Rewrites `src="cid:..."` to authenticated `/api/mail-attachments/file/...` URLs when present in `cidUrlMap`.
 * 3. Shields external `http(s)://` images into `data-remote-src="..."` (blocking 1x1 open-tracking pixels by default).
 * 4. Enforces `target="_blank" rel="noopener noreferrer nofollow"` on links.
 */
export function sanitizeEmailHtml(
  rawHtml: string | null | undefined,
  options?: {
    cidUrlMap?: ReadonlyMap<string, string> | Record<string, string>
    allowRemoteImages?: boolean
  },
): SanitizeEmailResult {
  const source = String(rawHtml ?? '')
  if (!source.trim()) {
    return {
      sanitizedHtml: '',
      hasRemoteImages: false,
      blockedRemoteImages: 0,
      resolvedCidCount: 0,
    }
  }

  const cidLookup = new Map<string, string>()
  if (options?.cidUrlMap) {
    const entries =
      options.cidUrlMap instanceof Map
        ? Array.from(options.cidUrlMap.entries())
        : Object.entries(options.cidUrlMap)
    for (const [key, url] of entries) {
      const norm = normalizeCidKey(key)
      if (norm && url) cidLookup.set(norm, url)
    }
  }

  // Strip HTML comments & DOCTYPE / XML declarations first.
  let working = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')

  // Remove dangerous container elements alongside their inner content.
  for (const blockedTag of DROP_WITH_CONTENT_TAGS) {
    const pairedRe = new RegExp(`<${blockedTag}\\b[^>]*>[\\s\\S]*?<\\/${blockedTag}\\s*>`, 'gi')
    const unclosedRe = new RegExp(`<${blockedTag}\\b[^>]*\\/?>`, 'gi')
    working = working.replace(pairedRe, '').replace(unclosedRe, '')
  }

  let hasRemoteImages = false
  let blockedRemoteImages = 0
  let resolvedCidCount = 0

  const scanNextHtmlTag = (
    str: string,
    fromIdx: number,
  ): {
    start: number
    end: number
    isClosing: boolean
    tagName: string
    attrPart: string
  } | null => {
    const len = str.length
    let lt = str.indexOf('<', fromIdx)
    while (lt !== -1 && lt + 1 < len) {
      let pos = lt + 1
      let isClosing = false
      if (str[pos] === '/') {
        isClosing = true
        pos += 1
      }
      const firstCh = str[pos]
      if (!firstCh || !/[A-Za-z]/.test(firstCh)) {
        lt = str.indexOf('<', lt + 1)
        continue
      }
      const nameStart = pos
      while (pos < len && /[A-Za-z0-9:-]/.test(str[pos])) {
        pos += 1
      }
      const tagName = str.slice(nameStart, pos).toLowerCase()
      const attrStart = pos
      let quote: '"' | "'" | null = null
      while (pos < len) {
        const ch = str[pos]
        if (quote) {
          if (ch === quote) quote = null
          pos += 1
          continue
        }
        if (ch === '"' || ch === "'") {
          quote = ch
          pos += 1
          continue
        }
        if (ch === '>') {
          let attrEnd = pos
          if (!isClosing && str[pos - 1] === '/') {
            attrEnd = pos - 1
          }
          return {
            start: lt,
            end: pos + 1,
            isClosing,
            tagName,
            attrPart: str.slice(attrStart, attrEnd),
          }
        }
        pos += 1
      }
      return null
    }
    return null
  }

  let output = ''
  let lastIndex = 0
  let scanned = scanNextHtmlTag(working, 0)

  while (scanned !== null) {
    if (scanned.start > lastIndex) {
      output += escapeHtml(decodeMinimalEntities(working.slice(lastIndex, scanned.start)))
    }
    lastIndex = scanned.end

    const { tagName, attrPart, isClosing } = scanned
    scanned = scanNextHtmlTag(working, lastIndex)

    // Unwrap structural shell tags cleanly while keeping their inner body text/content.
    if (tagName === 'html' || tagName === 'body') {
      continue
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      continue
    }

    if (isClosing) {
      if (!VOID_TAGS.has(tagName)) {
        output += `</${tagName}>`
      }
      continue
    }

    const rawAttrs = parseAttributes(attrPart)
    const allowedForTag = TAG_ALLOWED_ATTRS[tagName]
    const serializedAttrs: string[] = []

    const rawStyle = rawAttrs.get('style')
    const cleanStyle = rawStyle ? sanitizeInlineStyle(rawStyle) : ''

    if (tagName === 'a') {
      const safeHref = sanitizeHref(rawAttrs.get('href') ?? '')
      if (safeHref) {
        serializedAttrs.push(`href="${escapeHtml(safeHref)}"`)
        serializedAttrs.push('target="_blank"')
        serializedAttrs.push('rel="noopener noreferrer nofollow"')
      }
    } else if (tagName === 'img') {
      const rawSrc = (rawAttrs.get('src') ?? '').trim()
      const probe = decodeMinimalEntities(rawSrc)
        .replace(/[\u0000-\u0020]+/g, '')
        .toLowerCase()

      if (probe.startsWith('cid:')) {
        const cidKey = normalizeCidKey(rawSrc)
        const mappedUrl = cidLookup.get(cidKey)
        if (mappedUrl) {
          serializedAttrs.push(`src="${escapeHtml(mappedUrl)}"`)
          resolvedCidCount += 1
        } else {
          // Unknown CID attachment: omit broken img tag cleanly.
          continue
        }
      } else if (probe.startsWith('https://') || probe.startsWith('http://')) {
        hasRemoteImages = true
        const tracker = isLikelyTrackingPixel(rawAttrs, cleanStyle)
        if (options?.allowRemoteImages && !tracker) {
          serializedAttrs.push(`src="${escapeHtml(rawSrc)}"`)
          serializedAttrs.push('referrerpolicy="no-referrer"')
          serializedAttrs.push('loading="lazy"')
        } else {
          blockedRemoteImages += 1
          serializedAttrs.push(`data-remote-src="${escapeHtml(rawSrc)}"`)
          if (tracker) {
            serializedAttrs.push('data-tracker-pixel="true"')
          }
        }
      } else if (
        probe.startsWith('/api/mail-attachments/file/') ||
        /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(rawSrc)
      ) {
        serializedAttrs.push(`src="${escapeHtml(rawSrc)}"`)
      } else {
        continue
      }
    }

    for (const [attrName, attrVal] of rawAttrs.entries()) {
      if (attrName.startsWith('on') || attrName === 'style' || attrName === 'href' || attrName === 'src') {
        continue
      }
      if (!GLOBAL_ALLOWED_ATTRS.has(attrName) && !allowedForTag?.has(attrName)) {
        continue
      }
      if ((attrName === 'width' || attrName === 'height') && !/^\d{1,4}%?$/.test(attrVal.trim())) {
        continue
      }
      serializedAttrs.push(`${attrName}="${escapeHtml(attrVal)}"`)
    }

    if (cleanStyle) {
      serializedAttrs.push(`style="${escapeHtml(cleanStyle)}"`)
    }

    const attrSuffix = serializedAttrs.length > 0 ? ` ${serializedAttrs.join(' ')}` : ''
    output += VOID_TAGS.has(tagName) ? `<${tagName}${attrSuffix} />` : `<${tagName}${attrSuffix}>`
  }

  if (lastIndex < working.length) {
    output += escapeHtml(decodeMinimalEntities(working.slice(lastIndex)))
  }

  return {
    sanitizedHtml: output.trim(),
    hasRemoteImages,
    blockedRemoteImages,
    resolvedCidCount,
  }
}

/** Converts blocked `data-remote-src` attributes into live `src` attributes on user opt-in (still skipping 1x1 pixels). */
export function revealRemoteImagesInSanitizedHtml(sanitizedHtml: string): string {
  return sanitizedHtml.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    if (/data-tracker-pixel="true"/i.test(attrs)) {
      return ''
    }
    if (!/data-remote-src="/i.test(attrs)) {
      return full
    }
    const revealed = attrs.replace(
      /\bdata-remote-src="([^"]+)"/i,
      'src="$1" referrerpolicy="no-referrer" loading="lazy"',
    )
    return `<img${revealed}>`
  })
}

/** Converts plain-text email content into safe, linkified HTML paragraphs. */
export function renderPlainTextToHtml(plainText: string | null | undefined): string {
  const normalized = String(plainText ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const escaped = escapeHtml(normalized)
  const linkified = escaped.replace(
    /\b(https?:\/\/[^\s<>"']+)/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
  )

  return linkified
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

/** Extracts plain text from HTML when a sender sends `text/html` without `text/plain`. */
export function extractPlainTextFromHtml(html: string | null | undefined): string {
  const raw = String(html ?? '')
  if (!raw.trim()) return ''

  return decodeMinimalEntities(
    raw
      .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const QUOTE_HEADER_PATTERNS: readonly RegExp[] = [
  /^On .+wrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}$/im,
  /^-{2,}\s*Forwarded message\s*-{2,}$/im,
  /^From:\s+.+\nSent:\s+.+/im,
]

/**
 * Splits a plain-text email into `{ visibleReplyText, quotedHistoryText, snippet }` so the Inbox
 * thread reader can fold quoted history cleanly behind a `···` toggle.
 */
export function splitVisibleReplyAndQuotedHistory(
  plainText: string | null | undefined,
  fallbackHtml?: string | null,
): {
  fullPlainText: string
  visibleReplyText: string
  quotedHistoryText: string
  snippet: string
} {
  const fullPlainText = (
    String(plainText ?? '').trim() || extractPlainTextFromHtml(fallbackHtml)
  ).replace(/\r\n/g, '\n')

  if (!fullPlainText) {
    return {
      fullPlainText: '',
      visibleReplyText: '',
      quotedHistoryText: '',
      snippet: '',
    }
  }

  let splitIdx = -1
  for (const pattern of QUOTE_HEADER_PATTERNS) {
    const match = pattern.exec(fullPlainText)
    if (match && match.index > 0 && (splitIdx === -1 || match.index < splitIdx)) {
      splitIdx = match.index
    }
  }

  let visibleReplyText = fullPlainText
  let quotedHistoryText = ''

  if (splitIdx > 0) {
    visibleReplyText = fullPlainText.slice(0, splitIdx).trim()
    quotedHistoryText = fullPlainText.slice(splitIdx).trim()
  } else {
    const lines = fullPlainText.split('\n')
    let trailingQuoteStart = lines.length
    while (
      trailingQuoteStart > 0 &&
      (lines[trailingQuoteStart - 1].trim().startsWith('>') ||
        lines[trailingQuoteStart - 1].trim() === '')
    ) {
      trailingQuoteStart -= 1
    }
    const quotedSlice = lines.slice(trailingQuoteStart).join('\n').trim()
    const visibleSlice = lines.slice(0, trailingQuoteStart).join('\n').trim()
    if (visibleSlice && quotedSlice.startsWith('>')) {
      visibleReplyText = visibleSlice
      quotedHistoryText = quotedSlice
    }
  }

  const snippetSource = visibleReplyText || fullPlainText
  const snippet = snippetSource.replace(/\s+/g, ' ').trim().slice(0, 180)

  return {
    fullPlainText,
    visibleReplyText,
    quotedHistoryText,
    snippet,
  }
}
