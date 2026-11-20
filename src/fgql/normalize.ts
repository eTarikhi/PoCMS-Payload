/**
 * Normalizes Payload GraphQL responses back into the document shapes expected by the existing
 * portfolio and CMS form mappers (`src/app/(frontend)/lib/mappers.ts`, `forms-types.ts`,
 * `redirects-utils.ts`).
 *
 * Specifically:
 * 1. Strips `__typename` keys.
 * 2. Restores inline-fragment field aliases (`Text_defaultValue -> defaultValue`,
 *    `Article_slug -> slug`) needed where GraphQL union members declare conflicting scalar types
 *    (for example `Form_Fields` `Checkbox.defaultValue: Boolean` vs `Text.defaultValue: String`).
 * 3. Injects `blockType` (lowercased `__typename`) on `Form_Fields` union objects when omitted.
 * 4. Restores Payload's `formatName`-encoded GraphQL enum option values back to their stored string
 *    values (`front_end -> front-end`, `text_white -> text-white`, `_301 -> 301`, etc.).
 */

const FORM_FIELD_TYPENAMES = new Set([
  'Checkbox',
  'Email',
  'Message',
  'Number',
  'Select',
  'Text',
  'Textarea',
])

const ENUM_VALUE_RESTORATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  categories: {
    front_end: 'front-end',
    back_end: 'back-end',
    cms_crm: 'cms-crm',
  },
  type: {
    _301: '301',
    _302: '302',
  },
  backgroundPreset: {
    chromatic_cover: 'chromatic-cover',
    aurora_grain: 'aurora-grain',
    blueprint_spotlight: 'blueprint-spotlight',
    constellation_canvas: 'constellation-canvas',
    obsidian_minimal: 'obsidian-minimal',
  },
  accentTone: {
    gold_copper: 'gold-copper',
    amber_slate: 'amber-slate',
    cyan_gold: 'cyan-gold',
  },
  className: {
    text_white: 'text-white',
    text_primary: 'text-primary',
    text_secondary: 'text-secondary',
    text_success: 'text-success',
    text_info: 'text-info',
    text_warning: 'text-warning',
    text_danger: 'text-danger',
  },
}

const restoreEnumValueForKey = (key: string | null, value: unknown): unknown => {
  if (!key) return value
  const mapping = ENUM_VALUE_RESTORATIONS[key]
  if (!mapping) return value
  if (typeof value === 'string') {
    return mapping[value] ?? value
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? (mapping[item] ?? item) : item))
  }
  return value
}

const normalizeNode = (value: unknown, parentKey: string | null): unknown => {
  if (Array.isArray(value)) {
    const normalizedItems = value.map((item) => normalizeNode(item, null))
    return restoreEnumValueForKey(parentKey, normalizedItems)
  }

  if (!value || typeof value !== 'object') {
    return restoreEnumValueForKey(parentKey, value)
  }

  const record = value as Record<string, unknown>
  const typename = typeof record.__typename === 'string' ? record.__typename : null
  const aliasPrefix = typename ? `${typename}_` : null
  const output: Record<string, unknown> = {}

  if (typename && FORM_FIELD_TYPENAMES.has(typename) && typeof record.blockType !== 'string') {
    output.blockType = typename.toLowerCase()
  }

  for (const [rawKey, rawVal] of Object.entries(record)) {
    if (rawKey === '__typename') continue
    const restoredKey =
      aliasPrefix && rawKey.startsWith(aliasPrefix) ? rawKey.slice(aliasPrefix.length) : rawKey
    output[restoredKey] = normalizeNode(rawVal, restoredKey)
  }

  return output
}

export const normalizeGraphQLUnionAliases = <T>(value: T): T => normalizeNode(value, null) as T
