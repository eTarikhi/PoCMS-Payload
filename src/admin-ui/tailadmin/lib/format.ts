/**
 * Pure, timezone-stable formatting helpers for the TailAdmin pilot surfaces.
 *
 * Everything here is deterministic and side-effect free so it can be unit
 * tested (`tests/int/admin-ui.int.spec.ts`) and reused from both server and
 * client components.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `1234567` -> `1,234,567` (or `1.234.567` for `de-DE`, etc.) */
export function formatCount(value: number | null | undefined, locale = 'en-US'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale).format(Math.round(value))
}

/** `1234567` -> `1.2M`. Used for KPI tiles on narrow screens. */
export function formatCompact(value: number | null | undefined, locale = 'en-US'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    Math.round(value),
  )
}

/**
 * Percentage delta between two totals.
 * Returns `null` when there is no meaningful baseline (previous === 0).
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** `12.3456` -> `12.3%`. `null` renders as an em dash. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

/** UTC month key: `2026-10-12` -> `2026-10`. */
export function monthKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** `2026-10` -> `Oct 26`. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const index = Number(month) - 1
  if (Number.isNaN(index) || index < 0 || index > 11) return key
  return `${MONTHS[index]} ${year.slice(2)}`
}

/**
 * The last `months` month keys (inclusive of `endDate`'s month), oldest first.
 * Always returns exactly `months` entries — months with no content are zero
 * filled by the caller.
 */
export function buildMonthRange(months: number, endDate: Date = new Date()): string[] {
  const keys: string[] = []
  const cursor = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1, 0, 0, 0, 0),
  )
  for (let i = 0; i < months; i += 1) {
    keys.unshift(monthKey(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }
  return keys
}

/** First millisecond (UTC) of the month a key points at. */
export function monthStart(key: string): Date {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
}

/** First millisecond (UTC) of the month *after* the one a key points at. */
export function monthEnd(key: string): Date {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
}

/** `2026-10-12T09:30:00Z` -> `3 hours ago` / `in 2 days`. */
export function relativeTime(date: Date | string | null | undefined, now: Date = new Date()): string {
  if (!date) return '—'
  const target = typeof date === 'string' ? new Date(date) : date
  const diffMs = target.getTime() - now.getTime()
  if (Number.isNaN(diffMs)) return '—'

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ]

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit)
    }
  }
  return 'just now'
}

/** `2026-10-12` -> `12 Oct 2026`. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** `articles` -> `Articles`, `media-with-prefix` -> `Media With Prefix`. */
export function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Payload labels can be a plain string, a locale map, or a function.
 * Only serialisable shapes are usable here — functions fall back to the slug.
 */
export function labelToString(
  label: unknown,
  fallback: string,
  locale?: string,
): string {
  if (typeof label === 'string' && label.trim().length > 0) return label
  if (label && typeof label === 'object') {
    const map = label as Record<string, unknown>
    const candidates = [locale ? map[locale] : undefined, map.en, Object.values(map)[0]]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
    }
  }
  return titleFromSlug(fallback)
}

/** `Vahid Tarikhi` / `dev@vtarikhi.com` -> `VT` / `DE`. */
export function initials(value: string | null | undefined): string {
  if (!value) return '?'
  const cleaned = value.trim()
  if (!cleaned) return '?'
  if (cleaned.includes('@')) return cleaned.slice(0, 2).toUpperCase()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}
