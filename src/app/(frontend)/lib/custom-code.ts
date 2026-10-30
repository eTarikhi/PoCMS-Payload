/**
 * Isomorphic custom code parser, sanitizer, scope matcher, and mapper for the `custom-code` Global.
 * Zero Payload or Node.js runtime imports so both Server and Client Components can import safely.
 */

export type CustomCodeScope = 'all' | 'inner' | 'home' | 'articles' | 'projects' | 'contact'

export type CustomMetaAttributeType = 'name' | 'property' | 'http-equiv'

export type CustomScriptStrategy = 'afterInteractive' | 'lazyOnload'

export type CustomMetaTagItem = {
  id: string
  enabled: boolean
  attribute: CustomMetaAttributeType
  key: string
  content: string
  scope: CustomCodeScope
}

export type CustomLinkTagItem = {
  id: string
  enabled: boolean
  rel: string
  href: string
  as?: string
  type?: string
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  scope: CustomCodeScope
}

export type CustomHeadCodeBlock = {
  enabled: boolean
  scope: CustomCodeScope
  html: string
}

export type CustomCssBlock = {
  enabled: boolean
  scope: CustomCodeScope
  css: string
}

export type CustomAfterFooterBlock = {
  enabled: boolean
  scope: CustomCodeScope
  html: string
  js: string
}

export type CustomBodyStartBlock = {
  enabled: boolean
  scope: CustomCodeScope
  html: string
}

export type CustomBodyEndBlock = {
  enabled: boolean
  scope: CustomCodeScope
  strategy: CustomScriptStrategy
  html: string
  js: string
}

export type CustomCodeContent = {
  enabled: boolean
  skipInPreview: boolean
  metaTags: CustomMetaTagItem[]
  linkTags: CustomLinkTagItem[]
  headCode: CustomHeadCodeBlock
  customCss: CustomCssBlock
  afterFooter: CustomAfterFooterBlock
  bodyStart: CustomBodyStartBlock
  bodyEnd: CustomBodyEndBlock
}

export const DEFAULT_CUSTOM_CODE: CustomCodeContent = {
  enabled: true,
  skipInPreview: true,
  metaTags: [],
  linkTags: [],
  headCode: { enabled: true, scope: 'all', html: '' },
  customCss: { enabled: true, scope: 'all', css: '' },
  afterFooter: { enabled: true, scope: 'all', html: '', js: '' },
  bodyStart: { enabled: true, scope: 'all', html: '' },
  bodyEnd: { enabled: true, scope: 'all', strategy: 'afterInteractive', html: '', js: '' },
}

const VALID_SCOPES: ReadonlySet<CustomCodeScope> = new Set([
  'all',
  'inner',
  'home',
  'articles',
  'projects',
  'contact',
])

const UNSAFE_PROTOCOL_RE = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i
const META_KEY_SAFE_RE = /^[A-Za-z0-9_.:-]+$/
const ATTR_NAME_SAFE_RE = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/

const REACT_ATTR_MAP: Record<string, string> = {
  charset: 'charSet',
  class: 'className',
  crossorigin: 'crossOrigin',
  fetchpriority: 'fetchPriority',
  hreflang: 'hrefLang',
  'http-equiv': 'httpEquiv',
  httpequiv: 'httpEquiv',
  imagesizes: 'imageSizes',
  imagesrcset: 'imageSrcSet',
  nomodule: 'noModule',
  referrerpolicy: 'referrerPolicy',
}

const BOOLEAN_HTML_ATTRS: ReadonlySet<string> = new Set([
  'async',
  'defer',
  'noModule',
  'nomodule',
])

export function isCustomCodeEmergencyDisabled(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): boolean {
  return (
    env.DISABLE_CUSTOM_CODE_INJECTION === 'true' ||
    env.NEXT_PUBLIC_DISABLE_CUSTOM_CODE === 'true'
  )
}

export function normalizeScope(value: unknown): CustomCodeScope {
  if (typeof value === 'string' && VALID_SCOPES.has(value as CustomCodeScope)) {
    return value as CustomCodeScope
  }
  return 'all'
}

