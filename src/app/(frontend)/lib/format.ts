/**
 * Display formatting helpers.
 *
 * Dates in Payload are stored as ISO timestamps. The original vTarikhi site
 * shows plain strings such as "January 9, 2025". Formatting uses UTC so that
 * a date-only value does not shift to the previous day in negative-offset
 * time zones.
 */

const monthDayYear = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Formats an ISO date string or Date as "MMMM d, yyyy" in UTC.
 * Returns an empty string for empty or invalid input.
 *
 * @example formatDisplayDate('2025-02-02T12:00:00.000Z') // "February 2, 2025"
 */
export const formatDisplayDate = (value: string | Date | null | undefined): string => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return monthDayYear.format(date)
}

/**
 * Formats a read time in minutes as "<n> min".
 * Returns an empty string when the value is missing or not positive.
 *
 * @example formatReadTime(3) // "3 min"
 */
export const formatReadTime = (minutes: number | null | undefined): string => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return ''
  return `${minutes} min`
}

/**
 * Joins non-empty parts with the separator used by the original education rows.
 *
 * @example joinDisplay(['Payam-e Nur University', 'Tabriz, Iran']) // "Payam-e Nur University / Tabriz, Iran"
 */
export const joinDisplay = (parts: Array<string | null | undefined>, separator = ' / '): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(separator)
