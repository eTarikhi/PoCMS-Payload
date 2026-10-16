import { DEFAULT_LOCALE, LOCALE_DETAILS, type Locale } from '@/i18n/locales'

/**
 * Display formatting helpers.
 *
 * Dates in Payload are stored as ISO timestamps. Formatting uses UTC so that a date-only value
 * does not shift to the previous day in negative-offset time zones. Both date and number output
 * are keyed by the requested public locale.
 */

const dateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(LOCALE_DETAILS.en.dateLocale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  fa: new Intl.DateTimeFormat(LOCALE_DETAILS.fa.dateLocale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }),
}

const numberFormatters: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(LOCALE_DETAILS.en.dateLocale),
  fa: new Intl.NumberFormat(LOCALE_DETAILS.fa.dateLocale),
}

/**
 * Formats an ISO date string or Date in the requested locale.
 * Returns an empty string for empty or invalid input.
 */
export const formatDisplayDate = (
  value: string | Date | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return dateFormatters[locale].format(date)
}

/** Formats a read time in minutes in the requested locale. */
export const formatReadTime = (
  minutes: number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return ''

  const value = numberFormatters[locale].format(minutes)
  return locale === 'fa' ? `${value} دقیقه` : `${value} min`
}

/** Joins non-empty parts with the separator used by the original education rows. */
export const joinDisplay = (parts: Array<string | null | undefined>, separator = ' / '): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(separator)