export function normalizePathname(pathname: string | null | undefined): string {
  const raw = (pathname ?? '/').trim()
  if (!raw || raw === '/') return '/'
  const withoutQuery = raw.split(/[?#]/, 1)[0] || '/'
  if (withoutQuery === '/') return '/'
  return withoutQuery.replace(/\/+$/, '') || '/'
}

export function matchesCustomCodeScope(
  scope: CustomCodeScope,
  pathname: string | null | undefined,
): boolean {
  if (scope === 'all') return true
  const path = normalizePathname(pathname)
  switch (scope) {
    case 'home':
      return path === '/'
    case 'inner':
      return path !== '/'
    case 'articles':
      return path === '/articles' || path.startsWith('/articles/')
    case 'projects':
      return path === '/projects' || path.startsWith('/projects/')
    case 'contact':
      return path === '/contact' || path.startsWith('/contact/')
    default:
      return true
  }
}

export function stableSnippetHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

/**
 * Strips accidental outer `<style>` wrappers and escapes any embedded `</style` sequence
 * so CSS content can never break out of a `<style>` element into raw HTML.
 */
export function sanitizeStyleContent(rawCss: string | null | undefined): string {
  if (typeof rawCss !== 'string') return ''
  let trimmed = rawCss.trim()
  if (!trimmed) return ''

  trimmed = trimmed
    .replace(/^<style\b[^>]*>/i, '')
    .replace(/<\/style>\s*$/i, '')
    .trim()

  if (!trimmed) return ''
  return trimmed.replace(/<\/style/gi, '\\3c /style')
}

export function sanitizeInlineScriptContent(rawJs: string | null | undefined): string {
  if (typeof rawJs !== 'string') return ''
  const trimmed = rawJs.trim()
  if (!trimmed) return ''
  return trimmed.replace(/<\/script/gi, '<\\/script')
}

export type ParsedReactAttributes = Record<string, string | boolean>

export function parseHtmlAttributes(
  attrSource: string,
  options?: { allowDataAndAria?: boolean },
): ParsedReactAttributes {
  const attrs: ParsedReactAttributes = {}
  const allowDataAndAria = options?.allowDataAndAria ?? true
  const attrRegex =
    /([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(attrSource)) !== null) {
    const rawName = match[1]
    if (!rawName || !ATTR_NAME_SAFE_RE.test(rawName)) continue

    const lower = rawName.toLowerCase()
    // Block inline DOM event handlers on parsed tags; scripts belong in <script> elements.
    if (lower.startsWith('on')) continue
    if (lower === 'dangerouslysetinnerhtml' || lower === 'children' || lower === 'key') continue

    if (
      !allowDataAndAria &&
      (lower.startsWith('data-') || lower.startsWith('aria-'))
    ) {
      continue
    }

    const propName =
      lower.startsWith('data-') || lower.startsWith('aria-')
        ? lower
        : (REACT_ATTR_MAP[lower] ?? lower)

    const hasExplicitValue =
      match[2] !== undefined || match[3] !== undefined || match[4] !== undefined
    const rawVal = match[2] ?? match[3] ?? match[4] ?? ''
    const decoded = decodeHtmlEntities(rawVal)

    if ((lower === 'href' || lower === 'src') && UNSAFE_PROTOCOL_RE.test(decoded)) {
      continue
    }

    if (!hasExplicitValue && BOOLEAN_HTML_ATTRS.has(propName)) {
      attrs[propName] = true
    } else if (BOOLEAN_HTML_ATTRS.has(propName) && decoded.toLowerCase() === 'false') {
      attrs[propName] = false
    } else if (BOOLEAN_HTML_ATTRS.has(propName) && (decoded === '' || decoded.toLowerCase() === lower)) {
      attrs[propName] = true
    } else {
      attrs[propName] = decoded
    }
  }

  return attrs
}

export type ParsedScriptDescriptor = {
  id: string
  src?: string
  inlineCode: string
  attributes: ParsedReactAttributes
}

export type ParsedStyleDescriptor = {
  id: string
  css: string
  attributes: ParsedReactAttributes
}

export type ParsedTagDescriptor = {
  id: string
  attributes: ParsedReactAttributes
}

export type ParsedHeadSnippet = {
  metas: ParsedTagDescriptor[]
  links: ParsedTagDescriptor[]
  styles: ParsedStyleDescriptor[]
  scripts: ParsedScriptDescriptor[]
}

export function parseHeadHtmlSnippet(rawHtml: string | null | undefined): ParsedHeadSnippet {
  const empty: ParsedHeadSnippet = { metas: [], links: [], styles: [], scripts: [] }
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) return empty

  const withoutComments = rawHtml.replace(/<!--[\s\S]*?-->/g, '')
  const metas: ParsedTagDescriptor[] = []
  const links: ParsedTagDescriptor[] = []
  const styles: ParsedStyleDescriptor[] = []
  const scripts: ParsedScriptDescriptor[] = []

  let remaining = withoutComments.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_full, attrPart: string, bodyPart: string) => {
      const css = sanitizeStyleContent(bodyPart)
      if (css) {
        const attributes = parseHtmlAttributes(attrPart)
        styles.push({
          id: `pocms-head-style-${stableSnippetHash(`${attrPart}:${css}`)}-${styles.length}`,
          css,
          attributes,
        })
      }
      return ''
    },
  )

  remaining = remaining.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (_full, attrPart: string, bodyPart: string) => {
      const attributes = parseHtmlAttributes(attrPart)
      const src = typeof attributes.src === 'string' ? attributes.src.trim() : undefined
      delete attributes.src
      const inlineCode = sanitizeInlineScriptContent(bodyPart)
      if (src || inlineCode) {
        scripts.push({
          id: `pocms-head-script-${stableSnippetHash(`${src ?? ''}:${attrPart}:${inlineCode}`)}-${scripts.length}`,
          ...(src ? { src } : {}),
          inlineCode,
          attributes,
        })
      }
      return ''
    },
  )

  const metaRegex = /<meta\b([^>]*?)\/?>/gi
  let metaMatch: RegExpExecArray | null
  while ((metaMatch = metaRegex.exec(remaining)) !== null) {
    const attrPart = metaMatch[1] ?? ''
    const attributes = parseHtmlAttributes(attrPart)
    if (Object.keys(attributes).length > 0) {
      metas.push({
        id: `pocms-head-meta-${stableSnippetHash(attrPart)}-${metas.length}`,
        attributes,
      })
    }
  }

  const linkRegex = /<link\b([^>]*?)\/?>/gi
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkRegex.exec(remaining)) !== null) {
    const attrPart = linkMatch[1] ?? ''
    const attributes = parseHtmlAttributes(attrPart)
    if (typeof attributes.href === 'string' && attributes.href.trim()) {
      links.push({
        id: `pocms-head-link-${stableSnippetHash(attrPart)}-${links.length}`,
        attributes,
      })
    }
  }

  return { metas, links, styles, scripts }
}

