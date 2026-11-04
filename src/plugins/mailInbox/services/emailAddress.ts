import crypto from 'node:crypto'

import type { ParsedEmailAddress } from '../types'

const EMAIL_SIMPLE_RE = /^[^\s<>@,"]+@[^\s<>@,"]+\.[^\s<>@,"]+$/

/** Strips CR/LF/NUL characters to prevent RFC 5322 header injection. */
export function stripHeaderControlChars(value: string): string {
  return value.replace(/[\r\n\0]+/g, ' ').trim()
}

/**
 * Parses a single RFC 5322 mailbox string (`"Jane Doe" <jane@example.com>` or `jane@example.com`)
 * into `{ name, address }` with a normalized lowercase address.
 */
export function parseEmailAddress(raw: string | null | undefined): ParsedEmailAddress {
  const cleaned = stripHeaderControlChars(String(raw ?? ''))
  if (!cleaned) return { name: '', address: '' }

  const angleMatch = cleaned.match(/^(.*?)<\s*([^<>]+)\s*>$/)
  if (angleMatch) {
    const rawName = angleMatch[1]
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1')
      .replace(/\\"/g, '"')
      .trim()
    const addr = angleMatch[2].trim().toLowerCase()
    return {
      name: rawName,
      address: addr,
    }
  }

  const lower = cleaned.toLowerCase()
  if (EMAIL_SIMPLE_RE.test(lower)) {
    return { name: '', address: lower }
  }

  return { name: cleaned, address: '' }
}

/** Splits a comma-separated RFC 5322 address list while respecting quoted display names. */
export function splitMailboxList(raw: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      current += ch
      escaped = true
      continue
    }
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
      continue
    }
    if ((ch === ',' || ch === ';') && !inQuotes) {
      const trimmed = current.trim()
      if (trimmed) parts.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }

  const tail = current.trim()
  if (tail) parts.push(tail)
  return parts
}

export function parseAddressList(
  input: string | readonly string[] | readonly ParsedEmailAddress[] | null | undefined,
): ParsedEmailAddress[] {
  if (!input) return []
  const items: ParsedEmailAddress[] = []

  const pushRaw = (val: string) => {
    for (const token of splitMailboxList(val)) {
      const parsed = parseEmailAddress(token)
      if (parsed.address || parsed.name) {
        items.push(parsed)
      }
    }
  }

  if (typeof input === 'string') {
    pushRaw(input)
  } else if (Array.isArray(input)) {
    for (const entry of input) {
      if (typeof entry === 'string') {
        pushRaw(entry)
      } else if (entry && typeof entry === 'object' && 'address' in entry) {
        const addr = stripHeaderControlChars(String(entry.address ?? '')).toLowerCase()
        const name = stripHeaderControlChars(String(entry.name ?? ''))
        if (addr || name) items.push({ name, address: addr })
      }
    }
  }

  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.address || item.name.toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isValidEmailAddress(email: string | null | undefined): boolean {
  if (!email) return false
  return EMAIL_SIMPLE_RE.test(email.trim().toLowerCase())
}

/** Formats `{ name, address }` into an injection-safe RFC 5322 mailbox string. */
export function formatAddressHeader(input: ParsedEmailAddress): string {
  const address = stripHeaderControlChars(input.address).toLowerCase()
  const name = stripHeaderControlChars(input.name)
  if (!name) return address
  if (/^[A-Za-z0-9 ._-]+$/.test(name)) {
    return `${name} <${address}>`
  }
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}" <${address}>`
}

/** Normalizes an RFC 5322 Message-ID (`<abc@domain>` -> `<abc@domain>`). */
export function normalizeMessageId(raw: string | null | undefined): string {
  const cleaned = stripHeaderControlChars(String(raw ?? ''))
  if (!cleaned) return ''
  const match = cleaned.match(/<([^<>\s]+)>/)
  if (match) return `<${match[1]}>`
  if (/^[^\s<>]+@[^\s<>]+$/.test(cleaned)) {
    return `<${cleaned}>`
  }
  return cleaned
}

/** Extracts an ordered, deduplicated list of `<message-id>` tokens from a `References` header. */
export function parseReferencesHeader(
  raw: string | readonly string[] | null | undefined,
): string[] {
  if (!raw) return []
  const source = Array.isArray(raw) ? raw.join(' ') : String(raw)
  const matches = source.match(/<[^<>\s]+>|[^\s,<>]+@[^\s,<>]+/g) ?? []
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of matches) {
    const norm = normalizeMessageId(token)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      result.push(norm)
    }
  }
  return result
}

/** Builds an RFC 5322 `References` chain capped at 20 IDs (preserving root + recent tail). */
export function buildReplyReferencesChain(
  parentReferences: readonly string[],
  parentMessageId: string | null | undefined,
): string[] {
  const chain = [...parseReferencesHeader(parentReferences)]
  const normParent = normalizeMessageId(parentMessageId)
  if (normParent && !chain.includes(normParent)) {
    chain.push(normParent)
  }
  if (chain.length <= 20) return chain
  return [chain[0], ...chain.slice(-19)]
}

/** Generates a globally unique RFC 5322 `Message-ID` anchored to the sender domain. */
export function generateRfcMessageId(fromEmail: string): string {
  const domain = extractEmailDomain(fromEmail) || 'pocms.local'
  const rand = crypto.randomBytes(10).toString('hex')
  return `<pocms.${Date.now().toString(36)}.${rand}@${domain}>`
}

export function extractEmailDomain(email: string | null | undefined): string {
  const parsed = parseEmailAddress(email)
  const addr = parsed.address || String(email ?? '').trim().toLowerCase()
  const atIdx = addr.lastIndexOf('@')
  if (atIdx < 0) return ''
  return addr.slice(atIdx + 1).replace(/[^a-z0-9.-]/g, '')
}