export type SplitHtmlResult = {
  htmlWithoutScripts: string
  scripts: ParsedScriptDescriptor[]
}

export function splitHtmlAndScripts(
  rawHtml: string | null | undefined,
  extraJs?: string | null,
  prefix = 'pocms-slot',
): SplitHtmlResult {
  const scripts: ParsedScriptDescriptor[] = []
  let htmlWithoutScripts = ''

  if (typeof rawHtml === 'string' && rawHtml.trim()) {
    const stripped = rawHtml.replace(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      (_full, attrPart: string, bodyPart: string) => {
        const attributes = parseHtmlAttributes(attrPart)
        const src = typeof attributes.src === 'string' ? attributes.src.trim() : undefined
        delete attributes.src
        const inlineCode = sanitizeInlineScriptContent(bodyPart)
        if (src || inlineCode) {
          scripts.push({
            id: `${prefix}-script-${stableSnippetHash(`${src ?? ''}:${attrPart}:${inlineCode}`)}-${scripts.length}`,
            ...(src ? { src } : {}),
            inlineCode,
            attributes,
          })
        }
        return ''
      },
    )
    htmlWithoutScripts = stripped.trim()
  }

  const standaloneJs = sanitizeInlineScriptContent(extraJs)
  if (standaloneJs) {
    scripts.push({
      id: `${prefix}-js-${stableSnippetHash(standaloneJs)}-${scripts.length}`,
      inlineCode: standaloneJs,
      attributes: {},
    })
  }

  return { htmlWithoutScripts, scripts }
}

export function hasAnyCustomCodeConfigured(config: CustomCodeContent | null | undefined): boolean {
  if (!config || !config.enabled) return false
  if (config.metaTags.some((t) => t.enabled && t.key && t.content)) return true
  if (config.linkTags.some((l) => l.enabled && l.rel && l.href)) return true
  if (config.headCode.enabled && config.headCode.html.trim().length > 0) return true
  if (config.customCss.enabled && config.customCss.css.trim().length > 0) return true
  if (
    config.afterFooter.enabled &&
    (config.afterFooter.html.trim().length > 0 || config.afterFooter.js.trim().length > 0)
  ) {
    return true
  }
  if (config.bodyStart.enabled && config.bodyStart.html.trim().length > 0) return true
  if (
    config.bodyEnd.enabled &&
    (config.bodyEnd.html.trim().length > 0 || config.bodyEnd.js.trim().length > 0)
  ) {
    return true
  }
  return false
}

type RawRecord = Record<string, unknown>

const asRecord = (val: unknown): RawRecord | null =>
  val && typeof val === 'object' && !Array.isArray(val) ? (val as RawRecord) : null

const asTrimmedString = (val: unknown): string => (typeof val === 'string' ? val.trim() : '')

const asRawCodeString = (val: unknown): string => (typeof val === 'string' ? val : '')

const asBool = (val: unknown, fallback: boolean): boolean =>
  typeof val === 'boolean' ? val : fallback

/**
 * Pure mapper from a Payload `custom-code` global document to `CustomCodeContent`.
 * Gracefully falls back to empty defaults when unseeded.
 */
export function mapCustomCode(rawDoc: unknown): CustomCodeContent {
  const doc = asRecord(rawDoc)
  if (!doc) return DEFAULT_CUSTOM_CODE

  const rawMetaTags = Array.isArray(doc.metaTags) ? doc.metaTags : []
  const metaTags: CustomMetaTagItem[] = rawMetaTags
    .map((entry, idx): CustomMetaTagItem | null => {
      const row = asRecord(entry)
      if (!row) return null
      const key = asTrimmedString(row.key)
      const content = typeof row.content === 'string' ? row.content : ''
      if (!key || !META_KEY_SAFE_RE.test(key) || !content) return null
      const attrRaw = asTrimmedString(row.attribute)
      const attribute: CustomMetaAttributeType =
        attrRaw === 'property' || attrRaw === 'http-equiv' ? attrRaw : 'name'
      return {
        id: asTrimmedString(row.id) || `meta-${idx}`,
        enabled: asBool(row.enabled, true),
        attribute,
        key,
        content,
        scope: normalizeScope(row.scope),
      }
    })
    .filter((item): item is CustomMetaTagItem => item !== null)

  const rawLinkTags = Array.isArray(doc.linkTags) ? doc.linkTags : []
  const linkTags: CustomLinkTagItem[] = rawLinkTags
    .map((entry, idx): CustomLinkTagItem | null => {
      const row = asRecord(entry)
      if (!row) return null
      const rel = asTrimmedString(row.rel)
      const href = asTrimmedString(row.href)
      if (!rel || !href || UNSAFE_PROTOCOL_RE.test(href)) return null
      const asVal = asTrimmedString(row.as)
      const typeVal = asTrimmedString(row.type)
      const crossRaw = asTrimmedString(row.crossOrigin)
      const crossOrigin: '' | 'anonymous' | 'use-credentials' =
        crossRaw === 'anonymous' || crossRaw === 'use-credentials' ? crossRaw : ''
      return {
        id: asTrimmedString(row.id) || `link-${idx}`,
        enabled: asBool(row.enabled, true),
        rel,
        href,
        ...(asVal ? { as: asVal } : {}),
        ...(typeVal ? { type: typeVal } : {}),
        ...(crossOrigin ? { crossOrigin } : {}),
        scope: normalizeScope(row.scope),
      }
    })
    .filter((item): item is CustomLinkTagItem => item !== null)

  const headCodeRec = asRecord(doc.headCode)
  const customCssRec = asRecord(doc.customCss)
  const afterFooterRec = asRecord(doc.afterFooter)
  const bodyStartRec = asRecord(doc.bodyStart)
  const bodyEndRec = asRecord(doc.bodyEnd)
  const strategyRaw = asTrimmedString(bodyEndRec?.strategy)

  return {
    enabled: asBool(doc.enabled, true),
    skipInPreview: asBool(doc.skipInPreview, true),
    metaTags,
    linkTags,
    headCode: {
      enabled: asBool(headCodeRec?.enabled, true),
      scope: normalizeScope(headCodeRec?.scope),
      html: asRawCodeString(headCodeRec?.html),
    },
    customCss: {
      enabled: asBool(customCssRec?.enabled, true),
      scope: normalizeScope(customCssRec?.scope),
      css: asRawCodeString(customCssRec?.css),
    },
    afterFooter: {
      enabled: asBool(afterFooterRec?.enabled, true),
      scope: normalizeScope(afterFooterRec?.scope),
      html: asRawCodeString(afterFooterRec?.html),
      js: asRawCodeString(afterFooterRec?.js),
    },
    bodyStart: {
      enabled: asBool(bodyStartRec?.enabled, true),
      scope: normalizeScope(bodyStartRec?.scope),
      html: asRawCodeString(bodyStartRec?.html),
    },
    bodyEnd: {
      enabled: asBool(bodyEndRec?.enabled, true),
      scope: normalizeScope(bodyEndRec?.scope),
      strategy: strategyRaw === 'lazyOnload' ? 'lazyOnload' : 'afterInteractive',
      html: asRawCodeString(bodyEndRec?.html),
      js: asRawCodeString(bodyEndRec?.js),
    },
  }
}
